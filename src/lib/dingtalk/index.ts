/**
 * 钉钉开放平台 API 集成服务
 * 文档: https://open.dingtalk.com/document/
 */

const DINGTALK_API_BASE = 'https://oapi.dingtalk.com';

interface DingtalkToken {
  access_token: string;
  expires_in: number;
}

interface DingtalkUser {
  userid: string;
  name: string;
  dept_id_list?: number[];
  title?: string;
  mobile?: string;
  job_number?: string;
  avatar?: string;
  hired_date?: string;
  status?: string;
}

interface DingtalkAttendanceRecord {
  userId: string;
  userName: string;
  workDate: string;
  checkType: string;
  locationResult: string;
  timeResult: string;
  planId: string;
  groupId: string;
  userCheckTime: number;
  userAddr: string;
  sourceType: string;
}

interface DingtalkDepartment {
  dept_id: number;
  name: string;
  parent_id: number;
}

// ====== Token 管理 ======

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  // 检查内存缓存
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  // 检查数据库缓存
  const { getSupabaseClient } = await import('../../storage/database/supabase-client');
  const supabase = getSupabaseClient();
  const { data: cached } = await supabase
    .from('dingtalk_token_cache')
    .select('access_token, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (cached?.access_token) {
    tokenCache = {
      token: cached.access_token,
      expiresAt: new Date(cached.expires_at).getTime(),
    };
    return cached.access_token;
  }

  // 请求新 token
  const appKey = process.env.DINGTALK_APP_KEY;
  const appSecret = process.env.DINGTALK_APP_SECRET;

  if (!appKey || !appSecret) {
    throw new Error('钉钉配置缺失: DINGTALK_APP_KEY 或 DINGTALK_APP_SECRET 未设置');
  }

  const resp = await fetch(
    `${DINGTALK_API_BASE}/gettoken?appkey=${appKey}&appsecret=${appSecret}`
  );
  const data = await resp.json();

  if (data.errcode !== 0) {
    throw new Error(`获取钉钉Token失败: ${data.errmsg}`);
  }

  // 缓存到内存
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000, // 提前5分钟过期
  };

  // 缓存到数据库
  const expiresAt = new Date(Date.now() + (data.expires_in - 300) * 1000);
  await supabase.from('dingtalk_token_cache').insert({
    access_token: data.access_token,
    expires_at: expiresAt.toISOString(),
  });

  return data.access_token;
}

// ====== API 调用量追踪 ======

async function trackApiCall(apiName: string): Promise<number> {
  const { getSupabaseClient } = await import('../../storage/database/supabase-client');
  const supabase = getSupabaseClient();
  const today = new Date().toISOString().split('T')[0];

  // 尝试更新
  const { data: existing } = await supabase
    .from('dingtalk_api_usage')
    .select('call_count')
    .eq('api_name', apiName)
    .eq('call_date', today)
    .single();

  if (existing) {
    const newCount = existing.call_count + 1;
    await supabase
      .from('dingtalk_api_usage')
      .update({ call_count: newCount, updated_at: new Date().toISOString() })
      .eq('api_name', apiName)
      .eq('call_date', today);
    return newCount;
  } else {
    await supabase.from('dingtalk_api_usage').insert({
      api_name: apiName,
      call_date: today,
      call_count: 1,
    });
    return 1;
  }
}

export async function getApiUsage(): Promise<Record<string, number>> {
  const { getSupabaseClient } = await import('../../storage/database/supabase-client');
  const supabase = getSupabaseClient();
  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('dingtalk_api_usage')
    .select('api_name, call_count')
    .eq('call_date', today);

  const result: Record<string, number> = {};
  let total = 0;
  for (const row of data || []) {
    result[row.api_name] = row.call_count;
    total += row.call_count;
  }
  result._total = total;
  return result;
}

// ====== 部门管理 ======

export async function getDepartments(): Promise<DingtalkDepartment[]> {
  const token = await getAccessToken();
  const count = await trackApiCall('department_list');

  if (count > 5000) {
    throw new Error('钉钉API本月调用量已达上限（5000次）');
  }

  const resp = await fetch(
    `${DINGTALK_API_BASE}/topapi/v2/department/listsub?access_token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dept_id: 1 }),
    }
  );
  const data = await resp.json();

  if (data.errcode !== 0) {
    throw new Error(`获取部门列表失败: ${data.errmsg}`);
  }

  return data.result || [];
}

// ====== 员工管理 ======

export async function getUserList(deptId: number = 1, cursor: number = 0, size: number = 100): Promise<{
  users: DingtalkUser[];
  hasMore: boolean;
  nextCursor: number;
}> {
  const token = await getAccessToken();
  const count = await trackApiCall('user_list');

  if (count > 5000) {
    throw new Error('钉钉API本月调用量已达上限（5000次）');
  }

  const resp = await fetch(
    `${DINGTALK_API_BASE}/topapi/v2/user/list?access_token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dept_id: deptId, cursor, size }),
    }
  );
  const data = await resp.json();

  if (data.errcode !== 0) {
    throw new Error(`获取员工列表失败: ${data.errmsg}`);
  }

  return {
    users: data.result?.list || [],
    hasMore: data.result?.has_more || false,
    nextCursor: data.result?.next_cursor || 0,
  };
}

export async function syncEmployees(): Promise<number> {
  const { getSupabaseClient } = await import('../../storage/database/supabase-client');
  const supabase = getSupabaseClient();

  // 获取部门列表
  const departments = await getDepartments();
  const deptMap = new Map<number, string>();
  deptMap.set(1, '常州市武进横林新顺电器配件厂');
  for (const dept of departments) {
    deptMap.set(dept.dept_id, dept.name);
  }

  let totalSynced = 0;
  const deptIds = [1, ...departments.map(d => d.dept_id)];

  for (const deptId of deptIds) {
    let cursor = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await getUserList(deptId, cursor);
      const deptName = deptMap.get(deptId) || '未知部门';

      for (const user of result.users) {
        const record = {
          user_id: user.userid,
          user_name: user.name,
          department_id: String(deptId),
          department_name: deptName,
          position: user.title || null,
          mobile: user.mobile || null,
          job_number: user.job_number || null,
          avatar: user.avatar || null,
          status: user.status === '1' ? 'active' : (user.status === '2' ? 'inactive' : 'active'),
          hired_date: user.hired_date || null,
          synced_at: new Date().toISOString(),
        };

        await supabase
          .from('dingtalk_employees')
          .upsert(record, { onConflict: 'user_id' });

        totalSynced++;
      }

      hasMore = result.hasMore;
      cursor = result.nextCursor;
    }
  }

  return totalSynced;
}

// ====== 考勤数据 ======

export async function getAttendanceList(
  userIds: string[],
  startDate: string,
  endDate: string
): Promise<DingtalkAttendanceRecord[]> {
  const token = await getAccessToken();
  const count = await trackApiCall('attendance_list');

  if (count > 5000) {
    throw new Error('钉钉API本月调用量已达上限（5000次）');
  }

  const resp = await fetch(
    `${DINGTALK_API_BASE}/topapi/attendance/list?access_token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workDateFrom: `${startDate} 00:00:00`,
        workDateTo: `${endDate} 23:59:59`,
        userIdList: userIds,
        offset: 0,
        limit: 50,
      }),
    }
  );
  const data = await resp.json();

  if (data.errcode !== 0) {
    throw new Error(`获取考勤数据失败: ${data.errmsg}`);
  }

  return data.result?.recordresult || [];
}

export async function syncAttendance(startDate: string, endDate: string): Promise<number> {
  const { getSupabaseClient } = await import('../../storage/database/supabase-client');
  const supabase = getSupabaseClient();

  // 获取所有员工
  const { data: employees } = await supabase
    .from('dingtalk_employees')
    .select('user_id')
    .eq('status', 'active');

  if (!employees || employees.length === 0) {
    throw new Error('没有员工数据，请先同步员工');
  }

  const userIds = employees.map(e => e.user_id);
  let totalSynced = 0;

  // 钉钉API每次最多50个用户
  for (let i = 0; i < userIds.length; i += 50) {
    const batch = userIds.slice(i, i + 50);
    const records = await getAttendanceList(batch, startDate, endDate);

    for (const record of records) {
      const workDate = record.workDate?.split(' ')[0] || startDate;
      const checkTime = record.userCheckTime
        ? new Date(record.userCheckTime)
        : null;

      // 判断上下班打卡
      const isClockIn = record.checkType === 'OnDuty';
      const isClockOut = record.checkType === 'OffDuty';

      if (isClockIn || isClockOut) {
        // 查找已有记录
        const { data: existing } = await supabase
          .from('dingtalk_attendance')
          .select('id, clock_in, clock_out, work_duration, attendance_result')
          .eq('user_id', record.userId)
          .eq('work_date', workDate)
          .single();

        const updateTimeResult = record.timeResult || 'Normal';
        const attendanceResult = existing?.attendance_result || 'Normal';
        const newResult = updateTimeResult !== 'Normal' ? updateTimeResult : attendanceResult;

        if (existing) {
          const updates: Record<string, unknown> = {
            attendance_result: newResult,
            synced_at: new Date().toISOString(),
          };
          if (isClockIn && checkTime) {
            updates.clock_in = checkTime.toISOString();
          }
          if (isClockOut && checkTime) {
            updates.clock_out = checkTime.toISOString();
          }

          // 计算工时
          const clockIn = isClockIn ? checkTime : (existing.clock_in ? new Date(existing.clock_in) : null);
          const clockOut = isClockOut ? checkTime : (existing.clock_out ? new Date(existing.clock_out) : null);
          if (clockIn && clockOut) {
            const duration = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
            if (duration > 0 && duration < 24) {
              updates.work_duration = Math.round(duration * 100) / 100;
            }
          }

          await supabase
            .from('dingtalk_attendance')
            .update(updates)
            .eq('id', existing.id);
        } else {
          const insertData: Record<string, unknown> = {
            user_id: record.userId,
            user_name: record.userName,
            work_date: workDate,
            attendance_result: updateTimeResult,
            location_result: record.locationResult || null,
            source_type: record.sourceType || null,
            plan_id: record.planId || null,
            group_id: record.groupId || null,
            time_result: updateTimeResult,
            is_legal: null,
            synced_at: new Date().toISOString(),
          };
          if (isClockIn && checkTime) {
            insertData.clock_in = checkTime.toISOString();
          }
          if (isClockOut && checkTime) {
            insertData.clock_out = checkTime.toISOString();
          }

          await supabase
            .from('dingtalk_attendance')
            .insert(insertData);
        }

        totalSynced++;
      }
    }
  }

  return totalSynced;
}

// ====== 工具函数 ======

export function getDateRange(type: 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (type) {
    case 'thisWeek': {
      const day = today.getDay() || 7;
      const monday = new Date(today);
      monday.setDate(today.getDate() - day + 1);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        startDate: monday.toISOString().split('T')[0],
        endDate: sunday.toISOString().split('T')[0],
      };
    }
    case 'lastWeek': {
      const day = today.getDay() || 7;
      const lastMonday = new Date(today);
      lastMonday.setDate(today.getDate() - day + 1 - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return {
        startDate: lastMonday.toISOString().split('T')[0],
        endDate: lastSunday.toISOString().split('T')[0],
      };
    }
    case 'thisMonth': {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return {
        startDate: firstDay.toISOString().split('T')[0],
        endDate: lastDay.toISOString().split('T')[0],
      };
    }
    case 'lastMonth': {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        startDate: firstDay.toISOString().split('T')[0],
        endDate: lastDay.toISOString().split('T')[0],
      };
    }
  }
}
