'use client';

import { useState, useCallback } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle, Loader2, FileDown, FileUp } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

// 模块定义
const MODULES = [
  { key: 'products', label: '产品/物料', desc: '产品编码、名称、规格、单位等', tables: ['products'] },
  { key: 'warehouses', label: '仓库', desc: '仓库名称、位置、备注', tables: ['warehouses'] },
  { key: 'customers', label: '客户', desc: '客户名称、编码、联系人、地址', tables: ['customers'] },
  { key: 'bom', label: 'BOM 物料清单', desc: '成品与子物料关系、用量', tables: ['bom'] },
  { key: 'inventory', label: '库存', desc: '按仓库+产品的库存数量', tables: ['inventory'] },
  { key: 'customer_orders', label: '客户订单', desc: '订单主表+明细+排程', tables: ['customer_orders', 'customer_order_items', 'customer_order_schedules'] },
  { key: 'production_orders', label: '生产订单', desc: '生产订单+用料明细', tables: ['production_orders', 'production_order_materials'] },
  { key: 'inbound_notes', label: '入库单', desc: '入库单主表+物料明细', tables: ['inbound_notes', 'inbound_note_items'] },
  { key: 'delivery_notes', label: '送货单', desc: '送货单主表+物料明细', tables: ['delivery_notes', 'delivery_note_items'] },
] as const;

type ModuleKey = typeof MODULES[number]['key'];

export default function BackupPage() {
  const [selectedModules, setSelectedModules] = useState<Set<ModuleKey>>(new Set(MODULES.map(m => m.key)));
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreData, setRestoreData] = useState<Record<string, unknown> | null>(null);

  const toggleModule = (key: ModuleKey) => {
    setSelectedModules(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedModules.size === MODULES.length) {
      setSelectedModules(new Set());
    } else {
      setSelectedModules(new Set(MODULES.map(m => m.key)));
    }
  };

  // 备份
  const handleBackup = useCallback(async () => {
    if (selectedModules.size === 0) {
      setMessage({ type: 'error', text: '请至少选择一个模块' });
      return;
    }
    setBackupLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules: Array.from(selectedModules) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '备份失败' });
        return;
      }

      // 下载 JSON 文件
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `进销存备份_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const totalRows = Object.values(data.stats || {}).reduce((sum: number, s: unknown) => {
        const stat = s as { count: number };
        return sum + (stat.count || 0);
      }, 0);
      setMessage({ type: 'success', text: `备份成功！共导出 ${selectedModules.size} 个模块，${totalRows} 条记录` });
    } catch (err) {
      setMessage({ type: 'error', text: `备份失败: ${err instanceof Error ? err.message : '未知错误'}` });
    } finally {
      setBackupLoading(false);
    }
  }, [selectedModules]);

  // 选择恢复文件
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
    setRestoreData(null);
    setMessage(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (!json.data || !json.modules) {
          setMessage({ type: 'error', text: '无效的备份文件格式' });
          return;
        }
        setRestoreData(json);
        // 自动选中备份文件中包含的模块
        const availableModules = Object.keys(json.data);
        const matched = MODULES.filter(m => m.tables.some(t => availableModules.includes(t)));
        setSelectedModules(new Set(matched.map(m => m.key)));
      } catch {
        setMessage({ type: 'error', text: '文件解析失败，请确认为有效的备份文件' });
      }
    };
    reader.readAsText(file);
  }, []);

  // 恢复
  const handleRestore = useCallback(async () => {
    if (!restoreData) {
      setMessage({ type: 'error', text: '请先选择备份文件' });
      return;
    }
    if (selectedModules.size === 0) {
      setMessage({ type: 'error', text: '请至少选择一个模块' });
      return;
    }

    if (!confirm(`确定要恢复选中的 ${selectedModules.size} 个模块吗？\n\n✅ 选中模块：恢复备份数据\n🗑️ 未选中模块：清空所有数据（恢复初始状态）\n\n⚠️ 此操作不可撤销，建议先执行完整备份！`)) {
      return;
    }

    setRestoreLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup: restoreData, modules: Array.from(selectedModules) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '恢复失败' });
        return;
      }
      setMessage({ type: 'success', text: `恢复成功！${data.message}` });
      setRestoreFile(null);
      setRestoreData(null);
    } catch (err) {
      setMessage({ type: 'error', text: `恢复失败: ${err instanceof Error ? err.message : '未知错误'}` });
    } finally {
      setRestoreLoading(false);
    }
  }, [restoreData, selectedModules]);

  // 统计备份数据中每个模块的记录数
  const getModuleRecordCount = (moduleKey: string): number => {
    if (!restoreData?.data) return 0;
    const mod = MODULES.find(m => m.key === moduleKey);
    if (!mod) return 0;
    let total = 0;
    for (const table of mod.tables) {
      const rows = (restoreData.data as Record<string, unknown[]>)[table];
      if (Array.isArray(rows)) total += rows.length;
    }
    return total;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">备份与恢复</h1>
        <p className="text-sm text-gray-500 mt-1">选择需要备份或恢复的模块，支持部分模块操作</p>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`mb-4 p-3 rounded-md flex items-center gap-2 text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
          message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          {message.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
          {message.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* 模块选择 */}
      <div className="bg-white border border-gray-200 rounded-md mb-6">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="font-medium text-gray-900">选择模块</span>
          <button
            onClick={toggleAll}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {selectedModules.size === MODULES.length ? '取消全选' : '全选'}
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {MODULES.map(mod => (
            <label
              key={mod.key}
              className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                !selectedModules.has(mod.key) ? 'opacity-60' : ''
              }`}
            >
              <Checkbox
                checked={selectedModules.has(mod.key)}
                onCheckedChange={() => toggleModule(mod.key)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">{mod.label}</span>
                  {restoreData && (
                    <span className="text-xs text-gray-400">
                      {getModuleRecordCount(mod.key)} 条记录
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{mod.desc}</span>
              </div>
            </label>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
          已选择 {selectedModules.size} / {MODULES.length} 个模块
        </div>
      </div>

      {/* 备份区域 */}
      <div className="bg-white border border-gray-200 rounded-md mb-6">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <FileDown className="w-4 h-4 text-blue-600" />
          <span className="font-medium text-gray-900">数据备份</span>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm text-gray-600 mb-3">
            将选中模块的数据导出为 JSON 文件，保存到本地。备份文件包含完整的数据结构和记录，可用于日后恢复。
          </p>
          <button
            onClick={handleBackup}
            disabled={backupLoading || selectedModules.size === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {backupLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {backupLoading ? '正在备份...' : '导出备份'}
          </button>
        </div>
      </div>

      {/* 恢复区域 */}
      <div className="bg-white border border-gray-200 rounded-md mb-6">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <FileUp className="w-4 h-4 text-amber-600" />
          <span className="font-medium text-gray-900">数据恢复</span>
        </div>
        <div className="px-4 py-4">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">注意：恢复操作会重置数据</p>
              <p className="mt-1">✅ 勾选的模块：恢复备份数据 &nbsp; 🗑️ 未勾选的模块：清空数据（恢复初始状态）</p>
              <p className="mt-1">建议在恢复前先执行一次完整备份。恢复操作不可撤销。</p>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">选择备份文件</label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer"
            />
            {restoreFile && (
              <p className="mt-2 text-xs text-gray-500">
                已选择: {restoreFile.name} ({(restoreFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {restoreData && (
            <div className="mb-4 p-3 bg-gray-50 rounded-md">
              <p className="text-sm text-gray-700 font-medium mb-1">备份信息</p>
              <p className="text-xs text-gray-500">
                备份时间: {restoreData.timestamp ? new Date(restoreData.timestamp as string).toLocaleString('zh-CN') : '未知'}
              </p>
              <p className="text-xs text-gray-500">
                包含模块: {(restoreData.modules as string[]).join('、')}
              </p>
            </div>
          )}

          <button
            onClick={handleRestore}
            disabled={restoreLoading || !restoreData || selectedModules.size === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {restoreLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {restoreLoading ? '正在恢复...' : '执行恢复'}
          </button>
        </div>
      </div>
    </div>
  );
}
