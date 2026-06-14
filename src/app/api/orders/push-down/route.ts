import { NextRequest, NextResponse } from 'next/server';
import { pushDownOrder } from './push-down-core';

export async function POST(req: NextRequest) {
  try {
    const { order_id } = await req.json();
    if (!order_id) return NextResponse.json({ error: '缺少 order_id' }, { status: 400 });

    const result = await pushDownOrder(order_id);
    return NextResponse.json(result);
  } catch (err) {
    console.error('下推失败:', err);
    const message = err instanceof Error ? err.message : '下推失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
