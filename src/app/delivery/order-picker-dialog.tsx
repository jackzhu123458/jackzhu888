'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CustomerOrder, Customer, CategoryGroup, Product, OrderItem } from './types';
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>从客户订单导入</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-gray-500 mb-2">仅导入有库存的物料，已预扣的库存可用于送货出库</div>

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
          {orders.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">暂无可导入的客户订单，请先在客户订单中下推</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="py-2 px-2 text-left">订单号</th>
                  <th className="py-2 px-2 text-left">客户</th>
                  <th className="py-2 px-2 text-left">物料</th>
                  <th className="py-2 px-2 text-left">类目</th>
                  <th className="py-2 px-2 text-right">未交数量</th>
                  <th className="py-2 px-2 text-right">库存量</th>
                  <th className="py-2 px-2 text-center">状态</th>
                  <th className="py-2 px-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const orderItems = (order.customer_order_items || []).filter((i: OrderItem) => Number(i.quantity) - Number(i.delivered_qty) > 0);
                  if (orderItems.length === 0) return null;

                  const filteredItems = hasCategoryFilter
                    ? orderItems.filter((item: OrderItem) => {
                        const prod = resolveProduct(item.products);
                        return prod?.category && selectedCategories.includes(prod.category);
                      })
                    : orderItems;

                  if (filteredItems.length === 0) return null;

                  return filteredItems.map((item: OrderItem, idx: number) => {
                    const undelivered = Number(item.quantity) - Number(item.delivered_qty);
                    const prod = resolveProduct(item.products);
                    const totalStock = orderInventoryMap[item.product_id]?.quantity || 0;
                    const categoryGroup = prod?.category ? findCategoryGroup(prod.category, categoryGroups) : undefined;

                    return (
                      <tr key={`${order.id}-${idx}`} className="border-b hover:bg-gray-50">
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
                          {totalStock > 0 ? <span className="text-green-600">{totalStock}</span> : <span className="text-red-500">0</span>}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className="text-xs text-gray-400">导入时检查</span>
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
