import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 模块定义（与备份一致）
const MODULES: Record<string, { label: string; tables: string[]; order: number }> = {
  products: { label: '产品/物料', tables: ['products'], order: 1 },
  warehouses: { label: '仓库', tables: ['warehouses'], order: 2 },
  customers: { label: '客户', tables: ['customers'], order: 3 },
  bom: { label: 'BOM 物料清单', tables: ['bom'], order: 4 },
  inventory: { label: '库存', tables: ['inventory'], order: 5 },
  customer_orders: { label: '客户订单', tables: ['customer_orders', 'customer_order_items', 'customer_order_schedules'], order: 6 },
  production_orders: { label: '生产订单', tables: ['production_orders', 'production_order_materials'], order: 7 },
  inbound_notes: { label: '入库单', tables: ['inbound_notes', 'inbound_note_items'], order: 8 },
  delivery_notes: { label: '送货单', tables: ['delivery_notes', 'delivery_note_items'], order: 9 },
  product_drawings: { label: '产品图纸', tables: ['product_drawings'], order: 10 },
};

// 表的依赖顺序（先清空子表，再清空主表；先插入主表，再插入子表）
const DELETE_ORDER = [
  'delivery_note_items', 'delivery_notes',
  'inbound_note_items', 'inbound_notes',
  'production_order_materials', 'production_orders',
  'customer_order_schedules', 'customer_order_items', 'customer_orders',
  'inventory',
  'bom',
  'product_drawings',
  'customers',
  'warehouses',
  'products',
];

const INSERT_ORDER = [...DELETE_ORDER].reverse();

// POST: 执行恢复
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backupData = body.backup;
    const selectedModules: string[] = body.modules || [];

    if (!backupData || !backupData.data) {
      return NextResponse.json({ error: '无效的备份数据' }, { status: 400 });
    }

    if (selectedModules.length === 0) {
      return NextResponse.json({ error: '请至少选择一个模块' }, { status: 400 });
    }

    // 收集选中模块的表
    const tablesToRestore: string[] = [];
    for (const moduleKey of selectedModules) {
      const mod = MODULES[moduleKey];
      if (mod) {
        tablesToRestore.push(...mod.tables);
      }
    }

    // 收集未选中模块的表（这些表需要清空）
    const unselectedTables: string[] = [];
    for (const [moduleKey, mod] of Object.entries(MODULES)) {
      if (!selectedModules.includes(moduleKey)) {
        unselectedTables.push(...mod.tables);
      }
    }

    const client = getSupabaseClient();
    const results: Record<string, { action: string; count: number }> = {};

    // 1. 按反向依赖顺序清空未选中模块的表（恢复初始状态）
    const tablesToClear = DELETE_ORDER.filter(t => unselectedTables.includes(t));
    for (const table of tablesToClear) {
      const { error } = await client
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) {
        console.error(`清空表 ${table} 失败:`, error.message);
      }
      results[table] = { action: '已清空', count: 0 };
    }

    // 2. 按反向依赖顺序清空选中模块的表（准备恢复数据）
    const tablesToDelete = DELETE_ORDER.filter(t => tablesToRestore.includes(t));
    for (const table of tablesToDelete) {
      const { error } = await client
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) {
        console.error(`清空表 ${table} 失败:`, error.message);
      }
    }

    // 3. 按正向依赖顺序插入选中模块的数据
    const tablesToInsert = INSERT_ORDER.filter(t => tablesToRestore.includes(t));
    for (const table of tablesToInsert) {
      const rows = backupData.data[table];
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        results[table] = { action: '已恢复', count: 0 };
        continue;
      }

      const { error: insertError } = await client
        .from(table)
        .insert(rows);

      if (insertError) {
        console.error(`插入表 ${table} 失败:`, insertError.message);
        results[table] = { action: '恢复失败', count: 0 };
        continue;
      }

      results[table] = { action: '已恢复', count: rows.length };
    }

    return NextResponse.json({
      success: true,
      message: `恢复完成：选中模块已恢复数据，未选中模块已清空`,
      results,
    });
  } catch (error) {
    console.error('恢复失败:', error);
    return NextResponse.json(
      { error: `恢复失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    );
  }
}
