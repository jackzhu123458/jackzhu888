import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return getSupabaseClient();
}

// GET /api/quality/inspection - 查询出厂检验报告
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deliveryNoteId = searchParams.get('delivery_note_id');
    const productId = searchParams.get('product_id');
    const reportNo = searchParams.get('report_no');

    const client = getSupabase();

    // 查询检验报告
    let query = client
      .from('inspection_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (deliveryNoteId) query = query.eq('delivery_note_id', deliveryNoteId);
    if (productId) query = query.eq('product_id', productId);
    if (reportNo) query = query.eq('report_no', reportNo);

    const { data: reports, error: reportError } = await query;
    if (reportError) {
      return NextResponse.json({ error: reportError.message }, { status: 500 });
    }

    // 独立查询产品信息
    const productIds = [...new Set((reports || []).map((r: { product_id: string }) => r.product_id).filter(Boolean))];
    const deliveryNoteIds = [...new Set((reports || []).map((r: { delivery_note_id: string }) => r.delivery_note_id).filter(Boolean))];

    const productMap = new Map<string, { id: string; code: string; name: string; spec: string; unit: string; category: string; type: string }>();
    const deliveryNoteMap = new Map<string, { id: string; note_no: string; customer_name: string; delivery_date: string }>();

    if (productIds.length > 0) {
      const { data: products } = await client
        .from('products')
        .select('id,code,name,spec,unit,category,type')
        .in('id', productIds);
      if (products) {
        for (const p of products) {
          productMap.set(p.id, p);
        }
      }
    }

    if (deliveryNoteIds.length > 0) {
      const { data: notes } = await client
        .from('delivery_notes')
        .select('id,note_no,customer_name,delivery_date')
        .in('id', deliveryNoteIds);
      if (notes) {
        for (const n of notes) {
          deliveryNoteMap.set(n.id, n);
        }
      }
    }

    // 合并数据
    const data = (reports || []).map((report: Record<string, unknown>) => ({
      ...report,
      products: productMap.get(report.product_id as string) || null,
      delivery_notes: deliveryNoteMap.get(report.delivery_note_id as string) || null,
    }));

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/quality/inspection - 创建出厂检验报告
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      delivery_note_id, product_id, inspection_date, result,
      inspector, approved_by, batch_no, quantity, sample_quantity,
      items, conclusion, remark
    } = body as {
      delivery_note_id?: string;
      product_id?: string;
      inspection_date?: string;
      result?: string;
      inspector?: string;
      approved_by?: string;
      batch_no?: string;
      quantity?: number | string;
      sample_quantity?: number | string;
      items?: Array<{ name: string; standard: string; result: string; passed: boolean }> | string;
      conclusion?: string;
      remark?: string;
    };

    if (!product_id) {
      return NextResponse.json({ error: '产品ID为必填' }, { status: 400 });
    }

    // 生成报告编号: QC-YYYYMMDD-NNN
    const today = new Date();
    const dateStr = today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');

    const client = getSupabase();

    // 查询当天已有报告数
    const { data: existing } = await client
      .from('inspection_reports')
      .select('report_no')
      .like('report_no', `QC-${dateStr}%`)
      .order('report_no', { ascending: false })
      .limit(1);

    let nextNo = 1;
    if (existing && existing.length > 0) {
      const lastNo = existing[0].report_no;
      const match = lastNo.match(/QC-\d{8}-(\d+)/);
      if (match) nextNo = parseInt(match[1]) + 1;
    }
    const report_no = `QC-${dateStr}-${nextNo.toString().padStart(3, '0')}`;

    const { data, error } = await client
      .from('inspection_reports')
      .insert({
        report_no,
        delivery_note_id: delivery_note_id || null,
        product_id,
        inspection_date: inspection_date || new Date().toISOString(),
        result: result || 'passed',
        inspector: inspector || '',
        approved_by: approved_by || '',
        batch_no: batch_no || '',
        quantity: quantity || 0,
        sample_quantity: sample_quantity || 0,
        items: typeof items === 'object' ? JSON.stringify(items) : (items || '[]'),
        conclusion: conclusion || '',
        remark: remark || '',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/quality/inspection - 更新出厂检验报告
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id, result, inspector, approved_by, batch_no,
      quantity, sample_quantity, items, conclusion, remark
    } = body as {
      id?: string;
      result?: string;
      inspector?: string;
      approved_by?: string;
      batch_no?: string;
      quantity?: number | string;
      sample_quantity?: number | string;
      items?: Array<{ name: string; standard: string; result: string; passed: boolean }> | string;
      conclusion?: string;
      remark?: string;
    };

    if (!id) {
      return NextResponse.json({ error: 'ID为必填' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (result !== undefined) updateData.result = result;
    if (inspector !== undefined) updateData.inspector = inspector;
    if (approved_by !== undefined) updateData.approved_by = approved_by;
    if (batch_no !== undefined) updateData.batch_no = batch_no;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (sample_quantity !== undefined) updateData.sample_quantity = sample_quantity;
    if (items !== undefined) updateData.items = typeof items === 'object' ? JSON.stringify(items) : items;
    if (conclusion !== undefined) updateData.conclusion = conclusion;
    if (remark !== undefined) updateData.remark = remark;

    const client = getSupabase();
    const { data, error } = await client
      .from('inspection_reports')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/quality/inspection - 删除出厂检验报告
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID为必填' }, { status: 400 });
    }

    const client = getSupabase();
    const { error } = await client
      .from('inspection_reports')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
