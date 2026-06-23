// ============================================================
// 通用 API 工具 — Supabase 查询/分页/错误处理的公共模式
// ============================================================

import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';

/** 获取已初始化的 Supabase 客户端（API 路由统一入口） */
export function getApiClient(): SupabaseClient {
  return getSupabaseClient();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseQueryBuilder = any;

/** 构建带分页的查询 */
export function withPagination(
  query: SupabaseQueryBuilder,
  page: number = 1,
  pageSize: number = 50
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return query.range(from, to);
}

/** 安全执行 Supabase 查询，统一错误处理 */
export async function safeQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: { message: string } | null }>,
  context?: string
): Promise<T> {
  const { data, error } = await queryFn();
  if (error) {
    const msg = context ? `${context}: ${error.message}` : error.message;
    throw new Error(msg);
  }
  if (data === null) {
    throw new Error(context ? `${context}: 数据不存在` : '数据不存在');
  }
  return data;
}

/** 生成业务单号: 前缀 + 年月日 + 4位序号 */
export async function generateOrderNo(
  prefix: string,
  tableName: string,
  dateField: string = 'created_at'
): Promise<string> {
  const supabase = getApiClient();
  const today = new Date();
  const dateStr = today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const orderNoPrefix = `${prefix}${dateStr}`;

  const { count, error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true })
    .like(dateField.startsWith('created') ? 'created_at' : dateField, `${dateStr}%`);

  if (error) {
    console.error('生成单号失败:', error);
    return `${orderNoPrefix}0001`;
  }

  const seq = (count ?? 0) + 1;
  return `${orderNoPrefix}${String(seq).padStart(4, '0')}`;
}

/** 标准化 API 错误响应 */
export function apiError(error: unknown, status: number = 500): Response {
  const message = error instanceof Error ? error.message : '服务器内部错误';
  console.error(`[API Error] ${message}`);
  return Response.json({ error: message }, { status });
}

/** 标准化 API 成功响应 */
export function apiSuccess<T>(data: T, status: number = 200): Response {
  return Response.json(data, { status });
}
