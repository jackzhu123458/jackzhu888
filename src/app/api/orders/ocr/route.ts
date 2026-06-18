import { NextRequest, NextResponse } from 'next/server';

/**
 * OCR 接口 — 本地离线模式
 *
 * 使用 Tesseract.js 进行文字识别，再用正则解析采购订单结构。
 * 不依赖任何云端服务，完全在本地 Docker 容器中运行。
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
 * 用 Tesseract.js 识别图片中的文字（中英文）
 */
async function extractTextWithTesseract(imageBuffer: Buffer): Promise<string> {
  // 动态 import，避免开发环境加载拖慢启动
  const { createWorker } = await import('tesseract.js');

  const langPath = process.env.TESSERACT_LANG_PATH || undefined;

  const worker = await createWorker(['chi_sim', 'eng'], 1, {
    langPath: langPath || undefined,
    logger: () => {}, // 静默
  });

  try {
    // 30 秒超时保护，防止卡死
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('OCR 超时（30s）')), 30000)
    );
    const { data } = await Promise.race([
      worker.recognize(imageBuffer),
      timeoutPromise,
    ]);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
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
  // 匹配 "订单号: xxx" / "单号: xxx" / "PO: xxx" / "No. xxx"
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

  // ── 提取客户信息 ──
  for (const line of lines) {
    const m = line.match(/(?:客户|supplier|供应商|公司|Company|Customer)\s*[:：]?\s*(.+)/i);
    if (m && m[1] && m[1].trim().length >= 2) {
      result.customer_name = m[1].trim().split(/\s{2,}/)[0].substring(0, 50);
      break;
    }
  }

  for (const line of lines) {
    const m = line.match(/(?:客户编号|客户编码|代码|Code|ID)\s*[:：]?\s*([A-Za-z0-9\-_]+)/i);
    if (m && m[1] && m[1].length >= 2) {
      result.customer_code = m[1];
      break;
    }
  }

  // ── 提取物料明细行 ──
  // 策略：遍历每一行，尝试从中提取 编码 + 名称 + 数量 + 日期
  // 编码格式：XX.XXX.XX.XXXX 或纯数字编码
  for (const line of lines) {
    // 提取编码（支持 20.022.20.0047 这种格式，或 6-8 位纯数字）
    const codeMatch = line.match(/\d{2}\.\d{2,3}\.\d{2}\.\d{2,4}/);

    // 提取数量（支持千分位）
    const qtyMatch = line.match(/(\d{1,3}(?:[,，]\d{3})*(?:\.\d+)?)\s*(?:个|件|pcs|PC|套|台|只|根|kg|米|m|批)?\s*$/i);
    // 也尝试匹配行中间的数字
    const qtyMatch2 = line.match(/\b(\d{2,5})\b/);

    // 提取日期
    const dateMatch = line.match(/(\d{4}[\/\-.年]\d{1,2}[\/\-.月]\d{1,2})/);

    let code = '';
    let name = '';
    let quantity = 0;
    let deliveryDate = '';

    if (codeMatch) {
      code = codeMatch[0];
      // 名称 = 行内容去掉编码和数量后的文本
      name = line
        .replace(codeMatch[0], '')
        .replace(/\d{1,3}(?:[,，]\d{3})*(?:\.\d+)?\s*(?:个|件|pcs|PC|套|台|只|根|kg|米|m|批)?/gi, '')
        .replace(/\d{4}[\/\-.年]\d{1,2}[\/\-.月]\d{1,2}/g, '')
        .replace(/[|｜\t]/g, ' ')
        .trim()
        .substring(0, 80);
    } else {
      // 尝试匹配无点号的编码（6-8 位纯数字）
      const numCodeMatch = line.match(/\b(\d{6,8})\b/);
      if (numCodeMatch) {
        code = numCodeMatch[1];
        name = line
          .replace(numCodeMatch[0], '')
          .replace(/\d{1,3}(?:[,，]\d{3})*(?:\.\d+)?\s*(?:个|件|pcs|PC|套|台|只|根|kg|米|m|批)?/gi, '')
          .replace(/\d{4}[\/\-.年]\d{1,2}[\/\-.月]\d{1,2}/g, '')
          .replace(/[|｜\t]/g, ' ')
          .trim()
          .substring(0, 80);
      }
    }

    if (qtyMatch) {
      quantity = parseFloat(qtyMatch[1].replace(/[,，]/g, ''));
    } else if (qtyMatch2 && code) {
      // 如果有编码但没有明确的数量后缀，取行中的数字
      const numAfterCode = line.substring(line.indexOf(code) + code.length).match(/\b(\d{2,5})\b/);
      if (numAfterCode) {
        quantity = parseFloat(numAfterCode[1]);
      }
    }

    if (dateMatch) {
      deliveryDate = normalizeDate(dateMatch[1]);
      allDates.push(deliveryDate);
    }

    // 只有提取到编码或数量才算有效行
    if (code || quantity > 0) {
      // 过滤表头行
      if (/^(物料|编码|名称|数量|序号|序|品名|规格|Item|Code|Qty)/i.test(line) && !code) {
        continue;
      }
      result.items.push({
        material_code: code,
        material_name: name,
        quantity,
        unit: '',
        delivery_date: deliveryDate,
      });
    }
  }

  // 交货期限取所有日期中最晚的
  if (allDates.length > 0) {
    result.delivery_deadline = allDates.sort().pop() || '';
  }

  return result;
}

/**
 * 将各种日期格式统一为 YYYY-MM-DD
 */
function normalizeDate(input: string): string {
  const m = input.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json({ error: '请上传图片' }, { status: 400 });
    }

    // 读取图片
    const bytes = await file.arrayBuffer();
    const imageBuffer = Buffer.from(bytes);

    // 优先尝试使用云端 LLM SDK（如果环境支持）
    const hasSdkCreds = process.env.COZE_INTEGRATION_BASE_URL || process.env.COZE_WORKLOAD_IDENTITY_API_KEY;
    if (hasSdkCreds) {
      try {
        const { LLMClient, Config, HeaderUtils } = await import('coze-coding-dev-sdk');
        const base64 = imageBuffer.toString('base64');
        const mimeType = file.type || 'image/png';
        const dataUri = `data:${mimeType};base64,${base64}`;

        const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
        const config = new Config();
        const client = new LLMClient(config, customHeaders);

        const systemPrompt = buildLlmPrompt();
        const messages = [
          { role: 'system' as const, content: systemPrompt },
          {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: '请识别这张采购订单图片中的所有物料信息' },
              {
                type: 'image_url' as const,
                image_url: { url: dataUri, detail: 'high' as const },
              },
            ],
          },
        ];

        const response = await client.invoke(messages, {
          model: 'doubao-seed-2-0-pro-260215',
          temperature: 0.1,
        });

        const content = response.content || '';
        let jsonStr = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1].trim();

        try {
          const parsed = JSON.parse(jsonStr);
          return NextResponse.json({ data: parsed });
        } catch {
          // JSON 解析失败，回退到本地 OCR
          console.error('LLM JSON parse failed, falling back to local OCR');
        }
      } catch (sdkError) {
        // SDK 调用失败，回退到本地 OCR
        console.error('LLM SDK failed, falling back to local OCR:', sdkError);
      }
    }

    // ── 本地离线 OCR 模式 ──
    const rawText = await extractTextWithTesseract(imageBuffer);

    if (!rawText || rawText.trim().length < 5) {
      return NextResponse.json(
        { error: '图片识别失败，未能提取到有效文字。请确保图片清晰、光线充足。' },
        { status: 500 }
      );
    }

    const parsed = parseOrderFromText(rawText);

    return NextResponse.json({ data: parsed, rawText, mode: 'local' });
  } catch (error) {
    console.error('OCR error:', error);
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json(
      { error: '图片识别失败', detail: message },
      { status: 500 }
    );
  }
}

function buildLlmPrompt(): string {
  return `你是一个专业的采购订单识别助手。你需要从客户发来的采购订单图片中提取物料信息。

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "order_no": "订单编号",
  "order_date": "订单日期(YYYY-MM-DD格式)",
  "delivery_deadline": "交货日期(YYYY-MM-DD格式，取最近的交货日期)",
  "customer_code": "客户编号(如果图片上有)",
  "customer_name": "客户名称(如果图片上有)",
  "items": [
    {
      "material_code": "物料编号",
      "material_name": "物料描述/名称",
      "quantity": 数量(纯数字，去掉逗号),
      "unit": "单位",
      "delivery_date": "交货日期(YYYY-MM-DD格式)"
    }
  ]
}

注意事项：
- quantity 必须是纯数字，去掉千分位逗号（如 1,000 → 1000）
- 日期统一转为 YYYY-MM-DD 格式（如 2026.6.19 → 2026-06-19）
- 如果图片中有多行物料，全部提取
- 客户编号和名称如果图片上没有，填空字符串 ""
- **material_code 提取规则**：客户订单中的物料编号可能不是系统编码（如显示"COST"等），此时需要从物料描述中提取实际编码。例如"外协-20.022.20.0047风轮组件/D260"，应提取"20.022.20.0047"作为material_code，"风轮组件/D260"作为material_name。编码格式通常是数字+点号组合（如 XX.XXX.XX.XXXX）
- 如果描述中无法提取编码，则将完整描述作为material_name，material_code填空字符串
- 只输出 JSON，不要输出解释文字`;
}
