import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, isLocalMode } from '@/storage/database/supabase-client';

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

// GET: 获取所有产品类目
export async function GET() {
  try {
    if (isLocalMode()) {
      const res = await postgrestFetch('/product_categories?order=name.asc');
      if (!res.ok) {
        const text = await res.text();
        console.error('[product-categories GET] PostgREST error:', res.status, text);
        return NextResponse.json({ error: `数据库查询失败 (HTTP ${res.status}): ${text}` }, { status: 500 });
      }
      const data = await res.json();
      return NextResponse.json(Array.isArray(data) ? data : []);
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('product_categories')
      .select('*')
      .order('name');

    if (error) {
      console.error('[product-categories GET] Supabase error:', JSON.stringify(error));
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: 新增产品类目
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, label } = body;
    if (!name || !name.trim()) {
      return NextResponse.json({ error: '类目名称不能为空' }, { status: 400 });
    }
    const trimmedName = name.trim();
    const trimmedLabel = (label || trimmedName).trim();

    if (isLocalMode()) {
      const res = await postgrestFetch('/product_categories', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({ name: trimmedName, label: trimmedLabel }),
      });

      if (res.status === 409 || res.status === 400) {
        const text = await res.text();
        if (text.includes('duplicate') || text.includes('unique') || res.status === 409) {
          return NextResponse.json({ error: '该类目已存在', exists: true }, { status: 409 });
        }
      }

      if (!res.ok) {
        const text = await res.text();
        console.error('[product-categories POST] PostgREST error:', res.status, text);
        return NextResponse.json({ error: `添加失败 (HTTP ${res.status}): ${text}` }, { status: 500 });
      }

      const data = await res.json();
      return NextResponse.json(Array.isArray(data) ? data[0] : data, { status: 201 });
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('product_categories')
      .insert({ name: trimmedName, label: trimmedLabel })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '该类目已存在', exists: true }, { status: 409 });
      }
      console.error('[product-categories POST] Supabase error:', JSON.stringify(error));
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: 删除产品类目
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const name = searchParams.get('name');
    if (!id && !name) {
      return NextResponse.json({ error: '缺少 id 或 name 参数' }, { status: 400 });
    }

    if (isLocalMode()) {
      const path = id
        ? `/product_categories?id=eq.${encodeURIComponent(id)}`
        : `/product_categories?name=eq.${encodeURIComponent(name!)}`;
      const res = await postgrestFetch(path, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `删除失败 (HTTP ${res.status}): ${text}` }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    const client = getSupabaseClient();
    const query = client.from('product_categories').delete();
    const { error } = id ? await query.eq('id', id) : await query.eq('name', name!);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
