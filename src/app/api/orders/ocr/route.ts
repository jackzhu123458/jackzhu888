import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { writeFile, mkdir, unlink } from 'fs/promises';
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
 * --psm 6: 假设为统一文本块，适合表格
 */
function runTesseract(imagePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('OCR 超时（30s）'));
    }, 30000);

    exec(
      `tesseract "${imagePath}" stdout -l chi_sim+eng --psm 6 2>/dev/null`,
      { maxBuffer: 20 * 1024 * 1024 },
      (error, stdout) => {
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
 * 标准化日期格式为 YYYY-MM-DD
 */
function normalizeDate(input: string): string {
  const m = input.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  if (!m) return input;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/**
 * 清理 OCR 文本中的常见噪声
 */
function cleanLine(line: string): string {
  return line
    .replace(/\r/g, '')
    .replace(/\|/g, ' ')  // 表格竖线变空格
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 从 OCR 原始文本中解析采购订单结构
 *
 * 针对常州恒益电机采购订单格式优化：
 * - 物料编号格式: 30.113.01.0025 (数字+点号)
 * - 表格行: 序号 物料编号 物料描述 数量 单位 交货日期 备注
 */
function parseOrderFromText(rawText: string): OcrResult {
  const lines = rawText
    .split('\n')
    .map(cleanLine)
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
  // 匹配 "订单编号" "OrderNo." "单号" 后面的数字
  for (const line of lines) {
    // 44836 纯数字订单号
    const m1 = line.match(/(?:订单编号|订单号|单号|Order\s*No\.?)\s*[:：.]?\s*(\d{3,})/i);
    if (m1) {
      result.order_no = m1[1];
      break;
    }
    // PO-44836 带前缀
    const m2 = line.match(/(?:PO|订单)\s*[:：#]?\s*([A-Za-z0-9\-_]{3,})/i);
    if (m2 && !result.order_no) {
      result.order_no = m2[1];
      break;
    }
  }

  // ── 提取订单日期 ──
  for (const line of lines) {
    const m = line.match(/(?:订单日期|Order\s*Date|日期)\s*[:：.]?\s*(\d{4}[\/\-.年]\d{1,2}[\/\-.月]\d{1,2})/i);
    if (m) {
      result.order_date = normalizeDate(m[1]);
      break;
    }
  }

  // ── 提取交货日期 ──
  for (const line of lines) {
    const m = line.match(/(?:交货日期|Delivery\s*Dat|交货)\s*[:：.]?\s*(\d{4}[\/\-.年]\d{1,2}[\/\-.月]\d{1,2})/i);
    if (m) {
      result.delivery_deadline = normalizeDate(m[1]);
      break;
    }
  }

  // ── 提取供应商信息 ──
  for (const line of lines) {
    // 供应商: 常州市武进横林新顺电器配件厂
    const m = line.match(/(?:供应商|Vendor|Supplier)\s*[:：.]?\s*(.+)/i);
    if (m && m[1] && m[1].trim().length >= 4) {
      const name = m[1].trim();
      // 去掉后面的其他字段
      result.customer_name = name.split(/\s{2,}|联系电话|电话|传真|邮箱/)[0].trim();
      break;
    }
  }

  // 供应商编码: S0080
  for (const line of lines) {
    const m = line.match(/(?:供应商编码|Supplier\s*Code)\s*[:：.]?\s*([A-Z0-9]+)/i);
    if (m) {
      result.customer_code = m[1];
      break;
    }
  }

  // 如果没匹配到供应商名，尝试匹配公司名
  if (!result.customer_name) {
    for (const line of lines) {
      if (line.includes('新顺电器') || line.includes('配件厂')) {
        result.customer_name = line.substring(0, 40);
        break;
      }
    }
  }

  // ── 提取物料明细 ──
  // 物料编号格式: 30.113.01.0025 或 40.045.01.0036 (2位.3位.2位.4位)
  // 也可能是其他格式如 G22x0 等
  const materialCodePattern = /(\d{2,}\.\d{2,}\.\d{2,}\.\d{2,})/;
  // 通用物料编码模式（字母+数字组合，至少3位）
  const generalCodePattern = /([A-Z][A-Z0-9x\-]{2,15})/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // 跳过表头行
    if (/(物料编号|物料描述|物料编码|Material|序号|#.*qty)/i.test(line) && line.length < 30) {
      continue;
    }
    // 跳过标题行
    if (/(采购订单|Purchase Order|常州恒益|电机股份)/i.test(line) && line.length < 30) {
      continue;
    }

    // 尝试匹配标准物料编码 (30.113.01.0025 格式)
    const codeMatch = line.match(materialCodePattern);
    // 或者通用编码
    const generalMatch = !codeMatch ? line.match(generalCodePattern) : null;
    const codeResult = codeMatch || generalMatch;

    if (!codeResult) continue;

    const code = codeResult[1];
    const codeStart = line.indexOf(code);
    const afterCode = line.substring(codeStart + code.length).trim();

    // 提取数量: 可能带逗号 "10,000" 或纯数字 "5000"
    // 数量通常在描述后面，后面跟着单位
    const qtyMatch = afterCode.match(/(\d[\d,]*\.?\d*)\s*(?:个|件|套|pcs|PCS|kg|KG|米|m|条|台|只|根|对|副)?/);

    if (!qtyMatch) continue;

    const qtyStr = qtyMatch[1].replace(/,/g, '');
    const qty = parseFloat(qtyStr);
    if (isNaN(qty) || qty <= 0) continue;

    // 提取物料名称: 编码和数量之间的文字
    const qtyStart = afterCode.indexOf(qtyMatch[1]);
    let name = afterCode.substring(0, qtyStart).trim();

    // 清理名称中的前导符号
    name = name.replace(/^[\s:：\-—|]+/, '').trim();

    // 如果名称为空，尝试用下一行
    if (!name && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      // 下一行不是新的物料行时，用作名称
      if (!materialCodePattern.test(nextLine) && !generalCodePattern.test(nextLine) && nextLine.length > 2) {
        name = nextLine.substring(0, 40);
      }
    }

    // 提取日期
    let dateStr = '';
    const dateMatch = line.match(/(\d{4}[\/\-.年]\d{1,2}[\/\-.月]\d{1,2})/);
    if (dateMatch) {
      dateStr = normalizeDate(dateMatch[1]);
    }

    // 提取单位
    const unitMatch = afterCode.match(/(?:个|件|套|pcs|PCS|kg|KG|米|m|条|台|只|根|对|副)/i);
    const unit = unitMatch ? unitMatch[0] : '';

    result.items.push({
      material_code: code,
      material_name: name,
      quantity: qty,
      unit,
      delivery_date: dateStr,
    });
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    // 兼容 FormData 和 JSON 两种提交方式
    let imageBase64 = '';
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('image') as File | null;
      if (!file) {
        return NextResponse.json({ error: '缺少图片文件' }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      imageBase64 = Buffer.from(arrayBuffer).toString('base64');
    } else {
      const body = await request.json();
      const { image } = body;
      if (!image || typeof image !== 'string') {
        return NextResponse.json({ error: '缺少图片数据' }, { status: 400 });
      }
      imageBase64 = image.includes(',') ? image.split(',')[1] : image;
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');

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
        data: order,
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
