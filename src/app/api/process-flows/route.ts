import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/process-flows?product_id=xxx — 获取某产品的工艺流程
export async function GET(req: NextRequest) {
  try {
    const productId = req.nextUrl.searchParams.get('product_id');
    const sb = getSupabaseClient();

    let query = sb
      .from('process_flows')
      .select('*')
      .order('step_order', { ascending: true })
      .order('branch', { ascending: true, nullsFirst: true });

    if (productId) {
      query = query.eq('product_id', productId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If filtering by product_id, also fetch product info
    if (productId && data && data.length > 0) {
      const { data: product } = await sb
        .from('products')
        .select('id, code, name, spec')
        .eq('id', productId)
        .single();

      return NextResponse.json({ product: product || null, steps: data });
    }

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/process-flows — 保存产品工艺流程（全量覆盖）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { product_id, steps } = body as {
      product_id: string;
      steps: { step_order?: number; step_name: string; description?: string; estimated_minutes?: number; is_key_step?: boolean; branch?: string | null }[];
    };

    if (!product_id) {
      return NextResponse.json({ error: '请选择产品' }, { status: 400 });
    }
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json({ error: '请至少添加一个工序步骤' }, { status: 400 });
    }

    const sb = getSupabaseClient();

    // Delete existing steps for this product
    const { error: delError } = await sb
      .from('process_flows')
      .delete()
      .eq('product_id', product_id);

    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }

    // Insert new steps - preserve step_order and branch from client
    const rows = steps.map((s) => ({
      product_id,
      step_order: s.step_order ?? 0,
      step_name: s.step_name,
      description: s.description || null,
      estimated_minutes: s.estimated_minutes || null,
      is_key_step: s.is_key_step || false,
      branch: s.branch || null,
    }));

    const { data, error: insError } = await sb
      .from('process_flows')
      .insert(rows)
      .select();

    if (insError) {
      return NextResponse.json({ error: insError.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/process-flows?product_id=xxx — 删除某产品的全部工艺流程
export async function DELETE(req: NextRequest) {
  try {
    const productId = req.nextUrl.searchParams.get('product_id');
    if (!productId) {
      return NextResponse.json({ error: '请提供产品ID' }, { status: 400 });
    }

    const sb = getSupabaseClient();
    const { error } = await sb
      .from('process_flows')
      .delete()
      .eq('product_id', productId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
