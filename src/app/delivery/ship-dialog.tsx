'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useEffect, useState } from 'react';

interface WarehouseStock {
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  reserved_qty: number;
  available: number;
}

interface ProductStock {
  product_id: string;
  product_name: string;
  product_code: string;
  required_qty: number;
  stocks: WarehouseStock[];
  /** 自动选中的仓库 id（优先有可用库存的） */
  selected_warehouse_id: string;
}

interface ShipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string | undefined;
  onShip: (warehouseAllocations: Record<string, string>) => void;
}

export default function ShipDialog({ open, onOpenChange, noteId, onShip }: ShipDialogProps) {
  const [productStocks, setProductStocks] = useState<ProductStock[]>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !noteId) {
      setProductStocks([]);
      setAllocations({});
      return;
    }

    setLoading(true);
    fetch(`/api/delivery/inventory-check?note_id=${noteId}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          alert(data.error);
          return;
        }
        const stocks: ProductStock[] = data.product_stocks || [];
        setProductStocks(stocks);

        // 自动选择：优先有可用库存的仓库
        const autoAlloc: Record<string, string> = {};
        for (const ps of stocks) {
          autoAlloc[ps.product_id] = ps.selected_warehouse_id || ps.stocks[0]?.warehouse_id || '';
        }
        setAllocations(autoAlloc);
      })
      .catch(() => alert('获取库存信息失败'))
      .finally(() => setLoading(false));
  }, [open, noteId]);

  const handleConfirm = () => {
    // 检查是否所有产品都选了仓库
    const missing = productStocks.filter(ps => !allocations[ps.product_id]);
    if (missing.length > 0) {
      alert(`以下产品未选择出库仓库：${missing.map(m => m.product_name).join('、')}`);
      return;
    }
    onShip(allocations);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>确认出货</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          出货后将扣减对应仓库库存，并更新客户订单已交量。此操作不可撤销。
        </p>

        {loading ? (
          <div className="py-8 text-center text-gray-500">加载库存信息...</div>
        ) : productStocks.length === 0 ? (
          <div className="py-8 text-center text-gray-500">无出货明细</div>
        ) : (
          <table className="w-full text-sm border-collapse mt-2">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-2 font-medium">物料</th>
                <th className="text-center p-2 font-medium">需出数量</th>
                <th className="text-left p-2 font-medium">出库仓库</th>
                <th className="text-center p-2 font-medium">库存</th>
              </tr>
            </thead>
            <tbody>
              {productStocks.map((ps, psIdx) => {
                const selectedWh = allocations[ps.product_id] || '';
                const selectedStock = ps.stocks.find(s => s.warehouse_id === selectedWh);
                return (
                  <tr key={`ps-${ps.product_id}-${psIdx}`} className="border-b">
                    <td className="p-2">
                      <div className="font-medium">{ps.product_name}</div>
                      <div className="text-xs text-gray-500">{ps.product_code}</div>
                    </td>
                    <td className="text-center p-2">{ps.required_qty}</td>
                    <td className="p-2">
                      <select
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={selectedWh}
                        onChange={e => setAllocations(prev => ({ ...prev, [ps.product_id]: e.target.value }))}
                      >
                        {ps.stocks.length === 0 && (
                          <option value="">无库存</option>
                        )}
                        {ps.stocks.map(s => (
                          <option key={s.warehouse_id} value={s.warehouse_id}>
                            {s.warehouse_name}（库存 {s.quantity}）
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-center p-2">
                      {selectedStock ? (
                        <span className={selectedStock.quantity >= ps.required_qty ? 'text-green-600' : 'text-red-600'}>
                          {selectedStock.quantity}
                        </span>
                      ) : (
                        <span className="text-red-600">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={handleConfirm}
            disabled={loading || productStocks.length === 0}
          >
            确认出货
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
