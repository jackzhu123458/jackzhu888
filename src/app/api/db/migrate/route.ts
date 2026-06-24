import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 数据库自迁移 API - 确保所有必要的表都存在且有权限
 * POST /api/db/migrate - 执行自迁移检测
 */

export async function POST() {
  const supabase = getSupabaseClient();
  const results: { name: string; status: string; error?: string }[] = [];

  const tables = [
    'process_flows',
    'process_step_templates',
    'quality_alerts',
    'inspection_reports',
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error) {
      if (error.message.includes('does not exist')) {
        results.push({ name: table, status: 'missing', error: '表不存在，需要执行迁移脚本' });
      } else if (error.code === '42501' || error.message.includes('permission denied') || error.message.includes('policy')) {
        results.push({ name: table, status: 'no_permission', error: 'anon 角色无权限，需要执行 GRANT' });
      } else {
        results.push({ name: table, status: 'error', error: error.message });
      }
    } else {
      results.push({ name: table, status: 'ok' });
    }
  }

  // Check process_step_templates data
  const { count } = await supabase.from('process_step_templates').select('*', { count: 'exact', head: true });
  if (!count || count === 0) {
    const defaults = [
      '落料', '冲孔', '折弯', '成型', '焊接', '打磨', '抛光', '清洗',
      '喷涂', '烘干', '组装', '调试', '检验', '包装', '入库',
      '切割', '车削', '铣削', '钻削', '磨削', '刨削', '镗削',
      '拉削', '铰削', '攻丝', '滚齿', '插齿', '剃齿',
      '热处理', '表面处理', '电镀', '氧化', '喷涂防锈',
      '铸造', '锻造', '冲压', '挤压', '拉拔', '旋压',
      '注塑', '吹塑', '压铸', '挤出',
      '绕线', '浸漆', '烘干固化', '动平衡', '绝缘处理',
      '外观检查', '装箱', '试运行',
    ];
    const rows = defaults.map(name => ({ step_name: name }));
    const { error: insertError } = await supabase.from('process_step_templates').upsert(rows, { onConflict: 'step_name' });
    results.push({ name: 'process_step_templates_data', status: insertError ? 'error' : 'seeded', error: insertError?.message });
  } else {
    results.push({ name: 'process_step_templates_data', status: 'ok' });
  }

  // Check production_orders.current_step column
  const { error: poError } = await supabase.from('production_orders').select('current_step').limit(1);
  if (poError) {
    if (poError.message.includes('does not exist')) {
      results.push({ name: 'production_orders_current_step', status: 'missing', error: '字段不存在，需要执行迁移脚本' });
    } else {
      results.push({ name: 'production_orders_current_step', status: 'ok' });
    }
  } else {
    results.push({ name: 'production_orders_current_step', status: 'ok' });
  }

  const hasIssues = results.some(r => r.status === 'missing' || r.status === 'no_permission' || r.status === 'error');
  return NextResponse.json({
    needsMigration: hasIssues,
    results,
    message: hasIssues
      ? '数据库需要修复，请在 NAS 上执行: docker compose exec db psql -U erp -d erp -f /docker-entrypoint-initdb.d/migrate-add-process-flows.sql && docker compose restart postgrest'
      : '数据库结构完整',
  });
}
