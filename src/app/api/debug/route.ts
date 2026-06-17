import { NextResponse } from 'next/server';
import { getSupabaseClient, getLocalApiKey } from '@/storage/database/supabase-client';

export async function GET() {
  const debug: Record<string, unknown> = {};

  // 1. 环境变量检查
  debug.env = {
    POSTGREST_URL: process.env.POSTGREST_URL || '(not set)',
    JWT_SECRET: process.env.JWT_SECRET ? `(set, length=${process.env.JWT_SECRET.length})` : '(not set)',
    PORT: process.env.PORT || process.env.DEPLOY_RUN_PORT || '(not set)',
    COZE_PROJECT_ENV: process.env.COZE_PROJECT_ENV || '(not set)',
    NODE_ENV: process.env.NODE_ENV || '(not set)',
  };

  // 2. 本地模式检查
  debug.isLocalMode = !!process.env.POSTGREST_URL;

  // 2.5 检查生成的 JWT
  if (process.env.POSTGREST_URL) {
    try {
      const apiKey = getLocalApiKey();
      debug.localApiKey = {
        length: apiKey.length,
        header: apiKey.substring(0, 50),
        hasThreeParts: apiKey.split('.').length === 3,
        parts: apiKey.split('.').map((p: string, i: number) => ({ part: i, length: p.length })),
      };
    } catch (err) {
      debug.localApiKey = {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      };
    }
  }

  // 3. 测试 Supabase 客户端查询
  try {
    const supabase = getSupabaseClient();
    
    // 测试查询 users 表
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, display_name, is_active')
      .limit(5);

    debug.supabaseQuery = {
      success: !usersError,
      data: users,
      error: usersError ? {
        message: usersError.message,
        code: usersError.code,
        details: usersError.details,
        hint: usersError.hint,
      } : null,
    };

    // 测试查询 products 表（验证其他表是否也能访问）
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, code, name')
      .limit(3);

    debug.productsQuery = {
      success: !productsError,
      count: products?.length || 0,
      error: productsError ? {
        message: productsError.message,
        code: productsError.code,
      } : null,
    };

  } catch (err) {
    debug.supabaseQuery = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    };
  }

  // 4. 测试直接 fetch PostgREST
  if (process.env.POSTGREST_URL) {
    try {
      const res = await fetch(`${process.env.POSTGREST_URL}/users?select=id,username&limit=3`);
      const text = await res.text();
      debug.directPostgREST = {
        status: res.status,
        statusText: res.statusText,
        body: text.substring(0, 500),
      };
    } catch (err) {
      debug.directPostgREST = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json(debug, { status: 200 });
}
