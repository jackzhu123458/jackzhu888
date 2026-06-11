import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const { data, error } = await client
      .from('delivery_notes')
      .select('*, delivery_note_items(*, products(id, code, name, spec, unit))')
      .eq('id', id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  let query = client
    .from('delivery_notes')
    .select('*, delivery_note_items(count)')
    .order('created_at', { ascending: false });

  const { data, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { items, ...noteFields } = body;

  const { data: note, error: nErr } = await client
    .from('delivery_notes')
    .insert(noteFields)
    .select()
    .maybeSingle();
  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });
  if (!note) return NextResponse.json({ error: '创建送货单失败' }, { status: 500 });

  if (items && items.length > 0) {
    const itemsWithNoteId = items.map((item: Record<string, unknown>) => ({
      ...item,
      note_id: note.id,
    }));
    const { error: iErr } = await client.from('delivery_note_items').insert(itemsWithNoteId);
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
  }

  const { data: fullNote, error: fErr } = await client
    .from('delivery_notes')
    .select('*, delivery_note_items(*, products(id, code, name, spec, unit))')
    .eq('id', note.id)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

  return NextResponse.json(fullNote, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { id, items, ...updates } = body;
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  const { error: nErr } = await client.from('delivery_notes').update(updates).eq('id', id);
  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });

  if (items) {
    await client.from('delivery_note_items').delete().eq('note_id', id);
    if (items.length > 0) {
      const itemsWithNoteId = items.map((item: Record<string, unknown>) => ({
        ...item,
        note_id: id,
      }));
      await client.from('delivery_note_items').insert(itemsWithNoteId);
    }
  }

  const { data: fullNote, error: fErr } = await client
    .from('delivery_notes')
    .select('*, delivery_note_items(*, products(id, code, name, spec, unit))')
    .eq('id', id)
    .maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

  return NextResponse.json(fullNote);
}

export async function DELETE(request: NextRequest) {
  const client = getSupabaseClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  const { error } = await client.from('delivery_notes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
