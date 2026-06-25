// ============================================================
// 共享类型定义 — 所有页面的公共接口
// ============================================================

/** 产品/物料 */
export interface Product {
  id: string;
  code: string;
  name: string;
  spec?: string;
  unit?: string;
  category?: string;
  type?: string;
  sourcing_type?: string; // self_made=自制, purchased=外购
  price?: number;
}

/** 产品精简（下拉选择用） */
export type ProductOption = Pick<Product, 'id' | 'code' | 'name' | 'spec' | 'unit' | 'type'>;

/** 客户 */
export interface Customer {
  id: string;
  name: string;
  code: string | null;
  contact: string | null;
  phone: string | null;
  address: string | null;
}

/** 客户精简 */
export type CustomerBrief = Pick<Customer, 'id' | 'name' | 'code'>;

/** 仓库 */
export interface Warehouse {
  id: string;
  name: string;
  location: string | null;
  type?: string;
  remark?: string | null;
}

/** 客户订单 */
export interface CustomerOrder {
  id: string;
  customer_id: string;
  order_no: string;
  order_date: string;
  delivery_deadline: string | null;
  status: string;
  remark: string | null;
  created_at: string;
  customers?: Customer;
  customer_order_items?: CustomerOrderItem[];
}

/** 客户订单明细 */
export interface CustomerOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  delivered_qty: number;
  reserved_qty: number;
  price: number | null;
  products?: Product;
  customer_order_schedules?: CustomerOrderSchedule[];
}

/** 订单排程 */
export interface CustomerOrderSchedule {
  id: string;
  item_id: string;
  schedule_date: string;
  quantity: number;
}

/** 生产订单 */
export interface ProductionOrder {
  id: string;
  order_no: string;
  customer_id: string | null;
  product_id: string;
  quantity: number;
  status: string;
  due_date: string | null;
  start_date: string | null;
  completed_at: string | null;
  remark: string | null;
  current_step?: number;
  customer_order_id: string | null;
  customer_order_item_id: string | null;
  delivered?: boolean;
  created_at?: string;
  updated_at?: string | null;
  customers?: { id: string; name: string } | null;
  customer_order?: { id: string; order_no: string } | null;
  products?: Product;
  production_order_materials?: ProductionOrderMaterial[];
}

/** 生产订单用料 */
export interface ProductionOrderMaterial {
  id: string;
  order_id: string;
  product_id: string;
  required_qty: number;
  prepared_qty: number;
  products?: Product;
}

/** 入库单 */
export interface InboundNote {
  id: string;
  note_no: string;
  type: string;
  production_order_id: string | null;
  warehouse_id: string;
  operator: string | null;
  status: string;
  created_at: string;
  warehouses?: Warehouse;
  inbound_note_items?: InboundNoteItem[];
}

/** 入库明细 */
export interface InboundNoteItem {
  id?: string;
  note_id?: string;
  product_id: string;
  quantity: number;
  products?: Product;
}

/** 送货单 */
export interface DeliveryNote {
  id: string;
  note_no: string;
  customer_id: string;
  customer_order_id: string | null;
  customer_name: string | null;
  warehouse_id: string;
  delivery_date: string | null;
  status: string;
  created_at: string;
  customers?: Customer;
  warehouses?: Warehouse;
  delivery_note_items?: DeliveryNoteItem[];
}

/** 送货明细 */
export interface DeliveryNoteItem {
  id?: string;
  note_id?: string;
  product_id: string;
  customer_order_item_id: string | null;
  quantity: number;
  per_box_qty: number | null;
  unit_price: number | null;
  products?: Product;
}

/** 库存记录 */
export interface InventoryRecord {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  reserved_qty: number;
  products?: Product;
  warehouses?: Warehouse;
}

/** BOM */
export interface BomItem {
  id: string;
  parent_product_id: string;
  child_product_id: string;
  quantity: number;
  products?: Product;
}

/** 工艺流程步骤 */
export interface ProcessFlowStep {
  id?: string;
  product_id: string;
  step_order: number;
  step_name: string;
  description: string | null;
  estimated_minutes: number | null;
  is_key_step: boolean;
}

/** 工艺流程（含产品信息） */
export interface ProcessFlow {
  product: Product;
  steps: ProcessFlowStep[];
}

/** 质量警示 */
export interface QualityAlert {
  id: string;
  product_id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  status: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  images: string[];
  products?: Product;
}

/** 检验报告 */
export interface InspectionReport {
  id: string;
  delivery_note_id: string | null;
  product_id: string;
  report_no: string;
  inspector: string;
  inspect_date: string;
  result: string;
  items: string[];
  remark: string | null;
  created_at: string;
  products?: Product;
}

/** 图纸 */
export interface Drawing {
  id: string;
  product_id: string;
  file_key: string;
  file_name: string;
  file_type: string;
  file_size: number;
  description: string | null;
  created_at: string;
  file_url?: string;
  products?: Product;
}
