import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 模块定义：每个模块包含主表和关联子表
const MODULES: Record<string, { label: string; tables: string[]; order: number }> = {
  products: {
    label: '产品/物料',
    tables: ['products'],
    order: 1,
  },
  warehouses: {
    label: '仓库',
    tables: ['warehouses'],
    order: 2,
  },
  customers: {
    label: '客户',
    tables: ['customers'],
    order: 3,
  },
  bom: {
    label: 'BOM 物料清单',
    tables: ['bom'],
    order: 4,
  },
  inventory: {
    label: '库存',
    tables: ['inventory'],
    order: 5,
  },
  customer_orders: {
    label: '客户订单',
    tables: ['customer_orders', 'customer_order_items', 'customer_order_schedules'],
    order: 6,
  },
  production_orders: {
    label: '生产订单',
    tables: ['production_orders', 'production_order_materials'],
    order: 7,
  },
  inbound_notes: {
    label: '入库单',
    tables: ['inbound_notes', 'inbound_note_items'],
    order: 8,
  },
  delivery_notes: {
    label: '送货单',
    tables: ['delivery_notes', 'delivery_note_items'],
    order: 9,
  },
  product_drawings: {
    label: '产品图纸',
    tables: ['product_drawings'],
    order: 10,
  },
};

// GET: 获取可用模块列表
export async function GET() {
  const moduleList = Object.entries(MODULES)
    .map(([key, value]) => ({
      key,
      label: value.label,
      tables: value.tables,
      order: value.order,
    }))
    .sort((a, b) => a.order - b.order);

  return NextResponse.json({ modules: moduleList });
}

// POST: 执行备份
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const selectedModules: string[] = body.modules || [];

    if (selectedModules.length === 0) {
      return NextResponse.json({ error: '请至少选择一个模块' }, { status: 400 });
    }

    // 收集需要备份的所有表
    const tablesToBackup: string[] = [];
    for (const moduleKey of selectedModules) {
      const mod = MODULES[moduleKey];
      if (mod) {
        tablesToBackup.push(...mod.tables);
      }
    }

    // 查询每个表的数据
    const client = getSupabaseClient();
    const backupData: Record<string, unknown[]> = {};
    const tableCounts: Record<string, number> = {};

    for (const table of tablesToBackup) {
      const { data, error } = await client
        .from(table)
        .select('*');

      if (error) {
        console.error(`备份表 ${table} 失败:`, error.message);
        // 继续备份其他表
        backupData[table] = [];
        tableCounts[table] = 0;
        continue;
      }

      backupData[table] = data || [];
      tableCounts[table] = (data || []).length;
    }

    // 构建备份文件
    const backup = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      modules: selectedModules,
      module_labels: selectedModules.map(k => MODULES[k]?.label || k),
      tables: tablesToBackup,
      counts: tableCounts,
      data: backupData,
    };

    return NextResponse.json(backup);
  } catch (error) {
    console.error('备份失败:', error);
    return NextResponse.json(
      { error: `备份失败: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    );
  }
}
