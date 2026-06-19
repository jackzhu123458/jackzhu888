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
    cost_price: numeric("cost_price", { precision: 12, scale: 2 }).default("0"),
    location_no: varchar("location_no", { length: 50 }).default(""),
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
    type: varchar("type", { length: 30 }).notNull().default("product"), // raw_material=原材料仓库, product=产品仓库, virtual=虚拟仓库
    remark: text("remark"),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("warehouses_name_idx").on(table.name),
  ]
);

// 库存（quantity=可用量，reserved_qty=预扣量，实际可用=quantity-reserved_qty）
export const inventory = pgTable(
  "inventory",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
    warehouse_id: varchar("warehouse_id", { length: 36 }).notNull().references(() => warehouses.id),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("0"),
    reserved_qty: numeric("reserved_qty", { precision: 12, scale: 2 }).notNull().default("0"),
    location_no: varchar("location_no", { length: 50 }).default(""),
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
    location_no: varchar("location_no", { length: 50 }).default(""),
    remark: text("remark"),
    warehouse_id: varchar("warehouse_id", { length: 36 }).references(() => warehouses.id),
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
    customer_order_id: varchar("customer_order_id", { length: 36 }).references(() => customerOrders.id),
    customer_order_item_id: varchar("customer_order_item_id", { length: 36 }).references(() => customerOrderItems.id),
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
    delivery_deadline: varchar("delivery_deadline", { length: 100 }),
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
    reserved_qty: numeric("reserved_qty", { precision: 12, scale: 2 }).notNull().default("0"),
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
    customer_id: varchar("customer_id", { length: 36 }).references(() => customers.id),
    customer_order_id: varchar("customer_order_id", { length: 36 }).references(() => customerOrders.id),
    customer_name: varchar("customer_name", { length: 200 }).notNull(),
    customer_address: varchar("customer_address", { length: 500 }),
    customer_contact: varchar("customer_contact", { length: 100 }),
    customer_phone: varchar("customer_phone", { length: 30 }),
    warehouse_id: varchar("warehouse_id", { length: 36 }).references(() => warehouses.id),
    delivery_date: timestamp("delivery_date", { withTimezone: true }),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    delivery_category: varchar("delivery_category", { length: 255 }),
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("delivery_notes_note_no_idx").on(table.note_no),
    index("delivery_notes_customer_name_idx").on(table.customer_name),
    index("delivery_notes_status_idx").on(table.status),
    index("delivery_notes_customer_id_idx").on(table.customer_id),
  ]
);

// 送货单明细
export const deliveryNoteItems = pgTable(
  "delivery_note_items",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    note_id: varchar("note_id", { length: 36 }).notNull().references(() => deliveryNotes.id, { onDelete: "cascade" }),
    product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
    customer_order_item_id: varchar("customer_order_item_id", { length: 36 }).references(() => customerOrderItems.id),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    per_box_qty: numeric("per_box_qty", { precision: 12, scale: 2 }).default("0"),
    unit_price: numeric("unit_price", { precision: 12, scale: 2 }),
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("delivery_note_items_note_id_idx").on(table.note_id),
    index("delivery_note_items_product_id_idx").on(table.product_id),
  ]
);

// 入库单
export const inboundNotes = pgTable(
  "inbound_notes",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    note_no: varchar("note_no", { length: 50 }).notNull().unique(),
    type: varchar("type", { length: 30 }).notNull().default("production"), // production=生产入库, purchase=采购入库
    production_order_id: varchar("production_order_id", { length: 36 }).references(() => productionOrders.id),
    warehouse_id: varchar("warehouse_id", { length: 36 }).notNull().references(() => warehouses.id),
    operator: varchar("operator", { length: 50 }),
    supplier: varchar("supplier", { length: 100 }),         // 供应商
    planned_date: timestamp("planned_date", { withTimezone: true }),  // 计划到货日
    actual_date: timestamp("actual_date", { withTimezone: true }),    // 实际到货日
    status: varchar("status", { length: 30 }).notNull().default("draft"), // draft, pending, confirmed, abnormal
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("inbound_notes_production_order_id_idx").on(table.production_order_id),
    index("inbound_notes_warehouse_id_idx").on(table.warehouse_id),
  ]
);

// 入库单明细
export const inboundNoteItems = pgTable(
  "inbound_note_items",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    note_id: varchar("note_id", { length: 36 }).notNull().references(() => inboundNotes.id, { onDelete: "cascade" }),
    product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    unit_price: numeric("unit_price", { precision: 12, scale: 2 }),    // 单价
    amount: numeric("amount", { precision: 12, scale: 2 }),            // 金额
    category: varchar("category", { length: 50 }),                     // 分类
    location_no: varchar("location_no", { length: 50 }),               // 库位
    diff_qty: numeric("diff_qty", { precision: 12, scale: 2 }),       // 差异数量
    item_status: varchar("item_status", { length: 30 }),               // 明细状态: normal/abnormal
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("inbound_note_items_note_id_idx").on(table.note_id),
    index("inbound_note_items_product_id_idx").on(table.product_id),
  ]
);

// 产品图纸
export const productDrawings = pgTable(
  "product_drawings",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    product_id: varchar("product_id", { length: 36 }).notNull(),
    file_key: text("file_key").notNull(),
    file_name: text("file_name").notNull(),
    file_type: varchar("file_type", { length: 50 }),
    file_size: numeric("file_size", { precision: 12 }).default("0"),
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("product_drawings_product_id_idx").on(table.product_id),
  ]
);

// ========== RBAC 权限系统表 ==========

// 用户表
export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    username: varchar("username", { length: 50 }).notNull().unique(),
    password_hash: varchar("password_hash", { length: 200 }).notNull(),
    display_name: varchar("display_name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    email: varchar("email", { length: 200 }),
    is_active: boolean("is_active").default(true).notNull(),
    last_login_at: timestamp("last_login_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("users_username_idx").on(table.username),
  ]
);

// 角色表
export const roles = pgTable(
  "roles",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    is_system: boolean("is_system").default(false).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("roles_code_idx").on(table.code),
  ]
);

// 权限表
export const permissions = pgTable(
  "permissions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 100 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    module: varchar("module", { length: 50 }).notNull(),
    type: varchar("type", { length: 20 }).notNull().default("menu"), // menu=菜单, button=按钮
    description: text("description"),
    sort_order: integer("sort_order").default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("permissions_code_idx").on(table.code),
    index("permissions_module_idx").on(table.module),
  ]
);

// 送货单类目分组配置
export const deliveryCategoryGroups = pgTable(
  "delivery_category_groups",
  {
    id: serial("id").primaryKey(),
    groupNo: integer("group_no").notNull(),
    groupName: text("group_name").notNull(),
    categories: text("categories").notNull(), // 逗号分隔的产品类目编号，如 "002,003"
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  }
);

// ========== 质量管理 ==========

// 质量警示
export const qualityAlerts = pgTable(
  "quality_alerts",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
    alert_type: varchar("alert_type", { length: 50 }).notNull().default("defect"), // defect=缺陷, nonconformity=不合格, complaint=客户投诉, recall=召回
    severity: varchar("severity", { length: 20 }).notNull().default("medium"), // low=低, medium=中, high=高, critical=严重
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 20 }).notNull().default("active"), // active=活跃, resolved=已解决, closed=已关闭
    resolved_at: timestamp("resolved_at", { withTimezone: true }),
    resolved_by: varchar("resolved_by", { length: 100 }),
    resolution: text("resolution"),
    created_by: varchar("created_by", { length: 100 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("quality_alerts_product_id_idx").on(table.product_id),
    index("quality_alerts_status_idx").on(table.status),
    index("quality_alerts_severity_idx").on(table.severity),
  ]
);

// 出厂检验报告
export const inspectionReports = pgTable(
  "inspection_reports",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    report_no: varchar("report_no", { length: 50 }).notNull().unique(),
    delivery_note_id: varchar("delivery_note_id", { length: 36 }).references(() => deliveryNotes.id),
    product_id: varchar("product_id", { length: 36 }).notNull().references(() => products.id),
    inspection_date: timestamp("inspection_date", { withTimezone: true }).defaultNow().notNull(),
    result: varchar("result", { length: 20 }).notNull().default("passed"), // passed=合格, failed=不合格, conditional=有条件接收
    inspector: varchar("inspector", { length: 100 }),
    approved_by: varchar("approved_by", { length: 100 }),
    batch_no: varchar("batch_no", { length: 100 }),
    quantity: numeric("quantity", { precision: 12, scale: 2 }),
    sample_quantity: numeric("sample_quantity", { precision: 12, scale: 2 }),
    items: text("items"), // JSON: 检验项目明细 [{name, standard, result, passed}]
    conclusion: text("conclusion"),
    remark: text("remark"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("inspection_reports_delivery_note_id_idx").on(table.delivery_note_id),
    index("inspection_reports_product_id_idx").on(table.product_id),
    index("inspection_reports_report_no_idx").on(table.report_no),
  ]
);

// 用户-角色关联表
export const userRoles = pgTable(
  "user_roles",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    role_id: varchar("role_id", { length: 36 }).notNull().references(() => roles.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_roles_user_id_idx").on(table.user_id),
    index("user_roles_role_id_idx").on(table.role_id),
  ]
);

// 角色-权限关联表
export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    role_id: varchar("role_id", { length: 36 }).notNull().references(() => roles.id, { onDelete: "cascade" }),
    permission_id: varchar("permission_id", { length: 36 }).notNull().references(() => permissions.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("role_permissions_role_id_idx").on(table.role_id),
    index("role_permissions_permission_id_idx").on(table.permission_id),
  ]
);
