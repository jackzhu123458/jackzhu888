import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, isLocalMode } from '@/storage/database/supabase-client';

/**
 * POST /api/process-flow-materials
 * 批量更新某个产品所有工序的物料关联
 * Body: { product_id: string, associations: Array<{ step_id: string, materials: Array<{ product_id: string, quantity: number }> }> }
 * 逻辑：先删该产品所有工序的物料关联，再批量插入新的
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_id, associations } = body as {
      product_id: string;
      associations: Array<{
        step_id: string;
        materials: Array<{ product_id: string; quantity: number }>;
      }>;
    };

    if (!product_id || !Array.isArray(associations)) {
      return NextResponse.json({ error: '缺少 product_id 或 associations' }, { status: 400 });
    }

    // 收集所有 step_id
    const stepIds = associations.map(a => a.step_id);

    // 先删除这些 step 的旧物料关联
    if (isLocalMode()) {
      const postgrestUrl = process.env.POSTGREST_URL;
      if (!postgrestUrl) throw new Error('POSTGREST_URL not set');

      // 删除旧关联
      if (stepIds.length > 0) {
        await fetch(`${postgrestUrl}/process_flow_materials?process_flow_id=in.(${stepIds.join(',')})`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 插入新关联
      const inserts: Array<{ process_flow_id: string; product_id: string; quantity: number }> = [];
      for (const assoc of associations) {
        for (const m of assoc.materials) {
          inserts.push({
            process_flow_id: assoc.step_id,
            product_id: m.product_id,
            quantity: m.quantity,
          });
        }
      }

      if (inserts.length > 0) {
        const insRes = await fetch(`${postgrestUrl}/process_flow_materials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify(inserts),
        });
        if (!insRes.ok) {
          const text = await insRes.text();
          console.error('[process-flow-materials POST] Insert error:', insRes.status, text);
          return NextResponse.json({ error: `插入失败: ${text}` }, { status: 500 });
        }
      }

      return NextResponse.json({ success: true, count: inserts.length });
    }

    // 云端 Supabase 模式
    const sb = getSupabaseClient();

    // 删除旧关联
    if (stepIds.length > 0) {
      const { error: delError } = await sb
        .from('process_flow_materials')
        .delete()
        .in('process_flow_id', stepIds);
      if (delError) {
        console.error('[process-flow-materials POST] Delete error:', delError.message);
        return NextResponse.json({ error: delError.message }, { status: 500 });
      }
    }

    // 插入新关联
    const inserts: Array<{ process_flow_id: string; product_id: string; quantity: number }> = [];
    for (const assoc of associations) {
      for (const m of assoc.materials) {
        inserts.push({
          process_flow_id: assoc.step_id,
          product_id: m.product_id,
          quantity: m.quantity,
        });
      }
    }

    if (inserts.length > 0) {
      const { error: insError } = await sb
        .from('process_flow_materials')
        .insert(inserts);
      if (insError) {
        console.error('[process-flow-materials POST] Insert error:', insError.message);
        return NextResponse.json({ error: insError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, count: inserts.length });
  } catch (err) {
    console.error('[process-flow-materials POST] Error:', err);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
