'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Download,
  Plus,
  UserCheck,
  CalendarDays,
  TrendingUp,
  Loader2,
} from 'lucide-react';

// ====== 类型定义 ======

interface Employee {
  id: string;
  user_id: string;
  user_name: string;
  department_name: string;
  position: string | null;
  mobile: string | null;
  job_number: string | null;
  status: string;
  hired_date: string | null;
  synced_at: string;
}

interface AttendanceRecord {
  id: string;
  user_id: string;
  user_name: string;
  department: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  work_duration: number;
  attendance_result: string;
  time_result: string;
}

interface SummaryData {
  totalEmployees: number;
  normalCount: number;
  lateCount: number;
  absentCount: number;
  earlyLeaveCount: number;
  avgWorkHours: number;
  totalRecords: number;
}

interface TrendItem {
  date: string;
  total: number;
  normal: number;
  late: number;
  early: number;
  absent: number;
  avgHours: number;
}

interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  created_at: string;
  dingtalk_employees?: { user_name: string; department_name: string } | null;
}

type DateRange = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';

// ====== 工具函数 ======

function getDateRange(type: DateRange): { startDate: string; endDate: string } {
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
      return {
        startDate: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
        endDate: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0],
      };
    }
    case 'lastMonth': {
      return {
        startDate: new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0],
        endDate: new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0],
      };
    }
  }
}

function formatTime(isoStr: string | null): string {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function getStatusBadge(result: string) {
  const map: Record<string, { label: string; color: string }> = {
    Normal: { label: '正常', color: 'bg-green-100 text-green-700' },
    Late: { label: '迟到', color: 'bg-yellow-100 text-yellow-700' },
    Early: { label: '早退', color: 'bg-orange-100 text-orange-700' },
    LateAndEarly: { label: '迟到+早退', color: 'bg-red-100 text-red-700' },
    NotSigned: { label: '缺卡', color: 'bg-red-100 text-red-700' },
    Absent: { label: '旷工', color: 'bg-red-200 text-red-800' },
  };
  const s = map[result] || { label: result, color: 'bg-gray-100 text-gray-700' };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>{s.label}</span>;
}

function getLeaveStatusBadge(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: '待审批', color: 'bg-yellow-100 text-yellow-700' },
    approved: { label: '已通过', color: 'bg-green-100 text-green-700' },
    rejected: { label: '已驳回', color: 'bg-red-100 text-red-700' },
  };
  const s = map[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>{s.label}</span>;
}

// ====== 主页面 ======

export default function HRPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dateRange, setDateRange] = useState<DateRange>('thisWeek');
  const [currentRange, setCurrentRange] = useState(getDateRange('thisWeek'));
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 数据
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [trend, setTrend] = useState<TrendItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  // 筛选
  const [filterDept, setFilterDept] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterKeyword, setFilterKeyword] = useState('');

  // 请假弹窗
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    employee_id: '',
    leave_type: '事假',
    start_date: '',
    end_date: '',
    days: 1,
    reason: '',
  });

  // 加载汇总
  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: currentRange.startDate,
        endDate: currentRange.endDate,
      });
      if (filterDept && filterDept !== 'all') params.set('department', filterDept);
      const resp = await fetch(`/api/hr/attendance/summary?${params}`);
      const data = await resp.json();
      if (data.success) setSummary(data.data);
    } catch (e) {
      console.error('加载统计失败', e);
    } finally {
      setLoading(false);
    }
  }, [currentRange, filterDept]);

  // 加载明细
  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: currentRange.startDate,
        endDate: currentRange.endDate,
      });
      if (filterDept && filterDept !== 'all') params.set('department', filterDept);
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus);
      if (filterKeyword) params.set('keyword', filterKeyword);
      const resp = await fetch(`/api/hr/attendance/detail?${params}`);
      const data = await resp.json();
      if (data.success) setRecords(data.data);
    } catch (e) {
      console.error('加载明细失败', e);
    } finally {
      setLoading(false);
    }
  }, [currentRange, filterDept, filterStatus, filterKeyword]);

  // 加载趋势
  const loadTrend = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        startDate: currentRange.startDate,
        endDate: currentRange.endDate,
      });
      const resp = await fetch(`/api/hr/attendance/trend?${params}`);
      const data = await resp.json();
      if (data.success) setTrend(data.data);
    } catch (e) {
      console.error('加载趋势失败', e);
    }
  }, [currentRange]);

  // 加载员工
  const loadEmployees = useCallback(async () => {
    try {
      const resp = await fetch('/api/hr/employees');
      const data = await resp.json();
      if (data.success) {
        setEmployees(data.data);
        setDepartments(data.departments || []);
      }
    } catch (e) {
      console.error('加载员工失败', e);
    }
  }, []);

  // 加载请假
  const loadLeaves = useCallback(async () => {
    try {
      const resp = await fetch('/api/hr/leaves');
      const data = await resp.json();
      if (data.success) setLeaves(data.data);
    } catch (e) {
      console.error('加载请假失败', e);
    }
  }, []);

  // 钉钉同步
  const handleSync = async (type: 'employees' | 'attendance') => {
    setSyncing(true);
    setMessage(null);
    try {
      const resp = await fetch('/api/hr/attendance/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          startDate: currentRange.startDate,
          endDate: currentRange.endDate,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        if (type === 'employees') loadEmployees();
        else {
          loadSummary();
          loadDetail();
          loadTrend();
        }
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: unknown) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : '同步失败' });
    } finally {
      setSyncing(false);
    }
  };

  // 导出
  const handleExport = () => {
    const params = new URLSearchParams({
      startDate: currentRange.startDate,
      endDate: currentRange.endDate,
    });
    if (filterDept && filterDept !== 'all') params.set('department', filterDept);
    window.open(`/api/hr/export?${params}`);
  };

  // 提交请假
  const handleLeaveSubmit = async () => {
    try {
      const resp = await fetch('/api/hr/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leaveForm),
      });
      const data = await resp.json();
      if (data.success) {
        setLeaveOpen(false);
        loadLeaves();
        setMessage({ type: 'success', text: '请假申请已提交' });
      } else {
        setMessage({ type: 'error', text: data.error });
      }
    } catch (e: unknown) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : '提交失败' });
    }
  };

  // 审批请假
  const handleLeaveAction = async (id: string, action: 'approved' | 'rejected', rejectReason?: string) => {
    try {
      const resp = await fetch('/api/hr/leaves', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          status: action,
          approved_by: '管理员',
          reject_reason: rejectReason,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        loadLeaves();
        setMessage({ type: 'success', text: action === 'approved' ? '已通过' : '已驳回' });
      }
    } catch (e: unknown) {
      setMessage({ type: 'error', text: e instanceof Error ? e.message : '操作失败' });
    }
  };

  // 日期范围切换
  const handleDateRangeChange = (type: DateRange) => {
    setDateRange(type);
    setCurrentRange(getDateRange(type));
  };

  // 初始加载
  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadSummary();
      loadTrend();
    } else if (activeTab === 'detail') {
      loadDetail();
    } else if (activeTab === 'leave') {
      loadLeaves();
    }
  }, [activeTab, currentRange, loadSummary, loadDetail, loadTrend, loadLeaves]);

  return (
    <div className="p-6 space-y-4">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">人事考勤管理</h1>
          <p className="text-sm text-gray-500 mt-1">钉钉实时数据</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSync('employees')}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            同步员工
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSync('attendance')}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            刷新考勤
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            导出Excel
          </Button>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`px-4 py-2 rounded text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
          <button className="float-right font-bold" onClick={() => setMessage(null)}>x</button>
        </div>
      )}

      {/* 日期范围选择 */}
      <div className="flex items-center gap-2">
        {(['thisWeek', 'lastWeek', 'thisMonth', 'lastMonth'] as DateRange[]).map(type => (
          <Button
            key={type}
            variant={dateRange === type ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleDateRangeChange(type)}
          >
            {type === 'thisWeek' ? '本周' : type === 'lastWeek' ? '上周' : type === 'thisMonth' ? '本月' : '上月'}
          </Button>
        ))}
        <span className="text-sm text-gray-500 ml-2">
          {currentRange.startDate} 至 {currentRange.endDate}
        </span>
      </div>

      {/* 标签页 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard">
            <TrendingUp className="h-4 w-4 mr-1" />
            考勤看板
          </TabsTrigger>
          <TabsTrigger value="detail">
            <Clock className="h-4 w-4 mr-1" />
            考勤明细
          </TabsTrigger>
          <TabsTrigger value="leave">
            <CalendarDays className="h-4 w-4 mr-1" />
            请假管理
          </TabsTrigger>
          <TabsTrigger value="employees">
            <Users className="h-4 w-4 mr-1" />
            员工管理
          </TabsTrigger>
        </TabsList>

        {/* ====== 考勤看板 ====== */}
        <TabsContent value="dashboard" className="space-y-4">
          {/* 统计卡片 */}
          <div className="grid grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">应出勤人数</p>
                    <p className="text-2xl font-bold text-gray-900">{summary?.totalEmployees || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-50 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">正常出勤</p>
                    <p className="text-2xl font-bold text-green-600">{summary?.normalCount || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">迟到次数</p>
                    <p className="text-2xl font-bold text-yellow-600">{summary?.lateCount || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-50 rounded-lg">
                    <XCircle className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">缺卡次数</p>
                    <p className="text-2xl font-bold text-red-600">{summary?.absentCount || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-50 rounded-lg">
                    <Clock className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">平均工时</p>
                    <p className="text-2xl font-bold text-purple-600">{summary?.avgWorkHours || 0}h</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 趋势图（简易柱状图） */}
          <Card>
            <CardContent className="pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-4">考勤趋势</h3>
              {trend.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">暂无数据，请先同步考勤</p>
              ) : (
                <div className="space-y-2">
                  {trend.map(item => (
                    <div key={item.date} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-20 shrink-0">{item.date}</span>
                      <div className="flex-1 flex items-center gap-1 h-6">
                        {item.normal > 0 && (
                          <div
                            className="bg-green-400 h-4 rounded-sm min-w-[2px]"
                            style={{ width: `${(item.normal / Math.max(item.total, 1)) * 100}%` }}
                            title={`正常 ${item.normal}`}
                          />
                        )}
                        {item.late > 0 && (
                          <div
                            className="bg-yellow-400 h-4 rounded-sm min-w-[2px]"
                            style={{ width: `${(item.late / Math.max(item.total, 1)) * 100}%` }}
                            title={`迟到 ${item.late}`}
                          />
                        )}
                        {item.absent > 0 && (
                          <div
                            className="bg-red-400 h-4 rounded-sm min-w-[2px]"
                            style={{ width: `${(item.absent / Math.max(item.total, 1)) * 100}%` }}
                            title={`缺卡 ${item.absent}`}
                          />
                        )}
                      </div>
                      <span className="text-xs text-gray-500 w-16 shrink-0">{item.avgHours}h</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded-sm" />正常</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-400 rounded-sm" />迟到</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm" />缺卡</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== 考勤明细 ====== */}
        <TabsContent value="detail" className="space-y-4">
          {/* 筛选栏 */}
          <div className="flex items-center gap-3">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="normal">正常</SelectItem>
                <SelectItem value="late">迟到</SelectItem>
                <SelectItem value="early">早退</SelectItem>
                <SelectItem value="absent">缺卡</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="全部部门" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部部门</SelectItem>
                {departments.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="w-48"
              placeholder="搜索姓名"
              value={filterKeyword}
              onChange={e => setFilterKeyword(e.target.value)}
            />
          </div>

          {/* 明细表格 */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">序</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>部门</TableHead>
                    <TableHead>日期</TableHead>
                    <TableHead>上班打卡</TableHead>
                    <TableHead>下班打卡</TableHead>
                    <TableHead>工作时长</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-gray-400 py-8">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : records.map((r, i) => (
                    <TableRow key={r.id} className={r.time_result !== 'Normal' ? 'bg-red-50/50' : ''}>
                      <TableCell className="text-gray-500">{i + 1}</TableCell>
                      <TableCell className="font-medium">{r.user_name}</TableCell>
                      <TableCell className="text-gray-500">{r.department}</TableCell>
                      <TableCell className="font-mono text-sm">{r.work_date}</TableCell>
                      <TableCell className="font-mono text-sm">{formatTime(r.clock_in)}</TableCell>
                      <TableCell className="font-mono text-sm">{formatTime(r.clock_out)}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {r.work_duration > 0 ? `${r.work_duration}h` : '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(r.time_result || r.attendance_result)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <p className="text-xs text-gray-400">
            数据范围：{currentRange.startDate}至{currentRange.endDate}共 {records.length}条记录
          </p>
        </TabsContent>

        {/* ====== 请假管理 ====== */}
        <TabsContent value="leave" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">请假记录</h3>
            <Button size="sm" onClick={() => setLeaveOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              新增请假
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>员工</TableHead>
                    <TableHead>部门</TableHead>
                    <TableHead>请假类型</TableHead>
                    <TableHead>开始日期</TableHead>
                    <TableHead>结束日期</TableHead>
                    <TableHead>天数</TableHead>
                    <TableHead>事由</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="w-32">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaves.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-gray-400 py-8">
                        暂无请假记录
                      </TableCell>
                    </TableRow>
                  ) : leaves.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        {l.dingtalk_employees?.user_name || '-'}
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {l.dingtalk_employees?.department_name || '-'}
                      </TableCell>
                      <TableCell>{l.leave_type}</TableCell>
                      <TableCell className="font-mono text-sm">{l.start_date}</TableCell>
                      <TableCell className="font-mono text-sm">{l.end_date}</TableCell>
                      <TableCell>{l.days}</TableCell>
                      <TableCell className="text-gray-500 max-w-[120px] truncate">{l.reason || '-'}</TableCell>
                      <TableCell>{getLeaveStatusBadge(l.status)}</TableCell>
                      <TableCell>
                        {l.status === 'pending' && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600 h-7 px-2"
                              onClick={() => handleLeaveAction(l.id, 'approved')}
                            >
                              通过
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 h-7 px-2"
                              onClick={() => handleLeaveAction(l.id, 'rejected')}
                            >
                              驳回
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 新增请假弹窗 */}
          <Sheet open={leaveOpen} onOpenChange={setLeaveOpen}>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>新增请假</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>员工 *</Label>
                  <Select
                    value={leaveForm.employee_id}
                    onValueChange={v => setLeaveForm(prev => ({ ...prev, employee_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择员工" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map(e => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.user_name} - {e.department_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>请假类型 *</Label>
                  <Select
                    value={leaveForm.leave_type}
                    onValueChange={v => setLeaveForm(prev => ({ ...prev, leave_type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="事假">事假</SelectItem>
                      <SelectItem value="病假">病假</SelectItem>
                      <SelectItem value="年假">年假</SelectItem>
                      <SelectItem value="调休">调休</SelectItem>
                      <SelectItem value="婚假">婚假</SelectItem>
                      <SelectItem value="产假">产假</SelectItem>
                      <SelectItem value="丧假">丧假</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>开始日期 *</Label>
                    <Input
                      type="date"
                      value={leaveForm.start_date}
                      onChange={e => setLeaveForm(prev => ({ ...prev, start_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>结束日期 *</Label>
                    <Input
                      type="date"
                      value={leaveForm.end_date}
                      onChange={e => setLeaveForm(prev => ({ ...prev, end_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>请假天数 *</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={leaveForm.days}
                    onChange={e => setLeaveForm(prev => ({ ...prev, days: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <Label>请假事由</Label>
                  <Textarea
                    value={leaveForm.reason}
                    onChange={e => setLeaveForm(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder="请输入请假原因"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setLeaveOpen(false)}>取消</Button>
                  <Button
                    onClick={handleLeaveSubmit}
                    disabled={!leaveForm.employee_id || !leaveForm.start_date || !leaveForm.end_date}
                  >
                    提交
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </TabsContent>

        {/* ====== 员工管理 ====== */}
        <TabsContent value="employees" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">
              共 {employees.length} 名员工
            </h3>
            <Button size="sm" onClick={() => handleSync('employees')} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              从钉钉同步
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">序</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>部门</TableHead>
                    <TableHead>职位</TableHead>
                    <TableHead>手机号</TableHead>
                    <TableHead>工号</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>同步时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-gray-400 py-8">
                        暂无数据，请点击"从钉钉同步"
                      </TableCell>
                    </TableRow>
                  ) : employees.map((e, i) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-gray-500">{i + 1}</TableCell>
                      <TableCell className="font-medium">{e.user_name}</TableCell>
                      <TableCell className="text-gray-500">{e.department_name || '-'}</TableCell>
                      <TableCell className="text-gray-500">{e.position || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{e.mobile || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{e.job_number || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={e.status === 'active' ? 'default' : 'secondary'}>
                          {e.status === 'active' ? '在职' : '离职'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-400">
                        {new Date(e.synced_at).toLocaleString('zh-CN')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
