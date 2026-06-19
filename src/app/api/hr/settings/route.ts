import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

// GET - 获取钉钉配置
export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['dingtalk_app_key', 'dingtalk_app_secret']);

    if (error) throw error;

    const settings: Record<string, string> = {};
    (data || []).forEach((item: { key: string; value: string }) => {
      settings[item.key] = item.value;
    });

    // 检查连接状态
    let connectionStatus = 'unconfigured';
    if (settings.dingtalk_app_key && settings.dingtalk_app_secret) {
      try {
        const tokenRes = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appKey: settings.dingtalk_app_key,
            appSecret: settings.dingtalk_app_secret,
          }),
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          connectionStatus = tokenData.accessToken ? 'connected' : 'auth_failed';
        } else {
          connectionStatus = 'auth_failed';
        }
      } catch {
        connectionStatus = 'network_error';
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        appKey: settings.dingtalk_app_key || '',
        appSecret: settings.dingtalk_app_secret ? '••••••••' + settings.dingtalk_app_secret.slice(-8) : '',
        hasFullConfig: !!(settings.dingtalk_app_key && settings.dingtalk_app_secret),
        connectionStatus,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '获取配置失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT - 更新钉钉配置
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { appKey, appSecret } = body as { appKey?: string; appSecret?: string };

    const supabase = getSupabaseClient();

    if (appKey !== undefined) {
      await supabase
        .from('system_settings')
        .upsert({ key: 'dingtalk_app_key', value: appKey, updated_at: new Date().toISOString() });
    }

    if (appSecret !== undefined && !appSecret.startsWith('••••••••')) {
      await supabase
        .from('system_settings')
        .upsert({ key: 'dingtalk_app_secret', value: appSecret, updated_at: new Date().toISOString() });
    }

    // 清除缓存的 token，强制重新获取
    await supabase.from('dingtalk_token_cache').delete().neq('id', '');

    // 验证新配置
    const finalKey = appKey !== undefined ? appKey : (await supabase.from('system_settings').select('value').eq('key', 'dingtalk_app_key').single()).data?.value;
    const finalSecret = (appSecret !== undefined && !appSecret.startsWith('••••••••'))
      ? appSecret
      : (await supabase.from('system_settings').select('value').eq('key', 'dingtalk_app_secret').single()).data?.value;

    let connectionStatus = 'unconfigured';
    if (finalKey && finalSecret) {
      try {
        const tokenRes = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appKey: finalKey, appSecret: finalSecret }),
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          connectionStatus = tokenData.accessToken ? 'connected' : 'auth_failed';
        } else {
          connectionStatus = 'auth_failed';
        }
      } catch {
        connectionStatus = 'network_error';
      }
    }

    return NextResponse.json({
      success: true,
      data: { connectionStatus },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '保存配置失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
