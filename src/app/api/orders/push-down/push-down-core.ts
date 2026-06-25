import { getSupabaseClient } from '@/storage/database/supabase-client';

interface BomRow { parent_product_id: string; child_product_id: string; quantity: number }
interface InvRow { id: string; product_id: string; warehouse_id: string; quantity: number; reserved_qty: number }
interface ProductInfo { id: string; code: string; name: string; spec: string | null; unit: string | null; type: string | null; category: string | null; sourcing_type: string }

export interface PurchaseSuggestion {
  product_id: string;
  product_code: string;
  product_name: string;
  product_spec: string | null;
  required: number;
  available: number;
  shortage: number;
  used_in: string; // 用在哪个成品中
}

export interface PushDownResult {
  reserved: Array<{ product_id: string; product_name: string; quantity: number }>;
  produced: Array<{ product_id: string; product_name: string; quantity: number; production_order_id: string }>;
  shortage: Array<{ product_id: string; product_name: string; required: number; available: number }>;
  purchase_suggestions: PurchaseSuggestion[];
}

/**
 * 订单自动下推：检查BOM/库存，生成生产订单或预扣库存
 * - 自制产品（sourcing_type=self_made）→ 生成生产订单
 * - 外购原材料（sourcing_type=purchased）→ 库存不足时提示采购
 * @param orderId 客户订单ID
 * @param supabase Supabase客户端（可选，不传则自动创建）
 */
export async function pushDownOrder(orderId: string, supabase?: ReturnType<typeof getSupabaseClient>): Promise<PushDownResult> {
  const db = supabase || getSupabaseClient();

  // 1. 并行查询订单详情+BOM+库存+产品信息
  const [orderRes, bomRes, invRes, prodRes] = await Promise.all([
    db.from('customer_orders').select('*, customer_order_items(*, products(id, code, name, spec, unit, type, category, sourcing_type))').eq('id', orderId).single(),
    db.from('bom').select('parent_product_id, child_product_id, quantity'),
    db.from('inventory').select('id, product_id, warehouse_id, quantity, reserved_qty'),
    db.from('products').select('id, code, name, spec, unit, type, category, sourcing_type'),
  ]);

  const order = orderRes.data;
  if (!order) throw new Error('订单不存在');

  // 构建产品信息映射
  const productMap = new Map<string, ProductInfo>();
  if (prodRes.data) {
    for (const p of prodRes.data as ProductInfo[]) {
      productMap.set(p.id, p);
    }
  }

  const bomMap = new Map<string, BomRow[]>();
  if (bomRes.data) {
    for (const b of bomRes.data as BomRow[]) {
      const list = bomMap.get(b.parent_product_id) || [];
      list.push(b);
      bomMap.set(b.parent_product_id, list);
    }
  }

  const invMap = new Map<string, InvRow>();
  if (invRes.data) {
    // 同一产品可能在不同仓库有库存，需要汇总
    const invAgg = new Map<string, { id: string; product_id: string; quantity: number; reserved_qty: number }>();
    for (const inv of invRes.data as InvRow[]) {
      const existing = invAgg.get(inv.product_id);
      if (existing) {
        existing.quantity += Number(inv.quantity);
        existing.reserved_qty += Number(inv.reserved_qty || 0);
      } else {
        invAgg.set(inv.product_id, { id: inv.id, product_id: inv.product_id, quantity: Number(inv.quantity), reserved_qty: Number(inv.reserved_qty || 0) });
      }
    }
    for (const [productId, inv] of invAgg) {
      invMap.set(productId, inv as InvRow);
    }
  }

  const pendingItems = (order.customer_order_items || []).filter(
    (item: { delivered_qty: number | null; quantity: number }) => Number(item.quantity) - Number(item.delivered_qty || 0) > 0,
  );

  if (pendingItems.length === 0) {
    return { reserved: [], produced: [], shortage: [], purchase_suggestions: [] };
  }

  const result: PushDownResult = {
    reserved: [],
    produced: [],
    shortage: [],
    purchase_suggestions: [],
  };

  // 2. 收集所有写操作
  const updateOps: Array<() => Promise<void>> = [];
  const insertMaterials: Array<{ order_id: string; product_id: string; required_qty: number; prepared_qty: number }> = [];

  // 递归展开BOM，收集所有外购原材料需求
  const materialRequirements = new Map<string, { product: ProductInfo; required: number; usedIn: Set<string> }>();

  function expandBom(parentProductId: string, parentQty: number, parentName: string) {
    const bomRecords = bomMap.get(parentProductId);
    if (!bomRecords || bomRecords.length === 0) return;

    for (const bomItem of bomRecords) {
      const childProduct = productMap.get(bomItem.child_product_id);
      const childQty = Number(bomItem.quantity) * parentQty;

      if (!childProduct) continue;

      if (childProduct.sourcing_type === 'purchased') {
        // 外购原材料 → 累计需求
        const existing = materialRequirements.get(childProduct.id);
        if (existing) {
          existing.required += childQty;
          existing.usedIn.add(parentName);
        } else {
          materialRequirements.set(childProduct.id, {
            product: childProduct,
            required: childQty,
            usedIn: new Set([parentName]),
          });
        }
      } else {
        // 自制半成品 → 继续递归展开
        expandBom(childProduct.id, childQty, childProduct.name);
      }
    }
  }

  for (const item of pendingItems) {
    const product = item.products;
    const requiredQty = Number(item.quantity) - Number(item.delivered_qty || 0);
    const inventory = invMap.get(product.id);
    const availableQty = inventory ? Number(inventory.quantity) - Number(inventory.reserved_qty || 0) : 0;
    const hasBOM = bomMap.has(product.id) && (bomMap.get(product.id)?.length || 0) > 0;
    const sourcingType = product.sourcing_type || 'self_made';

    if (sourcingType === 'purchased' || (!hasBOM && sourcingType === 'purchased')) {
      // 外购成品/原材料 → 检查库存，够就预扣，不够就加入采购建议
      if (availableQty >= requiredQty) {
        // 库存充足 → 预扣
        if (inventory) {
          const invId = inventory.id;
          const newReserved = Number(inventory.reserved_qty || 0) + requiredQty;
          updateOps.push(async () => { await db.from('inventory').update({ reserved_qty: newReserved }).eq('id', invId); });
        }
        const itemId = item.id;
        const newItemReserved = Number(item.reserved_qty || 0) + requiredQty;
        updateOps.push(async () => { await db.from('customer_order_items').update({ reserved_qty: newItemReserved }).eq('id', itemId); });
        result.reserved.push({ product_id: product.id, product_name: product.name, quantity: requiredQty });
      } else {
        // 库存不足 → 预扣可用部分 + 采购建议
        if (availableQty > 0 && inventory) {
          const invId = inventory.id;
          const newReserved = Number(inventory.reserved_qty || 0) + availableQty;
          updateOps.push(async () => { await db.from('inventory').update({ reserved_qty: newReserved }).eq('id', invId); });
          const itemId = item.id;
          const newItemReserved = Number(item.reserved_qty || 0) + availableQty;
          updateOps.push(async () => { await db.from('customer_order_items').update({ reserved_qty: newItemReserved }).eq('id', itemId); });
          result.reserved.push({ product_id: product.id, product_name: product.name, quantity: availableQty });
        }

        result.purchase_suggestions.push({
          product_id: product.id,
          product_code: product.code,
          product_name: product.name,
          product_spec: product.spec,
          required: requiredQty,
          available: availableQty,
          shortage: requiredQty - availableQty,
          used_in: '订单直接需求',
        });
      }
    } else {
      // 自制产品 → 生成生产订单
      if (availableQty >= requiredQty) {
        // 库存充足 → 预扣
        if (inventory) {
          const invId = inventory.id;
          const newReserved = Number(inventory.reserved_qty || 0) + requiredQty;
          updateOps.push(async () => { await db.from('inventory').update({ reserved_qty: newReserved }).eq('id', invId); });
        }
        const itemId = item.id;
        const newItemReserved = Number(item.reserved_qty || 0) + requiredQty;
        updateOps.push(async () => { await db.from('customer_order_items').update({ reserved_qty: newItemReserved }).eq('id', itemId); });
        result.reserved.push({ product_id: product.id, product_name: product.name, quantity: requiredQty });
      } else {
        // 库存不足 → 生成生产订单
        const orderNo = `PO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        const productionQty = hasBOM ? requiredQty : Math.max(0, requiredQty - availableQty);

        if (productionQty <= 0) {
          console.warn('下推跳过：productionQty=0, product:', product.code, 'required:', requiredQty, 'available:', availableQty);
          continue;
        }

        const { data: prodOrder, error: prodError } = await db
          .from('production_orders')
          .insert({
            order_no: orderNo,
            product_id: product.id,
            quantity: productionQty,
            status: 'pending',
            due_date: item.deadline || item.delivery_date || order.deadline || null,
            customer_id: order.customer_id,
            customer_order_id: orderId,
            customer_order_item_id: item.id,
          })
          .select()
          .single();

        if (prodError) {
          console.error('创建生产订单失败:', prodError.message);
          continue;
        }

        // 递归展开BOM，收集用料
        if (hasBOM) {
          const bomRecords = bomMap.get(product.id)!;
          for (const bomItem of bomRecords) {
            insertMaterials.push({
              order_id: prodOrder.id,
              product_id: bomItem.child_product_id,
              required_qty: Number(bomItem.quantity) * requiredQty,
              prepared_qty: 0,
            });
          }

          // 递归展开，收集所有外购原材料需求
          expandBom(product.id, productionQty, product.name);
        }

        // 库存有部分可用 → 预扣可用部分
        if (availableQty > 0 && inventory) {
          const invId = inventory.id;
          const newReserved = Number(inventory.reserved_qty || 0) + availableQty;
          updateOps.push(async () => { await db.from('inventory').update({ reserved_qty: newReserved }).eq('id', invId); });
          const itemId = item.id;
          const newItemReserved = Number(item.reserved_qty || 0) + availableQty;
          updateOps.push(async () => { await db.from('customer_order_items').update({ reserved_qty: newItemReserved }).eq('id', itemId); });
          result.reserved.push({ product_id: product.id, product_name: product.name, quantity: availableQty });
        }

        result.produced.push({ product_id: product.id, product_name: product.name, quantity: productionQty, production_order_id: prodOrder.id });
      }
    }
  }

  // 3. 检查外购原材料的库存，不足的加入采购建议
  for (const [productId, req] of materialRequirements) {
    const inventory = invMap.get(productId);
    const availableQty = inventory ? Number(inventory.quantity) - Number(inventory.reserved_qty || 0) : 0;

    if (availableQty < req.required) {
      // 检查是否已经在采购建议中（可能是订单直接需求已添加）
      const existing = result.purchase_suggestions.find(s => s.product_id === productId);
      if (existing) {
        // 累加需求量
        existing.required += req.required;
        existing.shortage = existing.required - existing.available;
        existing.used_in += `、${Array.from(req.usedIn).join('、')}`;
      } else {
        result.purchase_suggestions.push({
          product_id: req.product.id,
          product_code: req.product.code,
          product_name: req.product.name,
          product_spec: req.product.spec,
          required: req.required,
          available: availableQty,
          shortage: req.required - availableQty,
          used_in: `BOM用料(${Array.from(req.usedIn).join('、')})`,
        });
      }
    }
  }

  // 4. 并行执行所有写操作
  const batchPromises = updateOps.map(fn => fn());
  if (insertMaterials.length > 0) {
    batchPromises.push((async () => { await db.from('production_order_materials').insert(insertMaterials); })());
  }
  if (result.produced.length > 0 || result.reserved.length > 0) {
    batchPromises.push((async () => { await db.from('customer_orders').update({ status: 'confirmed' }).eq('id', orderId); })());
  }
  await Promise.all(batchPromises);

  return result;
}
