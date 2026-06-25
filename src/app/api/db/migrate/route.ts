import { NextResponse } from 'next/server';
import { isLocalMode } from '@/storage/database/supabase-client';

/**
 * 数据库自迁移 API - 确保所有必要的表都存在且有权限
 * POST /api/db/migrate - 执行自迁移检测
 */

async function postgrestFetch(path: string, options?: RequestInit): Promise<Response> {
  const postgrestUrl = process.env.POSTGREST_URL;
  if (!postgrestUrl) throw new Error('POSTGREST_URL not set');
  return fetch(`${postgrestUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
}

export async function POST() {
  const results: { name: string; status: string; error?: string }[] = [];

  if (isLocalMode()) {
    // 本地 PostgREST 模式：直接用 fetch 检测
    const tables = [
      'process_flows',
      'process_step_templates',
      'quality_alerts',
      'inspection_reports',
    ];

    for (const table of tables) {
      try {
        const res = await postgrestFetch(`/${table}?select=id&limit=1`);
        if (res.ok) {
          results.push({ name: table, status: 'ok' });
        } else if (res.status === 404) {
          results.push({ name: table, status: 'missing', error: '表不存在或 PostgREST schema cache 未刷新（需重启 postgrest）' });
        } else if (res.status === 403) {
          results.push({ name: table, status: 'no_permission', error: 'anon 角色无权限，需要执行 GRANT' });
          // 检测并行分支唯一约束是否正确
    // 旧约束 UNIQUE(product_id, step_order) 不支持并行分支，需要改为 UNIQUE(product_id, step_order, branch)
    try {
      // 尝试插入两条同 product_id + step_order 但不同 branch 的数据来检测约束
      const testProductId = '00000000-0000-0000-0000-000000000000';
      const testInsertRes = await postgrestFetch('/process_flows', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify([
          { product_id: testProductId, step_order: 1, step_name: '__test_A', branch: 'A' },
          { product_id: testProductId, step_order: 1, step_name: '__test_B', branch: 'B' },
        ]),
      });

      // 清理测试数据
      await postgrestFetch(`/process_flows?product_id=eq.${testProductId}`, { method: 'DELETE' });

      if (!testInsertRes.ok) {
        const text = await testInsertRes.text();
        if (text.includes('process_flows_product_id_step_order_key') || text.includes('duplicate key')) {
          results.push({
            name: 'process_flows_parallel_branch_constraint',
            status: 'error',
            error: '唯一约束不支持并行分支，需要执行迁移脚本修复 (UNIQUE(product_id, step_order) → UNIQUE(product_id, step_order, branch))',
          });
        } else {
          results.push({ name: 'process_flows_parallel_branch_constraint', status: 'error', error: `测试失败: ${text}` });
        }
      } else {
        results.push({ name: 'process_flows_parallel_branch_constraint', status: 'ok' });
      }
    } catch (e) {
      results.push({ name: 'process_flows_parallel_branch_constraint', status: 'error', error: e instanceof Error ? e.message : String(e) });
    }

  } else {
          const text = await res.text();
          results.push({ name: table, status: 'error', error: `HTTP ${res.status}: ${text}` });
        }
      } catch (e) {
        results.push({ name: table, status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    }

    // 检测工序模板数据
    try {
      const tplRes = await postgrestFetch('/process_step_templates?select=id&limit=1');
      if (tplRes.ok) {
        const tplData = await tplRes.json();
        if (Array.isArray(tplData) && tplData.length > 0) {
          results.push({ name: 'process_step_templates_data', status: 'ok' });
        } else {
          // 表存在但没数据，尝试插入预设数据
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
          const insRes = await postgrestFetch('/process_step_templates', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=ignore-duplicates' },
            body: JSON.stringify(rows),
          });
          results.push({
            name: 'process_step_templates_data',
            status: insRes.ok ? 'seeded' : 'error',
            error: insRes.ok ? undefined : `HTTP ${insRes.status}`,
          });
        }
      } else {
        results.push({ name: 'process_step_templates_data', status: 'error', error: `无法查询模板表 (HTTP ${tplRes.status})` });
      }
    } catch (e) {
      results.push({ name: 'process_step_templates_data', status: 'error', error: e instanceof Error ? e.message : String(e) });
    }

  } else {
    // 云端 Supabase 模式：使用 Supabase client
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const supabase = getSupabaseClient();

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
    // 检测并行分支唯一约束
    try {
      const testProductId = '00000000-0000-0000-0000-000000000000';
      const { error: testError } = await supabase.from('process_flows').insert([
        { product_id: testProductId, step_order: 1, step_name: '__test_A', branch: 'A' },
        { product_id: testProductId, step_order: 1, step_name: '__test_B', branch: 'B' },
      ]).select();
      // 清理
      await supabase.from('process_flows').delete().eq('product_id', testProductId);

      if (testError) {
        if (testError.message.includes('process_flows_product_id_step_order_key') || testError.message.includes('duplicate key') || testError.message.includes('unique')) {
          results.push({
            name: 'process_flows_parallel_branch_constraint',
            status: 'error',
            error: '唯一约束不支持并行分支，需要修复 (UNIQUE(product_id, step_order) → UNIQUE(product_id, step_order, branch))',
          });
        } else {
          results.push({ name: 'process_flows_parallel_branch_constraint', status: 'error', error: testError.message });
        }
      } else {
        results.push({ name: 'process_flows_parallel_branch_constraint', status: 'ok' });
      }
    } catch (e) {
      results.push({ name: 'process_flows_parallel_branch_constraint', status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
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
