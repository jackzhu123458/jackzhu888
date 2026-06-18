import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

/**
 * OCR 接口 — 本地离线模式
 *
 * 使用系统 tesseract 命令行工具进行文字识别，再用正则解析采购订单结构。
 * 完全离线运行，不依赖任何 CDN 或云端服务。
 */

// ── 类型定义 ──
interface OcrItem {
  material_code: string;
  material_name: string;
  quantity: number;
  unit: string;
  delivery_date: string;
}

interface OcrResult {
  order_no: string;
  order_date: string;
  delivery_deadline: string;
  customer_code: string;
  customer_name: string;
  items: OcrItem[];
}

/**
 * 调用系统 tesseract 命令行工具识别图片
 */
function runTesseract(imagePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // 15 秒超时
    const timer = setTimeout(() => {
      reject(new Error('OCR 超时（15s）'));
    }, 15000);

    exec(
      `tesseract "${imagePath}" stdout -l chi_sim+eng 2>/dev/null`,
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        clearTimeout(timer);
        if (error) {
          reject(new Error(`tesseract 执行失败: ${error.message}`));
        } else {
          resolve(stdout || '');
        }
      }
    );
  });
}

/**
 * 从 OCR 原始文本中解析采购订单结构
 */
function parseOrderFromText(rawText: string): OcrResult {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const result: OcrResult = {
    order_no: '',
    order_date: '',
    delivery_deadline: '',
    customer_code: '',
    customer_name: '',
    items: [],
  };

  // ── 提取订单编号 ──
  for (const line of lines) {
    const m = line.match(/(?:订单号|单号|订单编号|PO|No\.?)\s*[:：#]?\s*([A-Za-z0-9\-_\/]+)/i);
    if (m && m[1] && m[1].length >= 2) {
      result.order_no = m[1];
      break;
    }
  }

  // ── 提取订单日期 ──
  for (const line of lines) {
    const m = line.match(/(?:订单日期|日期|Date)\s*[:：]?\s*(\d{4}[\/\-.年]\d{1,2}[\/\-.月]\d{1,2})/i);
    if (m) {
      result.order_date = normalizeDate(m[1]);
      break;
    }
  }

  // ── 提取交货日期 ──
  const allDates: string[] = [];
  for (const line of lines) {
    const m = line.match(/(?:交货|送货|delivery|due)\s*(?:日期|date|期)?\s*[:：]?\s*(\d{4}[\/\-.年]\d{1,2}[\/\-.月]\d{1,2})/i);
    if (m) {
      const d = normalizeDate(m[1]);
      if (d) allDates.push(d);
    }
  }
  if (allDates.length > 0) {
    result.delivery_deadline = allDates[allDates.length - 1];
  }

  // ── 提取客户信息 ──
  for (const line of lines) {
    const m = line.match(/(?:客户|customer|供应商|supplier)\s*[:：]?\s*(.+)/i);
    if (m && m[1] && m[1].trim().length >= 2) {
      result.customer_name = m[1].trim();
      break;
    }
  }

  // ── 提取物料明细 ──
  // 匹配包含编码 + 数量的行
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 尝试匹配: 物料编码 数量 [单价] [日期]
    // 常见格式: "A001 产品名称 100 个 2024-01-15"
    // 或者: "编码: A001 名称: xxx 数量: 100"
    const codeMatch = line.match(/([A-Z][A-Za-z0-9\-_]{2,20})/);
    const qtyMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:个|件|套|pcs|PCS|kg|KG|米|m|条|台)?/g);

    if (codeMatch && qtyMatch && qtyMatch.length >= 2) {
      const code = codeMatch[1];
      const lastQty = qtyMatch[qtyMatch.length - 1].match(/(\d+(?:\.\d+)?)/);
      if (lastQty) {
        const qty = parseFloat(lastQty[1]);

        // 查找日期
        let dateStr = '';
        const dateMatch = line.match(/(\d{4}[\/\-.年]\d{1,2}[\/\-.月]\d{1,2})/);
        if (dateMatch) {
          dateStr = normalizeDate(dateMatch[1]);
        }

        // 提取物料名称（编码和数量之间的文字）
        const codeIdx = line.indexOf(code);
        const qtyIdx = line.indexOf(lastQty[0]);
        let name = '';
        if (codeIdx >= 0 && qtyIdx > codeIdx) {
          name = line.substring(codeIdx + code.length, qtyIdx).trim().replace(/^[\s:：\-]+/, '').trim();
        }

        result.items.push({
          material_code: code,
          material_name: name || '',
          quantity: qty,
          unit: '',
          delivery_date: dateStr,
        });
      }
    }
  }

  return result;
}

/**
 * 标准化日期格式为 YYYY-MM-DD
 */
function normalizeDate(input: string): string {
  const m = input.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  if (!m) return input;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: '缺少图片数据' }, { status: 400 });
    }

    // 解析 base64
    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // 写入临时文件
    const tmpDir = join(tmpdir(), 'ocr-temp');
    await mkdir(tmpDir, { recursive: true });
    const imagePath = join(tmpDir, `ocr-${randomUUID()}.png`);
    await writeFile(imagePath, imageBuffer);

    try {
      // 调用系统 tesseract 识别
      const rawText = await runTesseract(imagePath);

      if (!rawText || rawText.trim().length === 0) {
        return NextResponse.json({
          success: false,
          error: '未能识别到文字，请确保图片清晰且包含中文/英文内容',
        });
      }

      // 解析订单结构
      const order = parseOrderFromText(rawText);

      return NextResponse.json({
        success: true,
        rawText,
        order,
      });
    } finally {
      // 清理临时文件
      await unlink(imagePath).catch(() => {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR 识别失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
