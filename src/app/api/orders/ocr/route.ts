import { NextResponse } from 'next/server';

interface ParsedOrder {
  order_no?: string;
  order_date?: string;
  delivery_date?: string;
  customer_name?: string;
  customer_code?: string;
  items?: Array<{
    code: string;
    name: string;
    quantity: number;
    delivery_date: string;
  }>;
}

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    // 获取原始请求体
    const contentType = request.headers.get('content-type') || '';

    let imageBuffer: Buffer;
    let mimeType = 'image/jpeg';

    if (contentType.includes('multipart/form-data')) {
      // FormData 模式
      const formData = await request.formData();

      // 遍历所有字段，找到 File 类型的文件
      let actualFile: File | null = null;
      const allKeys: string[] = [];
      for (const [key, value] of formData.entries()) {
        allKeys.push(key);
        if (value instanceof File && value.size > 0) {
          actualFile = value;
          console.log('Found file in field:', key, 'size:', value.size);
          break;
        }
      }

      if (!actualFile) {
        console.error('No file found in formData. Keys:', allKeys);
        return NextResponse.json({
          error: '未找到图片文件',
          detail: `FormData keys: ${allKeys.join(', ')}`
        }, { status: 400 });
      }

      mimeType = actualFile.type || 'image/jpeg';
      const arrayBuffer = await actualFile.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else {
      // JSON 模式
      const body = await request.json();
      if (!body.image) {
        return NextResponse.json({ error: '未找到图片数据' }, { status: 400 });
      }
      imageBuffer = Buffer.from(body.image, 'base64');
      mimeType = body.mimeType || 'image/jpeg';
    }

    // 检查大模型凭据
    const baseUrl = process.env.COZE_INTEGRATION_BASE_URL;
    const apiKey = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;

    if (!baseUrl || !apiKey) {
      return NextResponse.json({
        error: '大模型凭据未配置。请在 .env 中设置 COZE_INTEGRATION_BASE_URL 和 COZE_WORKLOAD_IDENTITY_API_KEY'
      }, { status: 500 });
    }

    // 转为 base64 data URI
    const base64Image = imageBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64Image}`;

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
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: '请识别这张采购订单图片中的所有信息，按 JSON 格式返回。' },
          {
            type: 'image_url',
            image_url: {
              url: dataUri,
              detail: 'high',
            },
          },
        ],
      },
    ];

    console.log('Calling LLM API:', `${baseUrl}/api/v1/llm/invoke`);

    const apiResponse = await fetch(`${baseUrl}/api/v1/llm/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'doubao-seed-2-0-pro-260215',
        messages,
        temperature: 0.1,
        stream: false,
      }),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('LLM API error:', apiResponse.status, errorText);
      return NextResponse.json({
        error: `大模型调用失败 (${apiResponse.status}): ${errorText.slice(0, 200)}`
      }, { status: 500 });
    }

    const apiData = await apiResponse.json();
    const content = (apiData.choices?.[0]?.message?.content || apiData.content || '').trim();

    // 提取 JSON
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
