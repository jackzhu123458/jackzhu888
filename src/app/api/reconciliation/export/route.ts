import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import ExcelJS from 'exceljs';

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

  // ====== Create workbook with ExcelJS ======
  const workbook = new ExcelJS.Workbook();

  // ====== Sheet 1: 对账汇总（数据透视表 + 分组折叠）======
  const pivotWs = workbook.addWorksheet('对账汇总', {
    properties: { outlineProperties: { summaryBelow: false, summaryRight: false } },
  });

  // Define columns
  pivotWs.columns = [
    { header: '行标签', key: 'label', width: 40 },
    { header: '求和项:数量', key: 'qty', width: 14 },
    { header: '不含税单价', key: 'priceExTax', width: 14 },
    { header: '含税单价', key: 'priceIncTax', width: 14 },
    { header: '求和项:金额', key: 'amount', width: 18 },
  ];

  // Style header row
  const headerRow = pivotWs.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF1E3A8A' } },
    };
  });

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

  let grandTotalQty = 0;
  let grandTotalAmount = 0;
  let grandTotalAmountExTax = 0;

  // Style definitions
  const catStyle = {
    font: { bold: true, size: 13, color: { argb: 'FF1E3A8A' } },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDBEAFE' } },
    alignment: { vertical: 'middle' as const },
    border: {
      top: { style: 'medium', color: { argb: 'FF93C5FD' } },
      bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
    },
  };

  const prodStyle = {
    font: { bold: true, size: 11, color: { argb: 'FF166534' } },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDCFCE7' } },
    alignment: { vertical: 'middle' as const },
    border: {
      bottom: { style: 'thin', color: { argb: 'FF86EFAC' } },
    },
  };

  const detailStyle = {
    font: { size: 10, color: { argb: 'FF374151' } },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF9FAFB' } },
    alignment: { vertical: 'middle' as const },
    border: {
      bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } },
    },
  };

  const totalStyle = {
    font: { bold: true, size: 14, color: { argb: 'FF92400E' } },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFEF3C7' } },
    alignment: { vertical: 'middle' as const },
    border: {
      top: { style: 'double', color: { argb: 'FFD97706' } },
      bottom: { style: 'double', color: { argb: 'FFD97706' } },
    },
  };

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

    // Category row
    const catRow = pivotWs.addRow([`▶ ${catName}`, catTotalQty, catWeightedPriceExTax, catWeightedPriceIncTax, catTotalAmount]);
    catRow.height = 26;
    catRow.eachCell((cell, colNumber) => {
      Object.assign(cell, catStyle);
      if (colNumber === 2) cell.numFmt = '#,##0';
      if (colNumber === 3 || colNumber === 4) cell.numFmt = '0.0000';
      if (colNumber === 5) cell.numFmt = '¥#,##0.00';
    });
    // Category row is NOT collapsed (outlineLevel 0 = visible top level)

    const productStartRow = catRow.number + 1;

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

      // Product row
      const prodRow = pivotWs.addRow([`  └─ ${productRows[0]?.product_name || productCode}`, productTotalQty, productPriceExTax, productPriceIncTax, productTotalAmount]);
      prodRow.height = 22;
      prodRow.eachCell((cell, colNumber) => {
        Object.assign(cell, prodStyle);
        if (colNumber === 2) cell.numFmt = '#,##0';
        if (colNumber === 3 || colNumber === 4) cell.numFmt = '0.0000';
        if (colNumber === 5) cell.numFmt = '¥#,##0.00';
      });
      prodRow.outlineLevel = 1;

      // Order detail rows
      for (const row of productRows) {
        const detailRow = pivotWs.addRow([`      ${row.order_no}`, row.quantity, row.price_ex_tax, row.price_inc_tax, row.amount_inc_tax]);
        detailRow.height = 20;
        detailRow.eachCell((cell, colNumber) => {
          Object.assign(cell, detailStyle);
          if (colNumber === 2) cell.numFmt = '#,##0';
          if (colNumber === 3 || colNumber === 4) cell.numFmt = '0.0000';
          if (colNumber === 5) cell.numFmt = '¥#,##0.00';
        });
        detailRow.outlineLevel = 2;
      }
    }

    // Group product + detail rows under category
    const endRow = pivotWs.rowCount;
    if (endRow >= productStartRow) {
      for (let i = productStartRow; i <= endRow; i++) {
        const r = pivotWs.getRow(i);
        if (r.outlineLevel === undefined || r.outlineLevel < 1) {
          r.outlineLevel = 1;
        }
      }
    }

    grandTotalQty += catTotalQty;
    grandTotalAmount += catTotalAmount;
    grandTotalAmountExTax += catTotalAmountExTax;
  }

  // Grand total row
  const grandWeightedExTax = grandTotalQty > 0 ? round4(grandTotalAmountExTax / grandTotalQty) : 0;
  const grandWeightedIncTax = grandTotalQty > 0 ? round4(grandTotalAmount / grandTotalQty) : 0;
  const totalRow = pivotWs.addRow(['总计', grandTotalQty, grandWeightedExTax, grandWeightedIncTax, grandTotalAmount]);
  totalRow.height = 30;
  totalRow.eachCell((cell, colNumber) => {
    Object.assign(cell, totalStyle);
    if (colNumber === 2) cell.numFmt = '#,##0';
    if (colNumber === 3 || colNumber === 4) cell.numFmt = '0.0000';
    if (colNumber === 5) cell.numFmt = '¥#,##0.00';
  });

  // ====== Sheet 2: 送货明细 ======
  const detailWs = workbook.addWorksheet('送货明细');
  detailWs.columns = [
    { header: '单号', key: 'note_no', width: 16 },
    { header: '单据日期', key: 'delivery_date', width: 12 },
    { header: '订单号码', key: 'order_no', width: 12 },
    { header: '商品编号', key: 'product_code', width: 18 },
    { header: '商品名称', key: 'product_name', width: 22 },
    { header: '单位', key: 'unit', width: 6 },
    { header: '数量', key: 'quantity', width: 10 },
    { header: '不含税单价', key: 'price_ex_tax', width: 14 },
    { header: '含税单价', key: 'price_inc_tax', width: 12 },
    { header: '金额', key: 'amount_inc_tax', width: 14 },
    { header: '不含税金额', key: 'amount_ex_tax', width: 14 },
    { header: '类目', key: 'category_name', width: 10 },
    { header: '明细备注', key: 'remark', width: 14 },
  ];

  // Style header
  const detailHeaderRow = detailWs.getRow(1);
  detailHeaderRow.height = 24;
  detailHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Add data rows
  for (const row of allRows) {
    const r = detailWs.addRow({
      note_no: row.note_no,
      delivery_date: row.delivery_date,
      order_no: row.order_no,
      product_code: row.product_code,
      product_name: row.product_name,
      unit: row.unit,
      quantity: row.quantity,
      price_ex_tax: row.price_ex_tax,
      price_inc_tax: row.price_inc_tax,
      amount_inc_tax: row.amount_inc_tax,
      amount_ex_tax: row.amount_ex_tax,
      category_name: row.category_name,
      remark: row.remark,
    });
    r.getCell('quantity').numFmt = '#,##0';
    r.getCell('price_ex_tax').numFmt = '0.0000';
    r.getCell('price_inc_tax').numFmt = '0.0000';
    r.getCell('amount_inc_tax').numFmt = '¥#,##0.00';
    r.getCell('amount_ex_tax').numFmt = '¥#,##0.00';

    // Alternate row colors
    if (r.number % 2 === 0) {
      r.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      });
    }
  }

  // Generate buffer
  const buf = await workbook.xlsx.writeBuffer();

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
