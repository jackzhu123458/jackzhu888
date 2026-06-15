'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';

interface Warehouse {
  id: string;
  name: string;
}

interface ShipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warehouses: Warehouse[];
  onShip: (warehouseId: string) => void;
}

export default function ShipDialog({ open, onOpenChange, warehouses, onShip }: ShipDialogProps) {
  const [warehouseId, setWarehouseId] = useState('');

  const handleOpen = (val: boolean) => {
    if (val) {
      setWarehouseId(warehouses[0]?.id || '');
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认出货</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          出货后将扣减对应仓库库存，并更新客户订单已交量。此操作不可撤销。
        </p>
        <div className="mt-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">出库仓库 *</label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger>
              <SelectValue placeholder="选择仓库" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map(w => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={() => onShip(warehouseId)} disabled={!warehouseId}>
            确认出货
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
