import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 动态导入 xlsx
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Excel文件为空' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 获取所有产品编码映射
    const { data: products } = await supabase.from('products').select('id, code');
    const productMap = new Map<string, string>();
    if (products) {
      for (const p of products) {
        const code = (p as Record<string, unknown>).code as string;
        const id = (p as Record<string, unknown>).id as string;
        if (code) productMap.set(code.trim(), id);
      }
    }

    // 获取所有库存记录
    const { data: inventoryList } = await supabase.from('inventory').select('id, product_id, location_no');
    const inventoryByProduct = new Map<string, { id: string; locationNo: string }>();
    if (inventoryList) {
      for (const inv of inventoryList) {
        const invRec = inv as Record<string, unknown>;
        const productId = invRec.product_id as string;
        const id = invRec.id as string;
        const locationNo = (invRec.location_no as string) || '';
        inventoryByProduct.set(productId, { id, locationNo });
      }
    }

    // 解析Excel行，匹配物料编码并更新库位号
    type RowData = Record<string, unknown>;
    const results = {
      total: rows.length,
      updated: 0,
      skipped: 0,
      notFound: [] as string[],
      errors: [] as string[],
    };

    for (const row of rows) {
      // 尝试多种列名匹配
      const code = String(
        (row as RowData)['物料编码'] || (row as RowData)['编码'] || (row as RowData)['产品编码'] ||
        (row as RowData)['code'] || (row as RowData)['Code'] || (row as RowData)['产品编号'] || ''
      ).trim();

      const locationNo = String(
        (row as RowData)['库位号'] || (row as RowData)['库位'] || (row as RowData)['位置'] ||
        (row as RowData)['location'] || (row as RowData)['Location'] || ''
      ).trim();

      if (!code || !locationNo) {
        results.skipped++;
        continue;
      }

      const productId = productMap.get(code);
      if (!productId) {
        results.notFound.push(code);
        continue;
      }

      // 找到对应的库存记录，更新库位号
      const invRecord = inventoryByProduct.get(productId);
      if (invRecord) {
        const { error } = await supabase
          .from('inventory')
          .update({ location_no: locationNo })
          .eq('id', invRecord.id);
        if (error) {
          results.errors.push(`${code}: ${error.message}`);
        } else {
          results.updated++;
        }
      } else {
        // 该产品没有库存记录，跳过
        results.skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `导入完成：共${results.total}行，更新${results.updated}条，跳过${results.skipped}条，未匹配${results.notFound.length}条`,
      details: results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '导入失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
