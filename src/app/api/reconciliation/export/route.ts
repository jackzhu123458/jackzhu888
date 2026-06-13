import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import * as XLSX from 'xlsx';

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(request.url);

  const customerId = searchParams.get('customer_id');
  const category = searchParams.get('category');
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  // Fetch delivered delivery notes with items + order info
  let query = supabase
    .from('delivery_notes')
    .select(`
      id, note_no, customer_id, customer_name, delivery_date, status,
      delivery_note_items(
        id, product_id, quantity, unit_price, remark, customer_order_item_id,
        products(id, code, name, spec, unit, category, price),
        customer_order_items(id, order_id, customer_orders(id, order_no))
      )
    `)
    .in('status', ['shipped', 'delivered']);

  if (customerId) {
    query = query.eq('customer_id', customerId);
  }
  if (startDate) {
    query = query.gte('delivery_date', startDate);
  }
  if (endDate) {
    query = query.lte('delivery_date', endDate);
  }

  const { data: notes, error } = await query.order('delivery_date', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build category name map
  const categoryMap = new Map<string, string>();
  {
    const { data: prods } = await supabase.from('products').select('category, name').not('category', 'is', null).neq('category', '');
    if (prods) {
      for (const p of prods) {
        const cat = p.category as string;
        if (!categoryMap.has(cat) && (p.name as string).includes('/')) {
          categoryMap.set(cat, (p.name as string).split('/')[0]);
        }
      }
    }
  }

  type FlatRow = {
    note_no: string;
    delivery_date: string;
    order_no: string;
    product_code: string;
    product_name: string;
    unit: string;
    quantity: number;
    price_ex_tax: number;
    price_inc_tax: number;
    amount_inc_tax: number;
    amount_ex_tax: number;
    category: string;
    category_name: string;
    remark: string;
  };

  const allRows: FlatRow[] = [];

  for (const note of (notes || [])) {
    for (const item of (note.delivery_note_items || [])) {
      const productArr = item.products as unknown as Array<Record<string, unknown>>;
      const product = Array.isArray(productArr) ? productArr[0] : productArr as Record<string, unknown> | null;
      if (!product) continue;

      const pCategory = product.category as string || '未分类';
      if (category && pCategory !== category) continue;

      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      const amount = qty * price;
      const priceExTax = price > 0 ? round4(price / 1.13) : 0;
      const amountExTax = round4(amount / 1.13);

      // Get order no
      let orderNo = '';
      const coiArr = item.customer_order_items as unknown as Array<Record<string, unknown>> | Record<string, unknown> | null;
      if (coiArr) {
        const coi = Array.isArray(coiArr) ? coiArr[0] : coiArr;
        const co = coi?.customer_orders as unknown as Array<Record<string, unknown>> | Record<string, unknown> | null;
        if (co) {
          const coObj = Array.isArray(co) ? co[0] : co;
          orderNo = (coObj?.order_no as string) || '';
        }
      }

      allRows.push({
        note_no: note.note_no || '',
        delivery_date: note.delivery_date ? new Date(note.delivery_date).toLocaleDateString('zh-CN') : '',
        order_no: orderNo || '-',
        product_code: (product.code as string) || '',
        product_name: (product.name as string) || '',
        unit: (product.unit as string) || '',
        quantity: qty,
        price_ex_tax: priceExTax,
        price_inc_tax: price,
        amount_inc_tax: amount,
        amount_ex_tax: amountExTax,
        category: pCategory,
        category_name: categoryMap.get(pCategory) || pCategory,
        remark: (item.remark as string) || '',
      });
    }
  }

  // Sort by category → product_code → order_no
  allRows.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.product_code !== b.product_code) return a.product_code.localeCompare(b.product_code);
    return a.order_no.localeCompare(b.order_no);
  });

  const wb = XLSX.utils.book_new();

  // ====== Sheet 1: 对账汇总（数据透视表 + Excel分组折叠）======
  // Hierarchy: 类目(level 0) → 商品(level 1) → 订单号码(level 2)
  // 列: 行标签 | 求和项:数量 | 不含税单价 | 含税单价 | 求和项:金额

  // Group by category → product_code
  const categoryGroups = new Map<string, Map<string, FlatRow[]>>();
  for (const row of allRows) {
    let catMap = categoryGroups.get(row.category);
    if (!catMap) {
      catMap = new Map();
      categoryGroups.set(row.category, catMap);
    }
    let productRows = catMap.get(row.product_code);
    if (!productRows) {
      productRows = [];
      catMap.set(row.product_code, productRows);
    }
    productRows.push(row);
  }

  // Build rows for pivot table
  const pivotData: (string | number)[][] = [];
  const outlineLevels: number[] = [];
  const rowTypes: ('header' | 'category' | 'product' | 'detail' | 'total')[] = [];

  // Header row
  pivotData.push(['行标签', '求和项:数量', '不含税单价', '含税单价', '求和项:金额']);
  outlineLevels.push(0);
  rowTypes.push('header');

  let grandTotalQty = 0;
  let grandTotalAmount = 0;
  let grandTotalAmountExTax = 0;

  for (const [cat, productMap] of categoryGroups) {
    const catName = allRows.find(r => r.category === cat)?.category_name || cat;
    let catTotalQty = 0;
    let catTotalAmount = 0;
    let catTotalAmountExTax = 0;

    for (const [, productRows] of productMap) {
      for (const row of productRows) {
        catTotalQty += row.quantity;
        catTotalAmount += row.amount_inc_tax;
        catTotalAmountExTax += row.amount_ex_tax;
      }
    }
    const catWeightedPriceExTax = catTotalQty > 0 ? round4(catTotalAmountExTax / catTotalQty) : 0;
    const catWeightedPriceIncTax = catTotalQty > 0 ? round4(catTotalAmount / catTotalQty) : 0;

    // Category summary row — with ▶ prefix and bold
    pivotData.push([`▶ ${catName}`, catTotalQty, catWeightedPriceExTax, catWeightedPriceIncTax, catTotalAmount]);
    outlineLevels.push(1);
    rowTypes.push('category');

    for (const [productCode, productRows] of productMap) {
      let productTotalQty = 0;
      let productTotalAmount = 0;
      let productTotalAmountExTax = 0;

      for (const row of productRows) {
        productTotalQty += row.quantity;
        productTotalAmount += row.amount_inc_tax;
        productTotalAmountExTax += row.amount_ex_tax;
      }
      const productPriceExTax = productRows[0]?.price_ex_tax || 0;
      const productPriceIncTax = productRows[0]?.price_inc_tax || 0;

      // Product summary row — with └─ prefix
      const productLabel = productRows[0]?.product_name || productCode;
      pivotData.push([`  └─${productLabel}`, productTotalQty, productPriceExTax, productPriceIncTax, productTotalAmount]);
      outlineLevels.push(2);
      rowTypes.push('product');

      for (const row of productRows) {
        // Order detail row — with indent spaces
        pivotData.push([`      ${row.order_no}`, row.quantity, row.price_ex_tax, row.price_inc_tax, row.amount_inc_tax]);
        outlineLevels.push(3);
        rowTypes.push('detail');
      }
    }

    grandTotalQty += catTotalQty;
    grandTotalAmount += catTotalAmount;
    grandTotalAmountExTax += catTotalAmountExTax;
  }

  // Grand total row
  const grandWeightedExTax = grandTotalQty > 0 ? round4(grandTotalAmountExTax / grandTotalQty) : 0;
  const grandWeightedIncTax = grandTotalQty > 0 ? round4(grandTotalAmount / grandTotalQty) : 0;
  pivotData.push(['总计', grandTotalQty, grandWeightedExTax, grandWeightedIncTax, grandTotalAmount]);
  outlineLevels.push(0);
  rowTypes.push('total');

  // Create worksheet
  const pivotWs = XLSX.utils.aoa_to_sheet(pivotData);
  pivotWs['!cols'] = [
    { wch: 42 }, // 行标签（加宽以容纳缩进和前缀）
    { wch: 14 }, // 求和项:数量
    { wch: 14 }, // 不含税单价
    { wch: 12 }, // 含税单价
    { wch: 16 }, // 求和项:金额
  ];

  // Set row outline levels for Excel grouping (collapsible +/- buttons)
  const rowInfos: XLSX.RowInfo[] = [];
  for (let i = 0; i < pivotData.length; i++) {
    const ol = outlineLevels[i];
    rowInfos.push({
      level: ol > 0 ? ol : undefined,
      hidden: false,
    });
  }
  pivotWs['!rows'] = rowInfos;

  // Set outline above (summary rows are ABOVE detail rows)
  if (!pivotWs['!sheetPr']) pivotWs['!sheetPr'] = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pivotWs['!sheetPr'] as Record<string, any>).outlinePr = { summaryBelow: false };

  // Apply cell styles with distinct colors per level
  for (let r = 0; r < pivotData.length; r++) {
    const type = rowTypes[r];
    for (let c = 0; c < 5; c++) {
      const cell = pivotWs[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;

      // Number formats
      if ((c === 2 || c === 3) && r > 0 && type !== 'header') {
        cell.z = '0.0000';
      }
      if (c === 4 && r > 0 && type !== 'header') {
        cell.z = '¥#,##0.00';
      }
      if (c === 1 && r > 0 && type !== 'header') {
        cell.z = '#,##0';
      }

      switch (type) {
        case 'header':
          cell.s = {
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
            fill: { fgColor: { rgb: '1E40AF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
              bottom: { style: 'medium', color: { rgb: '1E3A8A' } },
            },
          };
          break;
        case 'category':
          cell.s = {
            font: { bold: true, sz: 12, color: { rgb: '1E3A8A' } },
            fill: { fgColor: { rgb: 'DBEAFE' } },
            alignment: { vertical: 'center' },
            border: {
              bottom: { style: 'thin', color: { rgb: '93C5FD' } },
              top: { style: 'medium', color: { rgb: '93C5FD' } },
            },
          };
          break;
        case 'product':
          cell.s = {
            font: { bold: true, sz: 11, color: { rgb: '166534' } },
            fill: { fgColor: { rgb: 'DCFCE7' } },
            alignment: { vertical: 'center', indent: 1 },
            border: {
              bottom: { style: 'thin', color: { rgb: '86EFAC' } },
            },
          };
          break;
        case 'detail':
          cell.s = {
            font: { sz: 10, color: { rgb: '374151' } },
            fill: { fgColor: { rgb: 'F9FAFB' } },
            alignment: { vertical: 'center', indent: 2 },
            border: {
              bottom: { style: 'hair', color: { rgb: 'D1D5DB' } },
            },
          };
          break;
        case 'total':
          cell.s = {
            font: { bold: true, sz: 13, color: { rgb: '92400E' } },
            fill: { fgColor: { rgb: 'FEF3C7' } },
            alignment: { vertical: 'center' },
            border: {
              top: { style: 'double', color: { rgb: 'D97706' } },
              bottom: { style: 'double', color: { rgb: 'D97706' } },
            },
          };
          break;
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, pivotWs, '对账汇总');

  // ====== Sheet 2: 送货明细（原始流水）======
  const detailRows = allRows.map(row => ({
    单号: row.note_no,
    单据日期: row.delivery_date,
    订单号码: row.order_no,
    商品编号: row.product_code,
    商品名称: row.product_name,
    单位: row.unit,
    数量: row.quantity,
    不含税单价: row.price_ex_tax,
    含税单价: row.price_inc_tax,
    金额: row.amount_inc_tax,
    不含税金额: row.amount_ex_tax,
    类目: row.category_name,
    明细备注: row.remark,
  }));

  const detailWs = XLSX.utils.json_to_sheet(detailRows);
  detailWs['!cols'] = [
    { wch: 16 }, // 单号
    { wch: 12 }, // 单据日期
    { wch: 12 }, // 订单号码
    { wch: 18 }, // 商品编号
    { wch: 22 }, // 商品名称
    { wch: 6 },  // 单位
    { wch: 10 }, // 数量
    { wch: 14 }, // 不含税单价
    { wch: 12 }, // 含税单价
    { wch: 14 }, // 金额
    { wch: 14 }, // 不含税金额
    { wch: 10 }, // 类目
    { wch: 14 }, // 明细备注
  ];

  // Header style for detail sheet
  for (let c = 0; c < 13; c++) {
    const cell = detailWs[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) {
      cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 }, fill: { fgColor: { rgb: '1E40AF' } } };
    }
  }

  XLSX.utils.book_append_sheet(wb, detailWs, '送货明细');

  // Generate buffer with cellStyles enabled
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });

  // Build filename
  const dateRange = startDate && endDate
    ? `${startDate}_${endDate}`
    : new Date().toISOString().split('T')[0];
  const custPart = customerId ? `_${notes?.[0]?.customer_name || customerId}` : '_全部客户';
  const filename = `对账单${custPart}_${dateRange}.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
