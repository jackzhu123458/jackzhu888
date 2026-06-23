import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return getSupabaseClient();
}

// GET /api/quality/alerts - 查询质量警示
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const alertType = searchParams.get('alert_type');
    const activeOnly = searchParams.get('active_only') === 'true';

    const client = getSupabase();

    // 查询质量警示
    let query = client
      .from('quality_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (productId) query = query.eq('product_id', productId);
    if (status) query = query.eq('status', status);
    if (activeOnly) query = query.eq('status', 'active');
    if (severity) query = query.eq('severity', severity);
    if (alertType) query = query.eq('alert_type', alertType);

    const { data: alerts, error: alertError } = await query;
    if (alertError) {
      return NextResponse.json({ error: alertError.message }, { status: 500 });
    }

    // 独立查询产品信息
    const productIds = [...new Set((alerts || []).map((a: { product_id: string }) => a.product_id).filter(Boolean))];
    const productMap = new Map<string, { id: string; code: string; name: string; spec: string; unit: string; category: string; type: string }>();

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

    // 合并数据
    const data = (alerts || []).map((alert: Record<string, unknown>) => ({
      ...alert,
      products: productMap.get(alert.product_id as string) || null,
    }));

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
    const { product_id, alert_type, severity, title, description, images, created_by } = body as {
      product_id?: string;
      alert_type?: string;
      severity?: string;
      title?: string;
      description?: string;
      images?: string[];
      created_by?: string;
    };

    if (!product_id || !title) {
      return NextResponse.json({ error: '产品ID和标题为必填' }, { status: 400 });
    }

    const client = getSupabase();
    const { data, error } = await client
      .from('quality_alerts')
      .insert({
        product_id,
        alert_type: alert_type || 'defect',
        severity: severity || 'medium',
        title,
        description: description || '',
        images: images || [],
        status: 'active',
        created_by: created_by || '',
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

// PUT /api/quality/alerts - 更新质量警示
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, severity, title, description, resolution, resolved_by, images } = body as {
      id?: string;
      status?: string;
      severity?: string;
      title?: string;
      description?: string;
      resolution?: string;
      resolved_by?: string;
      images?: string[];
    };

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

    const client = getSupabase();
    const { data, error } = await client
      .from('quality_alerts')
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

// DELETE /api/quality/alerts - 删除质量警示
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID为必填' }, { status: 400 });
    }

    const client = getSupabase();
    const { error } = await client
      .from('quality_alerts')
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
