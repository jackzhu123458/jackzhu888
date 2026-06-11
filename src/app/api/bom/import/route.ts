import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import iconv from 'iconv-lite';

interface ImportRow {
  category: string | number | null;
  code: string;
  name: string;
  unit: string;
  costPrice: number;
  sellPrice: number | null;
  description: string | null;
  quantity: number;
}

interface ImportResult {
  productsCreated: number;
  productsSkipped: number;
  bomCreated: number;
  errors: string[];
}

/**
 * 修复 GBK 编码乱码：
 * xlsx 库在 ESM/Next.js 环境下可能无法正确应用 codepage，
 * 导致 GBK 字节被当作 latin1 解码。此函数将错误解码的字符串
 * 还原为原始字节，再用 GBK 重新解码。
 */
function fixGbkEncoding(str: string): string {
  if (!str) return str;
  let hasHighBytes = false;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0x80 && code <= 0xff) {
      hasHighBytes = true;
      break;
    }
  }
  if (!hasHighBytes) return str;
  try {
    const bytes = Buffer.from(str, 'latin1');
    return iconv.decode(bytes, 'gbk');
  } catch {
    return str;
  }
}

/**
 * 从一组子物料名称中提取公共名称作为 BOM 组名。
 * 策略：取所有名称的最长公共前缀（以 "/" 或常见分隔符截断），
 * 如果公共前缀过短则取出现频率最高的关键词。
 */
function extractCommonName(names: string[]): string {
  if (names.length === 0) return '未命名BOM组';
  if (names.length === 1) return names[0];

  // 策略1：找到最长公共前缀，然后以 "/" 截断
  let prefix = names[0];
  for (let i = 1; i < names.length; i++) {
    while (!names[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix.length === 0) break;
    }
    if (prefix.length === 0) break;
  }

  // 以 "/" 截断到最近的关键词边界
  if (prefix.length > 0) {
    const lastSlash = prefix.lastIndexOf('/');
    if (lastSlash > 0) {
      prefix = prefix.slice(0, lastSlash);
    }
    // 去掉尾部的空格和标点
    prefix = prefix.replace(/[\s/·、，,]+$/, '');
  }

  if (prefix.length >= 2) return prefix;

  // 策略2：提取每个名称中 "/" 之前的关键词，取出现最多的
  const keywords = names.map(n => {
    const slashIdx = n.indexOf('/');
    return slashIdx > 0 ? n.slice(0, slashIdx) : n;
  });

  // 按出现频率排序
  const freq = new Map<string, number>();
  for (const kw of keywords) {
    freq.set(kw, (freq.get(kw) || 0) + 1);
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0 && sorted[0][1] >= 2) {
    return sorted[0][0];
  }

  // 策略3：返回第一个名称中 "/" 之前的部分
  const firstName = names[0];
  const slashIdx = firstName.indexOf('/');
  return slashIdx > 0 ? firstName.slice(0, slashIdx) : firstName;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const parentProductId = formData.get('parentProductId') as string | null;
    const mode = (formData.get('mode') as string) || 'single';

    if (!file) {
      return NextResponse.json({ error: '请上传 Excel 文件' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx') as typeof import('xlsx');
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(uint8, { type: 'array', codepage: 936 });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // 使用 header:1 获取原始行数据，手动匹配列
    const rawRows: (string | number | null)[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
    if (rawRows.length < 2) {
      return NextResponse.json({ error: 'Excel 文件为空或只有表头' }, { status: 400 });
    }

    // 修复所有行的 GBK 编码问题
    const fixedRows = rawRows.map(row =>
      row.map(cell => typeof cell === 'string' ? fixGbkEncoding(cell) : cell)
    );

    const headerRow = fixedRows[0].map((h) => String(h).trim());
    const dataRows = fixedRows.slice(1);

    // 通过列名模糊匹配列索引
    const colIdx = (candidates: string[]): number => {
      for (const c of candidates) {
        const idx = headerRow.findIndex((h) => h.includes(c));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    let categoryCol = colIdx(['商品类别', 'category', '类别']);
    let codeCol = colIdx(['商品编号', 'code', '编号']);
    let nameCol = colIdx(['商品名称', 'name', '名称']);
    let unitCol = colIdx(['单位', 'unit']);
    let sellPriceCol = colIdx(['商品售价', '售价', 'sell_price', 'sellPrice', 'price']);
    let descCol = colIdx(['商品描述', '描述', 'description', 'desc']);
    let quantityCol = colIdx(['用量', 'quantity', 'qty', '数量']);

    // 如果中文列名匹配失败（编码问题导致表头乱码），使用列位置兜底
    // 标准模板列序：商品类别(0) | 商品编号(1) | 商品名称(2) | 单位(3) | 成本单价(4) | 商品售价一(5) | 商品描述(6)
    if (codeCol === -1 && headerRow.length >= 3) {
      categoryCol = 0;
      codeCol = 1;
      nameCol = 2;
      unitCol = headerRow.length > 3 ? 3 : -1;
      sellPriceCol = headerRow.length > 5 ? 5 : -1;
      descCol = headerRow.length > 6 ? 6 : -1;
      quantityCol = -1;
    }

    if (codeCol === -1 || nameCol === -1) {
      return NextResponse.json({
        error: `Excel 缺少必要列（商品编号、商品名称）。当前表头: ${headerRow.join(' | ')}`,
      }, { status: 400 });
    }

    // 转换为结构化行
    const rows: ImportRow[] = dataRows
      .filter((row) => String(row[codeCol] ?? '').trim() !== '' && String(row[nameCol] ?? '').trim() !== '')
      .map((row) => ({
        category: categoryCol !== -1 ? row[categoryCol] : '0',
        code: String(row[codeCol] ?? '').trim(),
        name: String(row[nameCol] ?? '').trim(),
        unit: unitCol !== -1 ? String(row[unitCol] ?? 'PCS').trim() : 'PCS',
        costPrice: 0,
        sellPrice: sellPriceCol !== -1 ? Number(row[sellPriceCol]) || null : null,
        description: descCol !== -1 ? String(row[descCol] ?? '').trim() : null,
        quantity: quantityCol !== -1 ? Number(row[quantityCol]) || 1 : 1,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Excel 数据行为空' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 按 category 分组
    const grouped = new Map<string, ImportRow[]>();
    for (const row of rows) {
      const cat = String(row.category ?? '0').trim();
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(row);
    }

    const results: ImportResult = { productsCreated: 0, productsSkipped: 0, bomCreated: 0, errors: [] };

    if (mode === 'single' && parentProductId) {
      // 单产品模式：所有行作为选中父产品的子物料
      for (const row of rows) {
        const childProductId = await ensureProduct(client, {
          code: row.code,
          name: row.name,
          unit: row.unit,
          type: 'raw_material',
          category: String(row.category ?? ''),
          price: row.sellPrice,
          spec: row.description,
        }, results);

        if (childProductId) {
          await createBomEntry(client, parentProductId, childProductId, row.quantity, row.code, results);
        }
      }
    } else {
      // 多产品模式：按"商品类别"分组，每个非零类别组创建一个父产品 + BOM
      for (const [cat, catRows] of grouped) {
        if (cat === '0') {
          // 类别 0 的行仅作为独立物料导入
          for (const row of catRows) {
            await ensureProduct(client, {
              code: row.code,
              name: row.name,
              unit: row.unit,
              type: 'raw_material',
              category: '0',
              price: row.sellPrice,
              spec: row.description,
            }, results);
          }
          continue;
        }

        // 为该类别创建或查找一个父产品
        const parentCode = `BOM-${cat}`;
        // 从子物料名称中提取公共名称作为组名
        const parentName = extractCommonName(catRows.map(r => r.name));
        let pId = await findProductByCode(client, parentCode);

        if (!pId) {
          const { data: newParent, error: pErr } = await client
            .from('products')
            .insert({
              code: parentCode,
              name: parentName,
              unit: '套',
              type: 'finished_product',
              category: cat,
              is_active: true,
            })
            .select('id')
            .single();
          if (pErr) {
            results.errors.push(`父产品创建失败 (${parentCode}): ${pErr.message}`);
            continue;
          }
          pId = newParent.id;
          results.productsCreated++;
        } else {
          // 已存在则更新名称为最新的公共名称
          await client.from('products').update({ name: parentName }).eq('id', pId);
        }

        if (!pId) continue;

        // 该类别下的每行作为子物料
        for (const row of catRows) {
          const childProductId = await ensureProduct(client, {
            code: row.code,
            name: row.name,
            unit: row.unit,
            type: 'raw_material',
            category: cat,
            price: row.sellPrice,
            spec: row.description,
          }, results);

          if (childProductId) {
            await createBomEntry(client, pId, childProductId, row.quantity, row.code, results);
          }
        }
      }
    }

    return NextResponse.json(results, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '导入失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 创建 BOM 条目（去重）
async function createBomEntry(
  client: ReturnType<typeof getSupabaseClient>,
  parentProductId: string,
  childProductId: string,
  quantity: number,
  code: string,
  results: ImportResult
): Promise<void> {
  const { data: existing } = await client
    .from('bom')
    .select('id')
    .eq('parent_product_id', parentProductId)
    .eq('child_product_id', childProductId)
    .maybeSingle();

  if (!existing) {
    const { error: bomError } = await client.from('bom').insert({
      parent_product_id: parentProductId,
      child_product_id: childProductId,
      quantity,
    });
    if (bomError) {
      results.errors.push(`BOM 创建失败 (${code}): ${bomError.message}`);
    } else {
      results.bomCreated++;
    }
  }
}

// 查找已有产品
async function findProductByCode(client: ReturnType<typeof getSupabaseClient>, code: string): Promise<string | null> {
  const { data } = await client.from('products').select('id').eq('code', code).maybeSingle();
  return data?.id ?? null;
}

// 确保产品存在（按 code 查找，不存在则创建）
async function ensureProduct(
  client: ReturnType<typeof getSupabaseClient>,
  product: { code: string; name: string; unit: string; type: string; category: string; price: number | null; spec: string | null },
  results: ImportResult
): Promise<string | null> {
  const existing = await findProductByCode(client, product.code);
  if (existing) {
    results.productsSkipped++;
    return existing;
  }

  const { data, error } = await client
    .from('products')
    .insert({ ...product, is_active: true })
    .select('id')
    .single();

  if (error) {
    results.errors.push(`产品创建失败 (${product.code}): ${error.message}`);
    return null;
  }
  results.productsCreated++;
  return data.id;
}
