import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface OrderItem {
  code: string;
  name: string;
  quantity: number;
  delivery_date?: string;
}

interface ParsedOrder {
  order_no?: string;
  order_date?: string;
  delivery_date?: string;
  customer_name?: string;
  customer_code?: string;
  items: OrderItem[];
}

export async function POST(request: NextRequest) {
  try {
    let imageBase64: string;
    let mimeType: string;

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = (formData.get('file') || formData.get('image')) as File | null;
      if (!file) {
        return NextResponse.json({ error: '未找到图片文件' }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      imageBase64 = Buffer.from(arrayBuffer).toString('base64');
      mimeType = file.type || 'image/jpeg';
    } else {
      const body = await request.json();
      if (!body.image) {
        return NextResponse.json({ error: '未找到图片数据' }, { status: 400 });
      }
      imageBase64 = body.image;
      mimeType = body.mimeType || 'image/jpeg';
    }

    const dataUri = `data:${mimeType};base64,${imageBase64}`;

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const systemPrompt = `你是一个采购订单识别助手。用户会上传采购订单图片，你需要识别图片中的信息并以 JSON 格式返回。

必须返回如下 JSON 格式（不要加 markdown 代码块，直接返回纯 JSON）：
{
  "order_no": "订单编号（如 44836）",
  "order_date": "订单日期（YYYY-MM-DD 格式）",
  "delivery_date": "交货日期（YYYY-MM-DD 格式）",
  "customer_name": "供应商/客户名称",
  "customer_code": "供应商编码（如 S0080）",
  "items": [
    {
      "code": "物料编号（如 30.113.01.0025）",
      "name": "物料描述/名称",
      "quantity": 10000,
      "delivery_date": "交货日期（YYYY-MM-DD 格式，如有）"
    }
  ]
}

注意事项：
1. 仔细识别每一行物料明细，不要遗漏
2. 数量去掉逗号，转为数字（如 10,000 → 10000）
3. 日期统一转为 YYYY-MM-DD 格式（如 2026.07.01 → 2026-07-01）
4. 物料编号通常是数字+点号格式（如 30.113.01.0025）
5. 如果某个字段识别不到，留空字符串或 0
6. 只返回 JSON，不要有任何其他文字`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: '请识别这张采购订单图片中的所有信息，按 JSON 格式返回。' },
          {
            type: 'image_url' as const,
            image_url: {
              url: dataUri,
              detail: 'high' as const,
            },
          },
        ],
      },
    ];

    const response = await client.invoke(messages, {
      model: 'doubao-seed-2-0-pro-260215',
      temperature: 0.1,
    });

    const content = response.content.trim();

    // 提取 JSON（处理模型可能返回 markdown 代码块的情况）
    let jsonStr = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    let parsed: ParsedOrder;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = { items: [] };
    }

    return NextResponse.json({
      success: true,
      data: {
        order_no: parsed.order_no || '',
        order_date: parsed.order_date || '',
        delivery_date: parsed.delivery_date || '',
        customer_name: parsed.customer_name || '',
        customer_code: parsed.customer_code || '',
        items: (parsed.items || []).map((item) => ({
          code: item.code || '',
          name: item.name || '',
          quantity: Number(item.quantity) || 0,
          delivery_date: item.delivery_date || '',
        })),
      },
    });
  } catch (error) {
    console.error('OCR error:', error);
    const message = error instanceof Error ? error.message : '识别失败';
    return NextResponse.json({ error: `图片识别失败: ${message}` }, { status: 500 });
  }
}
