import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { getReportBuffer, createWrappedFetch } from 'coze-coding-dev-sdk';

/* ── env loading (once, with guard) ── */

let envLoaded = false;

function loadEnv(): void {
  if (envLoaded) return;
  if (
    (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY) ||
    process.env.POSTGREST_URL
  ) {
    envLoaded = true;
    return;
  }

  try {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('dotenv').config();
      if (
        (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY) ||
        process.env.POSTGREST_URL
      ) {
        envLoaded = true;
        return;
      }
    } catch {
      // dotenv not available
    }

    const pythonCode = `
import os
import sys
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for env_var in env_vars:
        print(f"{env_var.key}={env_var.value}")
except Exception as e:
    print(f"# Error: {e}", file=sys.stderr)
`;

    const output = execSync(`python3 -c '${pythonCode.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        let value = line.substring(eqIndex + 1);
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }

    envLoaded = true;
  } catch {
    // Silently fail
  }
}

/* ── local database mode detection ── */

/**
 * When POSTGREST_URL is set, the app uses a local PostgreSQL + PostgREST
 * instead of Supabase cloud. The Supabase client connects to the app's own
 * server (http://localhost:PORT), and server.ts proxies /rest/v1/* to PostgREST.
 */
function isLocalMode(): boolean {
  return !!process.env.POSTGREST_URL;
}

function getLocalUrl(): string {
  const port = process.env.PORT || process.env.DEPLOY_RUN_PORT || '5000';
  return `http://localhost:${port}`;
}

// Dummy JWT for PostgREST — PostgREST will fail to verify it (wrong secret)
// and fall back to the configured `anon` role, which has full table access.
const LOCAL_DUMMY_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJsb2NhbCIsInJvbGUiOiJhbm9uIn0.dummykey';

/* ── singleton client cache ── */

let cachedAdminClient: SupabaseClient | null = null;
let cachedAnonClient: SupabaseClient | null = null;

function buildClient(url: string, key: string, extraHeaders?: Record<string, string>): SupabaseClient {
  // Avoid MaxListenersExceededWarning from Supabase's process event listeners
  const currentMax = process.getMaxListeners?.() ?? 10;
  if (currentMax < 20) process.setMaxListeners(20);

  const globalOptions: Record<string, unknown> = {};
  if (extraHeaders) {
    globalOptions.headers = extraHeaders;
  }
  try {
    const buffer = getReportBuffer();
    if (buffer) {
      globalOptions.fetch = createWrappedFetch(buffer, 'supabase');
    }
  } catch {
    // Silent — reporting setup failure should not block client creation
  }

  return createClient(url, key, {
    global: globalOptions,
    db: { timeout: 30000 },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Get a Supabase client (singleton per type).
 * - Without token: uses service_role key (admin, bypasses RLS) — cached as singleton
 * - With token: uses anon key + Authorization header — NOT cached (per-user token)
 */
function getSupabaseClient(token?: string): SupabaseClient {
  loadEnv();

  // Local database mode (PostgREST)
  if (isLocalMode()) {
    const url = getLocalUrl();
    if (token) {
      return buildClient(url, token, { Authorization: `Bearer ${token}` });
    }
    if (!cachedAdminClient) {
      cachedAdminClient = buildClient(url, LOCAL_DUMMY_KEY);
    }
    return cachedAdminClient;
  }

  // Cloud Supabase mode
  const url = process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.COZE_SUPABASE_ANON_KEY;
  if (!url) throw new Error('COZE_SUPABASE_URL is not set');
  if (!anonKey) throw new Error('COZE_SUPABASE_ANON_KEY is not set');

  // Per-user client with token — cannot be cached globally
  if (token) {
    return buildClient(url, anonKey, { Authorization: `Bearer ${token}` });
  }

  // Admin client — cache as singleton
  if (!cachedAdminClient) {
    const serviceRoleKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
    const key = serviceRoleKey ?? anonKey;
    cachedAdminClient = buildClient(url, key);
  }
  return cachedAdminClient;
}

function getSupabaseCredentials() {
  loadEnv();

  if (isLocalMode()) {
    return { url: getLocalUrl(), anonKey: LOCAL_DUMMY_KEY };
  }

  const url = process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.COZE_SUPABASE_ANON_KEY;
  if (!url) throw new Error('COZE_SUPABASE_URL is not set');
  if (!anonKey) throw new Error('COZE_SUPABASE_ANON_KEY is not set');
  return { url, anonKey };
}

function getSupabaseServiceRoleKey(): string | undefined {
  loadEnv();

  if (isLocalMode()) {
    return LOCAL_DUMMY_KEY;
  }

  return process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
}

export { loadEnv, getSupabaseCredentials, getSupabaseServiceRoleKey, getSupabaseClient };
