'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Building2, Globe, Save, CheckCircle2 } from 'lucide-react';

interface CompanyInfo {
  name: string;
  short_name: string;
  code: string;
  address: string;
  contact: string;
  phone: string;
  fax: string;
  email: string;
  tax_id: string;
  bank_name: string;
  bank_account: string;
  invoice_title: string;
}

interface ApiConfig {
  erp_api_url: string;
  erp_api_key: string;
  erp_api_secret: string;
  warehouse_api_url: string;
  warehouse_api_key: string;
  enabled_erp_sync: boolean;
  enabled_warehouse_sync: boolean;
  sync_interval_minutes: number;
  webhook_url: string;
  webhook_secret: string;
}

const defaultCompany: CompanyInfo = {
  name: '', short_name: '', code: '', address: '',
  contact: '', phone: '', fax: '', email: '',
  tax_id: '', bank_name: '', bank_account: '', invoice_title: '',
};

const defaultApi: ApiConfig = {
  erp_api_url: '', erp_api_key: '', erp_api_secret: '',
  warehouse_api_url: '', warehouse_api_key: '',
  enabled_erp_sync: false, enabled_warehouse_sync: false,
  sync_interval_minutes: 30, webhook_url: '', webhook_secret: '',
};

export default function SettingsPage() {
  const [company, setCompany] = useState<CompanyInfo>(defaultCompany);
  const [apiConfig, setApiConfig] = useState<ApiConfig>(defaultApi);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.company_info) setCompany({ ...defaultCompany, ...data.company_info });
        if (data.api_config) setApiConfig({ ...defaultApi, ...data.api_config });
      }
    } catch (err) {
      console.error('加载设置失败:', err);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async (key: string, value: object) => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data = await res.json();
        alert(data.error || '保存失败');
      }
    } catch {
      alert('保存失败，请检查网络');
    } finally {
      setSaving(false);
    }
  };

  const CompanyField = ({ label, field, type = 'text', placeholder = '' }: {
    label: string; field: keyof CompanyInfo; type?: string; placeholder?: string;
  }) => (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
      <Label className="text-sm text-gray-600 justify-end">{label}</Label>
      <Input
        type={type}
        value={company[field] as string}
        onChange={e => setCompany(prev => ({ ...prev, [field]: e.target.value }))}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  );

  const ApiField = ({ label, field, type = 'text', placeholder = '' }: {
    label: string; field: keyof ApiConfig; type?: string; placeholder?: string;
  }) => (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
      <Label className="text-sm text-gray-600 justify-end">{label}</Label>
      <Input
        type={type}
        value={apiConfig[field] as string | number}
        onChange={e => setApiConfig(prev => ({
          ...prev,
          [field]: type === 'number' ? Number(e.target.value) : e.target.value,
        }))}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-[960px]">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">系统设置</h1>
        {saved && (
          <span className="flex items-center gap-1 text-green-600 text-sm">
            <CheckCircle2 className="w-4 h-4" /> 已保存
          </span>
        )}
      </div>

      {/* 公司信息 */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-5 h-5 text-blue-600" />
            本公司信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <CompanyField label="公司名称" field="name" placeholder="如：新顺电器有限公司" />
            <CompanyField label="简称" field="short_name" placeholder="如：新顺" />
            <CompanyField label="公司编码" field="code" placeholder="ERP系统编码" />
            <CompanyField label="开票抬头" field="invoice_title" placeholder="发票抬头全称" />
            <CompanyField label="纳税人识别号" field="tax_id" placeholder="统一社会信用代码" />
            <CompanyField label="邮箱" field="email" type="email" placeholder="company@example.com" />
          </div>
          <Separator className="my-2" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <CompanyField label="地址" field="address" placeholder="公司注册地址" />
            <CompanyField label="联系人" field="contact" placeholder="对接联系人" />
            <CompanyField label="电话" field="phone" placeholder="联系电话" />
            <CompanyField label="传真" field="fax" placeholder="传真号码" />
            <CompanyField label="开户银行" field="bank_name" placeholder="如：中国银行XX支行" />
            <CompanyField label="银行账号" field="bank_account" placeholder="对公账户" />
          </div>
          <div className="flex justify-end pt-2">
            <Button
              onClick={() => handleSave('company_info', company)}
              disabled={saving}
              className="bg-[#1E40AF] hover:bg-[#1D4ED8]"
            >
              <Save className="w-4 h-4 mr-1" />
              {saving ? '保存中...' : '保存公司信息'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ERP 接口配置 */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="w-5 h-5 text-blue-600" />
            ERP 接口配置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium">启用 ERP 数据同步</p>
              <p className="text-xs text-gray-500">开启后系统将定时从 ERP 拉取/推送数据</p>
            </div>
            <Switch
              checked={apiConfig.enabled_erp_sync}
              onCheckedChange={v => setApiConfig(prev => ({ ...prev, enabled_erp_sync: v }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <ApiField label="API 地址" field="erp_api_url" placeholder="https://erp.example.com/api" />
            <ApiField label="API Key" field="erp_api_key" placeholder="接口密钥" />
            <ApiField label="API Secret" field="erp_api_secret" placeholder="接口密钥" />
            <ApiField label="同步间隔(分钟)" field="sync_interval_minutes" type="number" placeholder="30" />
          </div>
          <div className="flex justify-end pt-2">
            <Button
              onClick={() => handleSave('api_config', apiConfig)}
              disabled={saving}
              className="bg-[#1E40AF] hover:bg-[#1D4ED8]"
            >
              <Save className="w-4 h-4 mr-1" />
              {saving ? '保存中...' : '保存接口配置'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 仓库接口配置 */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="w-5 h-5 text-blue-600" />
            仓库系统接口配置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium">启用仓库数据同步</p>
              <p className="text-xs text-gray-500">开启后系统将定时同步库存和出入库数据</p>
            </div>
            <Switch
              checked={apiConfig.enabled_warehouse_sync}
              onCheckedChange={v => setApiConfig(prev => ({ ...prev, enabled_warehouse_sync: v }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <ApiField label="API 地址" field="warehouse_api_url" placeholder="https://wms.example.com/api" />
            <ApiField label="API Key" field="warehouse_api_key" placeholder="接口密钥" />
          </div>
          <Separator className="my-2" />
          <p className="text-sm font-medium text-gray-700">Webhook 配置</p>
          <p className="text-xs text-gray-500">系统会在出库、入库等关键操作时推送通知到指定地址</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <ApiField label="Webhook URL" field="webhook_url" placeholder="https://your-server.com/webhook" />
            <ApiField label="Webhook 密钥" field="webhook_secret" placeholder="用于验证推送来源" />
          </div>
          <div className="flex justify-end pt-2">
            <Button
              onClick={() => handleSave('api_config', apiConfig)}
              disabled={saving}
              className="bg-[#1E40AF] hover:bg-[#1D4ED8]"
            >
              <Save className="w-4 h-4 mr-1" />
              {saving ? '保存中...' : '保存接口配置'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
