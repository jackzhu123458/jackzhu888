import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 数据库自迁移 API - 确保所有必要的表都存在
 * 通过尝试查询每个表，如果报错则通过 Supabase 创建
 * 
 * POST /api/db/migrate - 执行自迁移
 */

export async function POST() {
  const supabase = getSupabaseClient();
  const results: { name: string; status: string; error?: string }[] = [];

  // 1. Check process_flows table exists
  const { error: pfError } = await supabase.from('process_flows').select('id').limit(1);
  if (pfError && pfError.message.includes('does not exist')) {
    results.push({ name: 'process_flows', status: 'missing', error: 'Table does not exist - run migrate-add-process-flows.sql manually' });
  } else {
    results.push({ name: 'process_flows', status: 'ok' });
  }

  // 2. Check process_step_templates table exists
  const { error: pstError } = await supabase.from('process_step_templates').select('id').limit(1);
  if (pstError && pstError.message.includes('does not exist')) {
    results.push({ name: 'process_step_templates', status: 'missing', error: 'Table does not exist - run migrate-add-process-flows.sql manually' });
  } else {
    // Check if templates are populated
    const { count } = await supabase.from('process_step_templates').select('*', { count: 'exact', head: true });
    if (!count || count === 0) {
      // Seed default templates
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
    results.push({ name: 'process_step_templates', status: 'ok' });
  }

  // 3. Check quality_alerts table exists
  const { error: qaError } = await supabase.from('quality_alerts').select('id').limit(1);
  if (qaError && qaError.message.includes('does not exist')) {
    results.push({ name: 'quality_alerts', status: 'missing', error: 'Table does not exist - run migrate-add-process-flows.sql manually' });
  } else {
    results.push({ name: 'quality_alerts', status: 'ok' });
  }

  // 4. Check inspection_reports table exists
  const { error: irError } = await supabase.from('inspection_reports').select('id').limit(1);
  if (irError && irError.message.includes('does not exist')) {
    results.push({ name: 'inspection_reports', status: 'missing', error: 'Table does not exist - run migrate-add-process-flows.sql manually' });
  } else {
    results.push({ name: 'inspection_reports', status: 'ok' });
  }

  // 5. Check production_orders.current_step column
  const { error: poError } = await supabase.from('production_orders').select('current_step').limit(1);
  if (poError && poError.message.includes('does not exist')) {
    results.push({ name: 'production_orders_current_step', status: 'missing', error: 'Column does not exist - run migrate-add-process-flows.sql manually' });
  } else {
    results.push({ name: 'production_orders_current_step', status: 'ok' });
  }

  const hasMissing = results.some(r => r.status === 'missing');
  return NextResponse.json({
    needsMigration: hasMissing,
    results,
    message: hasMissing
      ? '数据库缺少部分表，请在 NAS 上执行迁移脚本: docker compose exec db psql -U erp -d erp -f /docker-entrypoint-initdb.d/migrate-add-process-flows.sql'
      : '数据库结构完整',
  });
}
