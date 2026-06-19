'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import type { DeliveryItem } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: DeliveryItem[];
  noteNo: string;
  customerName: string;
  deliveryDate: string;
}

function getProd(item: DeliveryItem) {
  if (!item.products) return { code: '', name: '', spec: '', unit: '个' };
  const p = Array.isArray(item.products) ? item.products[0] : item.products;
  return { code: p.code || '', name: p.name || '', spec: p.spec || '', unit: p.unit || '个' };
}

export default function InspectionReportPrintDialog({ open, onOpenChange, items, noteNo, customerName, deliveryDate }: Props) {
  const [reportData, setReportData] = useState<Array<{
    product_code: string;
    product_name: string;
    spec: string;
    unit: string;
    quantity: number;
    result: string;
    inspector: string;
    remark: string;
  }>>([]);

  useEffect(() => {
    if (open && items.length > 0) {
      // Also fetch any existing inspection reports for this delivery note
      setReportData(items.map(item => {
        const prod = getProd(item);
        return {
          product_code: prod.code,
          product_name: prod.name,
          spec: prod.spec,
          unit: prod.unit,
          quantity: Number(item.quantity) || 0,
          result: '合格',
          inspector: '',
          remark: '',
        };
      }));
    }
  }, [open, items]);

  const handlePrint = () => {
    window.print();
  };

  const handleResultChange = (index: number, value: string) => {
    setReportData(prev => prev.map((r, i) => i === index ? { ...r, result: value } : r));
  };

  const handleInspectorChange = (index: number, value: string) => {
    setReportData(prev => prev.map((r, i) => i === index ? { ...r, inspector: value } : r));
  };

  const handleRemarkChange = (index: number, value: string) => {
    setReportData(prev => prev.map((r, i) => i === index ? { ...r, remark: value } : r));
  };

  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto no-print">
        <DialogHeader>
          <DialogTitle>出厂检验报告</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end gap-2 mb-4 no-print">
          <Button size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" /> 打印
          </Button>
        </div>

        {/* Printable Area */}
        <div id="inspection-report-print" className="bg-white p-8 text-sm" style={{ minHeight: '297mm' }}>
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold mb-1">出厂检验报告</h1>
            <div className="text-xs text-gray-500">Inspection Report</div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-6 text-sm border border-gray-300 p-3">
            <div>送货单号：<span className="font-mono">{noteNo}</span></div>
            <div>客户名称：<span>{customerName}</span></div>
            <div>出货日期：<span>{deliveryDate || today}</span></div>
            <div>检验日期：<span>{today}</span></div>
          </div>

          <table className="w-full border-collapse border border-gray-400 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-400 px-2 py-2 w-8">序号</th>
                <th className="border border-gray-400 px-2 py-2">产品编号</th>
                <th className="border border-gray-400 px-2 py-2">产品名称</th>
                <th className="border border-gray-400 px-2 py-2">规格</th>
                <th className="border border-gray-400 px-2 py-2 w-16">单位</th>
                <th className="border border-gray-400 px-2 py-2 w-16">数量</th>
                <th className="border border-gray-400 px-2 py-2 w-16">检验结果</th>
                <th className="border border-gray-400 px-2 py-2">检验员</th>
                <th className="border border-gray-400 px-2 py-2">备注</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map((row, i) => (
                <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                  <td className="border border-gray-400 px-2 py-1.5 text-center">{i + 1}</td>
                  <td className="border border-gray-400 px-2 py-1.5 font-mono">{row.product_code}</td>
                  <td className="border border-gray-400 px-2 py-1.5">{row.product_name}</td>
                  <td className="border border-gray-400 px-2 py-1.5">{row.spec}</td>
                  <td className="border border-gray-400 px-2 py-1.5 text-center">{row.unit}</td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right font-mono">{row.quantity}</td>
                  <td className="border border-gray-400 px-2 py-1.5 text-center">
                    <span className="no-print">
                      <select
                        value={row.result}
                        onChange={e => handleResultChange(i, e.target.value)}
                        className="border rounded px-1 py-0.5 text-xs"
                      >
                        <option value="合格">合格</option>
                        <option value="不合格">不合格</option>
                        <option value="让步接收">让步接收</option>
                      </select>
                    </span>
                    <span className="hidden print:inline">{row.result}</span>
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5">
                    <span className="no-print">
                      <input
                        type="text"
                        value={row.inspector}
                        onChange={e => handleInspectorChange(i, e.target.value)}
                        className="border rounded px-1 py-0.5 text-xs w-full"
                        placeholder="检验员"
                      />
                    </span>
                    <span className="hidden print:inline">{row.inspector}</span>
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5">
                    <span className="no-print">
                      <input
                        type="text"
                        value={row.remark}
                        onChange={e => handleRemarkChange(i, e.target.value)}
                        className="border rounded px-1 py-0.5 text-xs w-full"
                        placeholder="备注"
                      />
                    </span>
                    <span className="hidden print:inline">{row.remark}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 grid grid-cols-3 gap-6 text-sm">
            <div className="border-t-2 border-gray-400 pt-2">
              <span className="text-gray-500">检验结论：</span>
              <span className="font-medium">经检验，上述产品符合出厂标准，准予出厂。</span>
            </div>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-6 text-sm">
            <div className="text-center">
              <div className="mb-8">检验员：__________</div>
              <div>日期：__________</div>
            </div>
            <div className="text-center">
              <div className="mb-8">审核：__________</div>
              <div>日期：__________</div>
            </div>
            <div className="text-center">
              <div className="mb-8">批准：__________</div>
              <div>日期：__________</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
