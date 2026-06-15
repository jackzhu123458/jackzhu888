import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

function getSupabase() {
  return getSupabaseClient();
}

// GET /api/customers
export async function GET() {
  const { data, error } = await getSupabase()
    .from('customers')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST /api/customers
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, code, contact, phone, address, remark } = body;

  if (!name) {
    return NextResponse.json({ error: '客户名称不能为空' }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from('customers')
    .insert({ name, code, contact, phone, address, remark })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

// PUT /api/customers
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, name, code, contact, phone, address, remark } = body;

  if (!id) {
    return NextResponse.json({ error: '缺少客户 ID' }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from('customers')
    .update({ name, code, contact, phone, address, remark, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// DELETE /api/customers?id=xxx
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: '缺少客户 ID' }, { status: 400 });
  }

  const { error } = await getSupabase()
    .from('customers')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
