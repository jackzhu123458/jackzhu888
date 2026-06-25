import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, isLocalMode } from '@/storage/database/supabase-client';

/**
 * 在 PostgREST 本地模式下，直接用 fetch 调用 PostgREST API。
 * Supabase JS client 在 PostgREST 代理模式下可能有兼容性问题
 * （schema cache 未刷新、header 被剥离等），直接 fetch 更可靠。
 */
async function postgrestFetch(path: string, options?: RequestInit): Promise<Response> {
  const postgrestUrl = process.env.POSTGREST_URL;
  if (!postgrestUrl) throw new Error('POSTGREST_URL not set');
  return fetch(`${postgrestUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
}

/**
 * 重新编号 step_order，确保：
 * 1. step_order 从 1 开始连续递增
 * 2. 同一 step_order 下允许有多个 branch（并行步骤）
 * 3. 不再依赖前端传来的 step_order（防止遗漏导致全为0冲突）
 */
function reindexSteps(steps: { step_order?: number; step_name: string; description?: string; estimated_minutes?: number; is_key_step?: boolean; branch?: string | null }[]): {
  step_order: number;
  step_name: string;
  description: string | null;
  estimated_minutes: number | null;
  is_key_step: boolean;
  branch: string | null;
}[] {
  // 按 step_order 分组，保留原始分组关系
  const groups: Map<number, typeof steps> = new Map();
  let groupIndex = 0;
  for (const s of steps) {
    const key = s.step_order ?? (groupIndex + 1);
    if (!groups.has(key)) {
      groupIndex++;
      groups.set(key, []);
    }
    groups.get(key)!.push(s);
  }

  // 重新编号为 1, 2, 3...
  const result: ReturnType<typeof reindexSteps> = [];
  let order = 1;
  for (const [, group] of groups) {
    for (const s of group) {
      result.push({
        step_order: order,
        step_name: s.step_name,
        description: s.description || null,
        estimated_minutes: s.estimated_minutes || null,
        is_key_step: s.is_key_step || false,
        branch: s.branch || null,
      });
    }
    order++;
  }
  return result;
}

// GET /api/process-flows?product_id=xxx — 获取某产品的工艺流程
export async function GET(req: NextRequest) {
  try {
    const productId = req.nextUrl.searchParams.get('product_id');

    if (isLocalMode()) {
      // 本地 PostgREST 模式：直接调用
      let path = '/process_flows?order=step_order.asc.nullsfirst,branch.asc.nullsfirst';
      if (productId) {
        path += `&product_id=eq.${encodeURIComponent(productId)}`;
      }
      const res = await postgrestFetch(path);

      if (!res.ok) {
        const text = await res.text();
        console.error('[process-flows GET] PostgREST error:', res.status, text);
        return NextResponse.json({ error: `数据库查询失败 (HTTP ${res.status}): ${text}` }, { status: 500 });
      }

      const data = await res.json();

      if (productId) {
        // 获取产品信息
        let product = null;
        if (Array.isArray(data) && data.length > 0) {
          const prodRes = await postgrestFetch(`/products?id=eq.${encodeURIComponent(productId)}&limit=1`);
          if (prodRes.ok) {
            const prodData = await prodRes.json();
            product = Array.isArray(prodData) && prodData.length > 0 ? prodData[0] : null;
          }
        }
        return NextResponse.json({ product, steps: Array.isArray(data) ? data : [] });
      }

      return NextResponse.json(data);
    }

    // 云端 Supabase 模式
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
    const { product_id, steps: rawSteps } = body as {
      product_id: string;
      steps: { step_order?: number; step_name: string; description?: string; estimated_minutes?: number; is_key_step?: boolean; branch?: string | null }[];
    };

    if (!product_id) {
      return NextResponse.json({ error: '请选择产品' }, { status: 400 });
    }
    if (!rawSteps || !Array.isArray(rawSteps) || rawSteps.length === 0) {
      return NextResponse.json({ error: '请至少添加一个工序步骤' }, { status: 400 });
    }

    // 重新编号 step_order，防止前端遗漏或冲突
    const steps = reindexSteps(rawSteps);

    if (isLocalMode()) {
      // 本地 PostgREST 模式：直接调用
      // 1. 先读取旧数据（用于回滚）
      const oldRes = await postgrestFetch(
        `/process_flows?product_id=eq.${encodeURIComponent(product_id)}&select=id,step_order,step_name,description,estimated_minutes,is_key_step,branch`,
      );
      const oldData = oldRes.ok ? await oldRes.json() : [];

      // 2. 删除该产品已有的工艺流程
      const delRes = await postgrestFetch(
        `/process_flows?product_id=eq.${encodeURIComponent(product_id)}`,
        { method: 'DELETE' },
      );
      if (!delRes.ok) {
        const text = await delRes.text();
        console.error('[process-flows POST] PostgREST delete error:', delRes.status, text);
        return NextResponse.json({ error: `删除旧数据失败 (HTTP ${delRes.status}): ${text}` }, { status: 500 });
      }

      // 3. 插入新的工序步骤
      const rows = steps.map((s) => ({
        product_id,
        ...s,
      }));

      const insRes = await postgrestFetch('/process_flows', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(rows),
      });

      if (!insRes.ok) {
        const text = await insRes.text();
        console.error('[process-flows POST] PostgREST insert error:', insRes.status, text);

        // 插入失败，尝试恢复旧数据
        if (Array.isArray(oldData) && oldData.length > 0) {
          console.log('[process-flows POST] 尝试恢复旧数据...');
          await postgrestFetch('/process_flows', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation' },
            body: JSON.stringify(oldData.map((d: Record<string, unknown>) => ({
              product_id,
              step_order: d.step_order,
              step_name: d.step_name,
              description: d.description,
              estimated_minutes: d.estimated_minutes,
              is_key_step: d.is_key_step,
              branch: d.branch,
            }))),
          }).catch(() => {});
        }

        return NextResponse.json({ error: `保存失败 (HTTP ${insRes.status}): ${text}` }, { status: 500 });
      }

      const data = await insRes.json();
      return NextResponse.json(data);
    }

    // 云端 Supabase 模式
    const sb = getSupabaseClient();

    // 先读取旧数据用于回滚
    const { data: oldData } = await sb
      .from('process_flows')
      .select('*')
      .eq('product_id', product_id);

    // Delete existing steps for this product
    const { error: delError } = await sb
      .from('process_flows')
      .delete()
      .eq('product_id', product_id);

    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }

    // Insert new steps
    const rows = steps.map((s) => ({
      product_id,
      ...s,
    }));

    const { data, error: insError } = await sb
      .from('process_flows')
      .insert(rows)
      .select();

    if (insError) {
      console.error('[process-flows POST] Supabase insert error:', JSON.stringify(insError));

      // 插入失败，尝试恢复旧数据
      if (oldData && oldData.length > 0) {
        console.log('[process-flows POST] 尝试恢复旧数据...');
        await sb.from('process_flows').insert(oldData.map((d: Record<string, unknown>) => ({
          product_id,
          step_order: d.step_order,
          step_name: d.step_name,
          description: d.description,
          estimated_minutes: d.estimated_minutes,
          is_key_step: d.is_key_step,
          branch: d.branch,
        }))).then(() => {}, () => {});
      }

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

    if (isLocalMode()) {
      const res = await postgrestFetch(
        `/process_flows?product_id=eq.${encodeURIComponent(productId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const text = await res.text();
        console.error('[process-flows DELETE] PostgREST error:', res.status, text);
        return NextResponse.json({ error: `删除失败 (HTTP ${res.status}): ${text}` }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    // 云端 Supabase 模式
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
