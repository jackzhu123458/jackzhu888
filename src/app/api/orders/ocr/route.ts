import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json({ error: '请上传图片' }, { status: 400 });
    }

    // 读取图片并转为 base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mimeType = file.type || 'image/png';
    const dataUri = `data:${mimeType};base64,${base64}`;

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const systemPrompt = `你是一个专业的采购订单识别助手。你需要从客户发来的采购订单图片中提取物料信息。

请严格按照以下 JSON 格式输出，不要输出任何其他内容：
{
  "order_no": "订单编号",
  "order_date": "订单日期(YYYY-MM-DD格式)",
  "delivery_deadline": "交货日期(YYYY-MM-DD格式，取最近的交货日期)",
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
- 只输出 JSON，不要输出解释文字`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: '请识别这张采购订单图片中的所有物料信息' },
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

    const content = response.content || '';

    // 提取 JSON（可能被 markdown code block 包裹）
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse LLM output:', content);
      return NextResponse.json({ error: '识别结果解析失败', raw: content }, { status: 500 });
    }

    return NextResponse.json({ data: parsed });
  } catch (error) {
    console.error('OCR error:', error);
    return NextResponse.json({ error: '图片识别失败' }, { status: 500 });
  }
}
