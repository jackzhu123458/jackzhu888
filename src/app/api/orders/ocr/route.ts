import { NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

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
    const rawText = await request.text();
    let body: { image?: string; mimeType?: string };
    try {
      body = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[OCR] JSON parse failed. Raw text length:', rawText.length, 'First 100 chars:', rawText.slice(0, 100));
      return NextResponse.json({ error: `JSON解析失败: ${(parseErr as Error).message}。数据长度: ${rawText.length}` }, { status: 400 });
    }
    console.log('[OCR] Received request, has image:', !!body.image, 'mimeType:', body.mimeType, 'image length:', body.image?.length);

    if (!body.image) {
      return NextResponse.json({ error: '未找到图片数据，请重新选择图片' }, { status: 400 });
    }

    const base64Data: string = body.image;
    const mimeType: string = body.mimeType || 'image/jpeg';
    const dataUri = `data:${mimeType};base64,${base64Data}`;

    // 检查大模型凭据
    const baseUrl = process.env.COZE_INTEGRATION_BASE_URL;
    const apiKey = process.env.COZE_WORKLOAD_IDENTITY_API_KEY;

    console.log('[OCR] LLM config:', baseUrl ? '(set)' : '(not set)', apiKey ? '(set)' : '(not set)');

    if (!baseUrl || !apiKey) {
      return NextResponse.json({
        error: '大模型凭据未配置。请在 .env 中设置 COZE_INTEGRATION_BASE_URL 和 COZE_WORKLOAD_IDENTITY_API_KEY'
      }, { status: 500 });
    }

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
3. 日期统一转为 YYYY-MM-DD 格式（如 2026.07.01 → 2026-07-01, 6/9 → 当年6月9日 → 2026-06-09）
4. 物料编号通常是数字+点号格式（如 30.113.01.0025）
5. 客户/供应商名称必须完整识别，不要缩写！例如"常州宝捷电机有限公司"不要缩写为"宝捷电机"
6. 客户/供应商编码通常是S+数字格式（如 S0080），注意区分字母O和数字0
7. **极其重要 - 交货日期逐行识别**：
   - 采购订单的表格中，每个物料行都有各自的交货日期
   - 有些订单同一列中不同行的交货日期不同（如第1行6/9，第2行7/7）
   - 有些表格的交货日期列可能只在该组第一行标注，后续行如果属于同一交货日期则省略（看起来像空格），这时需要根据上下文推断：
     * 如果下一行交货日期为空，且与前一行属于同一单据编号/分组，则复制前一行的交货日期
     * 如果下一行有新的交货日期，则使用新的日期
   - 绝对不能把订单头部的"交货日期"统一填到所有物料行！
8. 如果某个字段识别不到，留空字符串或 0
9. 只返回 JSON，不要有任何其他文字`;

    // 使用 SDK 调用大模型
    const customHeaders = HeaderUtils.extractForwardHeaders(
      new Headers(request.headers)
    );

    const config = new Config();
    const client = new LLMClient(config, customHeaders);

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

    console.log('[OCR] Calling LLM via SDK...');

    const response = await client.invoke(messages, {
      model: 'doubao-seed-1-8-251228',
      temperature: 0.1,
    });

    const content = (response.content || '').trim();
    console.log('[OCR] LLM response length:', content.length);
    console.log('[OCR] LLM raw response:', content.slice(0, 2000));

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
      console.error('[OCR] JSON parse failed, content:', content.slice(0, 500));
      parsed = { items: [] };
    }

    // 日志：每个物料行的交货日期
    if (parsed.items && parsed.items.length > 0) {
      console.log('[OCR] Parsed items delivery dates:', parsed.items.map((item, i) => `#${i+1} ${item.code}: ${item.delivery_date}`).join(' | '));
    }

    return NextResponse.json({
      success: true,
      data: {
        order_no: parsed.order_no || '',
        order_date: parsed.order_date || '',
        delivery_date: parsed.delivery_date || '',
        delivery_deadline: parsed.delivery_date || '',  // 订单级别交货期限，前端使用此字段
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
    console.error('[OCR] error:', error);
    const message = error instanceof Error ? error.message : '识别失败';
    return NextResponse.json({ error: `图片识别失败: ${message}` }, { status: 500 });
  }
}
