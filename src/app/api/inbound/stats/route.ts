import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/inbound/stats - 入库统计数据（趋势图 + 异常标注）
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get('days') || 30);

  // 查询最近 N 天的入库单（含明细+产品）
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString();

  const { data: notes, error } = await supabase
    .from('inbound_notes')
    .select(`
      id, note_no, status, created_at, planned_date, actual_date,
      warehouses(id, name),
      inbound_note_items(
        id, product_id, quantity, unit_price, amount, diff_qty, item_status,
        products(id, code, name, category, price)
      )
    `)
    .gte('created_at', sinceStr)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 按日期聚合：入库数量 & 入库金额
  const dailyMap = new Map<string, { date: string; qty: number; amount: number; abnormal: boolean; notes: string[] }>();

  for (const note of notes || []) {
    const date = new Date(note.created_at).toISOString().split('T')[0];
    if (!dailyMap.has(date)) {
      dailyMap.set(date, { date, qty: 0, amount: 0, abnormal: false, notes: [] });
    }
    const day = dailyMap.get(date)!;

    let noteAbnormal = note.status === 'abnormal';
    for (const item of note.inbound_note_items || []) {
      const qty = Number(item.quantity || 0);
      const prod = Array.isArray(item.products) ? item.products[0] : item.products;
      const amt = Number(item.amount || qty * Number(item.unit_price || prod?.price || 0));
      day.qty += qty;
      day.amount += amt;
      if (item.item_status === 'abnormal' || Number(item.diff_qty || 0) !== 0) {
        noteAbnormal = true;
      }
    }
    if (noteAbnormal) {
      day.abnormal = true;
      day.notes.push(note.note_no);
    }
  }

  // 填充空缺日期
  const result: { date: string; qty: number; amount: number; abnormal: boolean; notes: string[] }[] = [];
  const end = new Date();
  const start = new Date(since);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    result.push(dailyMap.get(key) || { date: key, qty: 0, amount: 0, abnormal: false, notes: [] });
  }

  // 汇总统计
  const totalQty = result.reduce((s, d) => s + d.qty, 0);
  const totalAmount = result.reduce((s, d) => s + d.amount, 0);
  const abnormalCount = result.filter(d => d.abnormal).length;
  const totalNotes = (notes || []).length;

  return NextResponse.json({
    daily: result,
    summary: { totalQty, totalAmount, abnormalCount, totalNotes, days },
  });
}
