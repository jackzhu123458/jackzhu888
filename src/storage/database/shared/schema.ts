import { pgTable, serial, timestamp, varchar, integer, numeric, text, boolean, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// 系统表 - 必须保留
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 产品/物料主表
export const products = pgTable(
  "products",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 200 }).notNull(),
    spec: varchar("spec", { length: 200 }),
    unit: varchar("unit", { length: 20 }).notNull().default("个"),
    category: varchar("category", { length: 100 }),
    type: varchar("type", { length: 30 }).notNull().default("raw_material"),
    price: numeric("price", { precision: 12, scale: 2 }),
    remark: text("remark"),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("products_code_idx").on(table.code),
    index("products_type_idx").on(table.type),
    index("products_category_idx").on(table.category),
  ]
);

// 仓库
export const warehouses = pgTable(
  "warehouses",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 100 }).notNull(),
    location: varchar("location", { length: 200 }),
    remark: text("remark"),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("warehouses_name_idx").on(table.name),
  ]
);

// 库存
export const inventory = pgTable(
  "inventory",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
    warehouse_id: varchar("warehouse_id", { length: 36 }).notNull().references(() => warehouses.id),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("0"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("inventory_product_id_idx").on(table.product_id),
    index("inventory_warehouse_id_idx").on(table.warehouse_id),
  ]
);

// BOM 物料清单
export const bom = pgTable(
  "bom",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    parent_product_id: varchar("parent_product_id", { length: 36 }).notNull().references(() => products.id),
    child_product_id: varchar("child_product_id", { length: 36 }).notNull().references(() => products.id),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("bom_parent_product_id_idx").on(table.parent_product_id),
    index("bom_child_product_id_idx").on(table.child_product_id),
  ]
);

// 客户
export const customers = pgTable(
  "customers",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 200 }).notNull(),
    code: varchar("code", { length: 50 }),
    contact: varchar("contact", { length: 100 }),
    phone: varchar("phone", { length: 30 }),
    address: varchar("address", { length: 500 }),
    remark: text("remark"),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("customers_name_idx").on(table.name),
    index("customers_code_idx").on(table.code),
  ]
);

// 生产订单
export const productionOrders = pgTable(
  "production_orders",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    order_no: varchar("order_no", { length: 50 }).notNull().unique(),
    customer_id: varchar("customer_id", { length: 36 }).references(() => customers.id),
    product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    start_date: timestamp("start_date", { withTimezone: true }),
    due_date: timestamp("due_date", { withTimezone: true }),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("production_orders_order_no_idx").on(table.order_no),
    index("production_orders_customer_id_idx").on(table.customer_id),
    index("production_orders_product_id_idx").on(table.product_id),
    index("production_orders_status_idx").on(table.status),
  ]
);

// 生产订单用料明细
export const productionOrderMaterials = pgTable(
  "production_order_materials",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    order_id: varchar("order_id", { length: 36 }).notNull().references(() => productionOrders.id, { onDelete: "cascade" }),
    product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
    required_qty: numeric("required_qty", { precision: 12, scale: 2 }).notNull(),
    prepared_qty: numeric("prepared_qty", { precision: 12, scale: 2 }).notNull().default("0"),
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("production_order_materials_order_id_idx").on(table.order_id),
    index("production_order_materials_product_id_idx").on(table.product_id),
  ]
);

// 客户订单
export const customerOrders = pgTable(
  "customer_orders",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    order_no: varchar("order_no", { length: 50 }).notNull().unique(),
    customer_id: varchar("customer_id", { length: 36 }).notNull().references(() => customers.id),
    order_date: timestamp("order_date", { withTimezone: true }).defaultNow().notNull(),
    deadline: varchar("deadline", { length: 100 }),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("customer_orders_order_no_idx").on(table.order_no),
    index("customer_orders_customer_id_idx").on(table.customer_id),
    index("customer_orders_status_idx").on(table.status),
  ]
);

// 客户订单明细
export const customerOrderItems = pgTable(
  "customer_order_items",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    order_id: varchar("order_id", { length: 36 }).notNull().references(() => customerOrders.id, { onDelete: "cascade" }),
    product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    delivered_qty: numeric("delivered_qty", { precision: 12, scale: 2 }).notNull().default("0"),
    price: numeric("price", { precision: 12, scale: 2 }).default("0"),
    deadline: varchar("deadline", { length: 100 }),
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("customer_order_items_order_id_idx").on(table.order_id),
    index("customer_order_items_product_id_idx").on(table.product_id),
  ]
);

// 客户订单排程
export const customerOrderSchedules = pgTable(
  "customer_order_schedules",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    item_id: varchar("item_id", { length: 36 }).notNull().references(() => customerOrderItems.id, { onDelete: "cascade" }),
    schedule_date: timestamp("schedule_date", { withTimezone: true }).notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("customer_order_schedules_item_id_idx").on(table.item_id),
    index("customer_order_schedules_date_idx").on(table.schedule_date),
  ]
);

// 送货单
export const deliveryNotes = pgTable(
  "delivery_notes",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    note_no: varchar("note_no", { length: 50 }).notNull().unique(),
    customer_name: varchar("customer_name", { length: 200 }).notNull(),
    customer_address: varchar("customer_address", { length: 500 }),
    customer_contact: varchar("customer_contact", { length: 100 }),
    customer_phone: varchar("customer_phone", { length: 30 }),
    delivery_date: timestamp("delivery_date", { withTimezone: true }),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("delivery_notes_note_no_idx").on(table.note_no),
    index("delivery_notes_customer_name_idx").on(table.customer_name),
    index("delivery_notes_status_idx").on(table.status),
  ]
);

// 送货单明细
export const deliveryNoteItems = pgTable(
  "delivery_note_items",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    note_id: varchar("note_id", { length: 36 }).notNull().references(() => deliveryNotes.id, { onDelete: "cascade" }),
    product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    unit_price: numeric("unit_price", { precision: 12, scale: 2 }),
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("delivery_note_items_note_id_idx").on(table.note_id),
    index("delivery_note_items_product_id_idx").on(table.product_id),
  ]
);
