import { NextRequest, NextResponse } from 'next/server';

const getBaseUrl = () => {
  const url = process.env.POSTGREST_URL || process.env.COZE_SUPABASE_URL;
  if (!url) throw new Error('Database URL not configured');
  return url.replace(/\/$/, '');
};

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.COZE_SUPABASE_ANON_KEY || ''}`,
  'apikey': process.env.COZE_SUPABASE_ANON_KEY || '',
  'Prefer': 'return=representation',
});

// GET /api/quality/inspection - 查询出厂检验报告
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deliveryNoteId = searchParams.get('delivery_note_id');
    const productId = searchParams.get('product_id');
    const reportNo = searchParams.get('report_no');

    let query = `${getBaseUrl()}/inspection_reports?select=*,products(id,code,name,spec,unit,category,type),delivery_notes(id,note_no,customer_name,delivery_date)&order=created_at.desc&limit=200`;

    if (deliveryNoteId) query += `&delivery_note_id=eq.${deliveryNoteId}`;
    if (productId) query += `&product_id=eq.${productId}`;
    if (reportNo) query += `&report_no=eq.${reportNo}`;

    const res = await fetch(query, { headers: getHeaders() });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    const data = await res.json();
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
    } = body;

    if (!product_id) {
      return NextResponse.json({ error: '产品ID为必填' }, { status: 400 });
    }

    // 生成报告编号: QC-YYYYMMDD-NNN
    const today = new Date();
    const dateStr = today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');

    // 查询当天已有报告数
    const countRes = await fetch(
      `${getBaseUrl()}/inspection_reports?report_no=like.QC-${dateStr}*&select=report_no&order=report_no.desc&limit=1`,
      { headers: getHeaders() }
    );
    let nextNo = 1;
    if (countRes.ok) {
      const existing = await countRes.json();
      if (existing.length > 0) {
        const lastNo = existing[0].report_no;
        const match = lastNo.match(/QC-\d{8}-(\d+)/);
        if (match) nextNo = parseInt(match[1]) + 1;
      }
    }
    const report_no = `QC-${dateStr}-${nextNo.toString().padStart(3, '0')}`;

    const res = await fetch(`${getBaseUrl()}/inspection_reports`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
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
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data[0] || data);
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
    } = body;

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

    const res = await fetch(`${getBaseUrl()}/inspection_reports?id=eq.${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(updateData),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data[0] || data);
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

    const res = await fetch(`${getBaseUrl()}/inspection_reports?id=eq.${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
