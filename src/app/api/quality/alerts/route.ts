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

// GET /api/quality/alerts - 查询质量警示
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const alertType = searchParams.get('alert_type');
    const activeOnly = searchParams.get('active_only') === 'true';

    let query = `${getBaseUrl()}/quality_alerts?select=*,products(id,code,name,spec,unit,category,type)&order=created_at.desc&limit=200`;

    if (productId) query += `&product_id=eq.${productId}`;
    if (status) query += `&status=eq.${status}`;
    if (activeOnly) query += `&status=eq.active`;
    if (severity) query += `&severity=eq.${severity}`;
    if (alertType) query += `&alert_type=eq.${alertType}`;

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

// POST /api/quality/alerts - 创建质量警示
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_id, alert_type, severity, title, description, images, created_by } = body;

    if (!product_id || !title) {
      return NextResponse.json({ error: '产品ID和标题为必填' }, { status: 400 });
    }

    const res = await fetch(`${getBaseUrl()}/quality_alerts`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        product_id,
        alert_type: alert_type || 'defect',
        severity: severity || 'medium',
        title,
        description: description || '',
        images: images || [],
        status: 'active',
        created_by: created_by || '',
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

// PUT /api/quality/alerts - 更新质量警示
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, severity, title, description, resolution, resolved_by, images } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID为必填' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'resolved' || status === 'closed') {
        updateData.resolved_at = new Date().toISOString();
        if (resolved_by) updateData.resolved_by = resolved_by;
      }
    }
    if (severity !== undefined) updateData.severity = severity;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (resolution !== undefined) updateData.resolution = resolution;
    if (images !== undefined) updateData.images = images;

    const res = await fetch(`${getBaseUrl()}/quality_alerts?id=eq.${id}`, {
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

// DELETE /api/quality/alerts - 删除质量警示
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID为必填' }, { status: 400 });
    }

    const res = await fetch(`${getBaseUrl()}/quality_alerts?id=eq.${id}`, {
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
