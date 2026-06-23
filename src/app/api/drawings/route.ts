import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { uploadFile, deleteFile, getFileUrl } from '@/lib/storage';

function getSupabase() {
  return getSupabaseClient();
}

// GET /api/drawings?product_id=xxx — 获取产品的图纸列表
// GET /api/drawings?file_key=xxx — 获取单个图纸的URL（用于预览/打印）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    const fileKey = searchParams.get('file_key');
    const keyword = searchParams.get('keyword');

    // 单独获取文件URL（预览/打印用）
    if (fileKey) {
      const url = await getFileUrl(fileKey);
      return NextResponse.json({ url });
    }

    let query = getSupabase()
      .from('product_drawings')
      .select('*')
      .order('created_at', { ascending: false });

    if (productId) {
      query = query.eq('product_id', productId);
    }

    if (keyword) {
      // 搜索产品编码/名称包含关键字的图纸
      const { data: matchedProducts } = await getSupabase()
        .from('products')
        .select('id')
        .or(`code.ilike.%${keyword}%,name.ilike.%${keyword}%,spec.ilike.%${keyword}%`);

      if (matchedProducts && matchedProducts.length > 0) {
        const productIds = matchedProducts.map((p: { id: string }) => p.id);
        query = query.in('product_id', productIds);
      } else {
        return NextResponse.json([]);
      }
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 单独查询关联的产品信息（避免依赖PostgREST join语法）
    const productIds = [...new Set((data || []).map((d: Record<string, unknown>) => d.product_id as string))];
    const productsMap: Record<string, { id: string; code: string; name: string; spec: string | null }> = {};
    if (productIds.length > 0) {
      const { data: products } = await getSupabase()
        .from('products')
        .select('id, code, name, spec')
        .in('id', productIds);
      (products || []).forEach((p: { id: string; code: string; name: string; spec: string | null }) => {
        productsMap[p.id] = p;
      });
    }

    // 为每个图纸生成URL并附加产品信息
    const drawingsWithUrl = await Promise.all((data || []).map(async (d: Record<string, unknown>) => {
      try {
        const url = await getFileUrl(d.file_key as string);
        const product = productsMap[d.product_id as string] || null;
        return { ...d, url, products: product };
      } catch {
        const product = productsMap[d.product_id as string] || null;
        return { ...d, url: null, products: product };
      }
    }));

    return NextResponse.json(drawingsWithUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取图纸列表失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/drawings — 上传图纸
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const productId = formData.get('product_id') as string;
    const remark = (formData.get('remark') as string) || '';

    if (!file || !productId) {
      return NextResponse.json({ error: '缺少文件或产品ID' }, { status: 400 });
    }

    // 上传文件
    const buffer = Buffer.from(await file.arrayBuffer());
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const result = await uploadFile(
      buffer,
      `drawings/${productId}/${sanitizedFileName}`,
      file.type || 'application/octet-stream'
    );

    // 保存图纸记录到数据库
    const { data, error } = await getSupabase()
      .from('product_drawings')
      .insert({
        product_id: productId,
        file_key: result.fileKey,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        remark,
      })
      .select('*, products(id, code, name, spec)')
      .single();

    if (error) {
      // 删除已上传的文件
      await deleteFile(result.fileKey);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 生成URL
    const url = await getFileUrl(result.fileKey);

    return NextResponse.json({ ...data, url }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '上传图纸失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/drawings?id=xxx — 删除图纸
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少图纸ID' }, { status: 400 });
    }

    // 先获取图纸记录
    const { data: drawing, error: fetchError } = await getSupabase()
      .from('product_drawings')
      .select('file_key')
      .eq('id', id)
      .single();

    if (fetchError || !drawing) {
      return NextResponse.json({ error: '图纸不存在' }, { status: 404 });
    }

    // 删除存储中的文件
    await deleteFile((drawing as Record<string, unknown>).file_key as string);

    // 删除数据库记录
    const { error } = await getSupabase().from('product_drawings').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除图纸失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
