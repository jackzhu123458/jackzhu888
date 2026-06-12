import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const supabase = getSupabaseClient();

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

// GET /api/drawings?product_id=xxx — 获取产品的图纸列表
// GET /api/drawings?file_key=xxx — 获取单个图纸的签名URL（用于预览/打印）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    const fileKey = searchParams.get('file_key');
    const keyword = searchParams.get('keyword');

    // 单独获取签名URL（预览/打印用）
    if (fileKey) {
      const url = await storage.generatePresignedUrl({
        key: fileKey,
        expireTime: 3600,
      });
      return NextResponse.json({ url });
    }

    let query = supabase
      .from('product_drawings')
      .select('*, products!product_drawings_product_id_products_id_fk(id, code, name, spec)')
      .order('created_at', { ascending: false });

    if (productId) {
      query = query.eq('product_id', productId);
    }

    if (keyword) {
      // 搜索产品编码/名称包含关键字的图纸
      const { data: matchedProducts } = await supabase
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

    // 为每个图纸生成签名URL
    const drawingsWithUrl = await Promise.all(
      (data || []).map(async (d: Record<string, unknown>) => {
        try {
          const url = await storage.generatePresignedUrl({
            key: d.file_key as string,
            expireTime: 3600,
          });
          return { ...d, url };
        } catch {
          return { ...d, url: null };
        }
      })
    );

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

    // 上传文件到对象存储
    const buffer = Buffer.from(await file.arrayBuffer());
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName: `drawings/${productId}/${sanitizedFileName}`,
      contentType: file.type || 'application/octet-stream',
    });

    // 保存图纸记录到数据库
    const { data, error } = await supabase
      .from('product_drawings')
      .insert({
        product_id: productId,
        file_key: fileKey,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        remark,
      })
      .select('*, products!product_drawings_product_id_products_id_fk(id, code, name, spec)')
      .single();

    if (error) {
      // 删除已上传的文件
      await storage.deleteFile({ fileKey });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 生成签名URL
    const url = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 3600,
    });

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
    const { data: drawing, error: fetchError } = await supabase
      .from('product_drawings')
      .select('file_key')
      .eq('id', id)
      .single();

    if (fetchError || !drawing) {
      return NextResponse.json({ error: '图纸不存在' }, { status: 404 });
    }

    // 删除对象存储中的文件
    await storage.deleteFile({ fileKey: (drawing as Record<string, unknown>).file_key as string });

    // 删除数据库记录
    const { error } = await supabase.from('product_drawings').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除图纸失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
