'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CustomerOrder, Customer, CategoryGroup, OrderItem } from './types';
import { resolveProduct, parseCategories, findCategoryGroup } from './types';

interface OrderPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: CustomerOrder[];
  customers: Customer[];
  categoryGroups: CategoryGroup[];
  selectedCategories: string[];
  orderInventoryMap: Record<string, { quantity: number; reserved_qty: number }>;
  onImport: (order: CustomerOrder) => void;
}

export default function OrderPickerDialog({
  open,
  onOpenChange,
  orders,
  customers,
  categoryGroups,
  selectedCategories,
  orderInventoryMap,
  onImport,
}: OrderPickerDialogProps) {
  const hasCategoryFilter = selectedCategories.length > 0;
  const [orderSearch, setOrderSearch] = useState('');
  const [onlyInStock, setOnlyInStock] = useState(true);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      if (o.order_no.toLowerCase().includes(q)) return true;
      const customerName = customers.find((c) => c.id === o.customer_id)?.name || '';
      return customerName.toLowerCase().includes(q);
    });
  }, [orders, orderSearch, customers]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>从客户订单导入</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 mb-2">
          <Input
            value={orderSearch}
            onChange={(e) => setOrderSearch(e.target.value)}
            placeholder="输入订单号或客户名模糊筛选（例：4 可匹配 44739）"
            className="h-8 text-xs max-w-sm"
          />
          <label className="text-xs text-gray-600 flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyInStock}
              onChange={(e) => setOnlyInStock(e.target.checked)}
              className="cursor-pointer"
            />
            仅显示已入库（有库存）的物料
          </label>
        </div>
        <div className="text-xs text-gray-500 mb-2">已预扣的库存可用于送货出库；勾选上方选项后会过滤掉零库存物料</div>

        {hasCategoryFilter && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-500">按类目筛选：</span>
            <div className="flex gap-1">
              {categoryGroups
                .filter(g => selectedCategories.some(c => parseCategories(g.categories).includes(c)))
                .map((g) => (
                  <span key={g.group_no} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                    {g.group_no}.{g.group_name}
                  </span>
                ))}
            </div>
            <span className="text-xs text-gray-400 ml-1">仅显示选中类目的物料</span>
          </div>
        )}

        <div className="max-h-96 overflow-auto">
          {filteredOrders.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              {orders.length === 0 ? '暂无可导入的客户订单，请先在客户订单中下推' : `没有匹配「${orderSearch}」的订单`}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="py-2 px-2 text-left">订单号</th>
                  <th className="py-2 px-2 text-left">客户</th>
                  <th className="py-2 px-2 text-left">物料</th>
                  <th className="py-2 px-2 text-left">类目</th>
                  <th className="py-2 px-2 text-right">未交数量</th>
                  <th className="py-2 px-2 text-right">可用库存</th>
                  <th className="py-2 px-2 text-right">预留</th>
                  <th className="py-2 px-2 text-center">状态</th>
                  <th className="py-2 px-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order, orderIdx) => {
                  const orderItems = (order.customer_order_items || []).filter((i: OrderItem) => Number(i.quantity) - Number(i.delivered_qty) > 0);
                  if (orderItems.length === 0) return null;

                  let filteredItems = hasCategoryFilter
                    ? orderItems.filter((item: OrderItem) => {
                        const prod = resolveProduct(item.products);
                        return prod?.category && selectedCategories.includes(prod.category);
                      })
                    : orderItems;

                  if (onlyInStock) {
                    filteredItems = filteredItems.filter((item: OrderItem) => {
                      const inv = orderInventoryMap[item.product_id];
                      return inv && Number(inv.quantity) > 0;
                    });
                  }

                  if (filteredItems.length === 0) return null;

                  return filteredItems.map((item: OrderItem, idx: number) => {
                    const undelivered = Number(item.quantity) - Number(item.delivered_qty);
                    const prod = resolveProduct(item.products);
                    const inv = orderInventoryMap[item.product_id];
                    const totalStock = inv?.quantity || 0;
                    const reservedQty = inv?.reserved_qty || 0;
                    const availableQty = totalStock - reservedQty;
                    const categoryGroup = prod?.category ? findCategoryGroup(prod.category, categoryGroups) : undefined;

                    return (
                      <tr key={`opick-${order.id}-${idx}-${orderIdx}`} className="border-b hover:bg-gray-50">
                        {idx === 0 ? (
                          <>
                            <td className="py-2 px-2 font-mono" rowSpan={filteredItems.length}>{order.order_no}</td>
                            <td className="py-2 px-2" rowSpan={filteredItems.length}>
                              {customers.find(c => c.id === order.customer_id)?.name || '-'}
                            </td>
                          </>
                        ) : null}
                        <td className="py-2 px-2">{prod?.name || '-'} <span className="text-gray-400">{prod?.code || ''}</span></td>
                        <td className="py-2 px-2">
                          {prod?.category ? (
                            <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                              {categoryGroup ? `${categoryGroup.group_no}.${categoryGroup.group_name}` : prod.category}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">{undelivered}</td>
                        <td className="py-2 px-2 text-right font-mono">
                          {totalStock > 0 ? (
                            <span className={availableQty > 0 ? 'text-green-600' : 'text-orange-500'}>{availableQty}</span>
                          ) : (
                            <span className="text-red-500">未入库</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-orange-500">{reservedQty > 0 ? reservedQty : '-'}</td>
                        <td className="py-2 px-2 text-center">
                          {totalStock > 0 ? (
                            <span className="text-xs text-green-600">已入库</span>
                          ) : (
                            <span className="text-xs text-gray-400">未入库</span>
                          )}
                        </td>
                        {idx === 0 ? (
                          <td className="py-2 px-2 text-center" rowSpan={filteredItems.length}>
                            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => onImport(order)}>
                              导入
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
