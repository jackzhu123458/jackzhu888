-- ============================================
-- 新顺电器仓库进销存管理系统 - 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========== 1. 产品/物料主表 ==========
CREATE TABLE IF NOT EXISTS products (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(50) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  spec varchar(200),
  unit varchar(20) NOT NULL DEFAULT '个',
  category varchar(100),
  type varchar(30) NOT NULL DEFAULT 'raw_material',
  price numeric(12,2),
  cost_price numeric(12,2) DEFAULT 0,
  location_no varchar(50) DEFAULT '',
  remark text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS products_code_idx ON products(code);
CREATE INDEX IF NOT EXISTS products_type_idx ON products(type);
CREATE INDEX IF NOT EXISTS products_category_idx ON products(category);

-- ========== 2. 仓库 ==========
CREATE TABLE IF NOT EXISTS warehouses (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  location varchar(200),
  type varchar(30) NOT NULL DEFAULT 'product',
  remark text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS warehouses_name_idx ON warehouses(name);

-- ========== 3. 库存 ==========
CREATE TABLE IF NOT EXISTS inventory (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id varchar(36) NOT NULL REFERENCES products(id),
  warehouse_id varchar(36) NOT NULL REFERENCES warehouses(id),
  quantity numeric(12,2) NOT NULL DEFAULT 0,
  reserved_qty numeric(12,2) NOT NULL DEFAULT 0,
  location_no varchar(50) DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS inventory_product_id_idx ON inventory(product_id);
CREATE INDEX IF NOT EXISTS inventory_warehouse_id_idx ON inventory(warehouse_id);

-- ========== 4. BOM 物料清单 ==========
CREATE TABLE IF NOT EXISTS bom (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_product_id varchar(36) NOT NULL REFERENCES products(id),
  child_product_id varchar(36) NOT NULL REFERENCES products(id),
  quantity numeric(12,4) NOT NULL,
  location_no varchar(50) DEFAULT '',
  remark text,
  warehouse_id varchar(36) REFERENCES warehouses(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS bom_parent_product_id_idx ON bom(parent_product_id);
CREATE INDEX IF NOT EXISTS bom_child_product_id_idx ON bom(child_product_id);

-- ========== 5. 客户 ==========
CREATE TABLE IF NOT EXISTS customers (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  code varchar(50),
  contact varchar(100),
  phone varchar(30),
  address varchar(500),
  remark text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS customers_name_idx ON customers(name);
CREATE INDEX IF NOT EXISTS customers_code_idx ON customers(code);

-- ========== 6. 客户订单 ==========
CREATE TABLE IF NOT EXISTS customer_orders (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no varchar(50) NOT NULL UNIQUE,
  customer_id varchar(36) NOT NULL REFERENCES customers(id),
  order_date timestamptz NOT NULL DEFAULT now(),
  deadline varchar(100),
  delivery_deadline varchar(100),
  status varchar(30) NOT NULL DEFAULT 'pending',
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS customer_orders_order_no_idx ON customer_orders(order_no);
CREATE INDEX IF NOT EXISTS customer_orders_customer_id_idx ON customer_orders(customer_id);
CREATE INDEX IF NOT EXISTS customer_orders_status_idx ON customer_orders(status);

-- ========== 7. 客户订单明细 ==========
CREATE TABLE IF NOT EXISTS customer_order_items (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id varchar(36) NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  product_id varchar(36) NOT NULL REFERENCES products(id),
  quantity numeric(12,2) NOT NULL,
  delivered_qty numeric(12,2) NOT NULL DEFAULT 0,
  reserved_qty numeric(12,2) NOT NULL DEFAULT 0,
  price numeric(12,2) DEFAULT 0,
  deadline varchar(100),
  remark text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_order_items_order_id_idx ON customer_order_items(order_id);
CREATE INDEX IF NOT EXISTS customer_order_items_product_id_idx ON customer_order_items(product_id);

-- ========== 8. 客户订单排程 ==========
CREATE TABLE IF NOT EXISTS customer_order_schedules (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id varchar(36) NOT NULL REFERENCES customer_order_items(id) ON DELETE CASCADE,
  schedule_date timestamptz NOT NULL,
  quantity numeric(12,2) NOT NULL,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_order_schedules_item_id_idx ON customer_order_schedules(item_id);
CREATE INDEX IF NOT EXISTS customer_order_schedules_date_idx ON customer_order_schedules(schedule_date);

-- ========== 9. 生产订单 ==========
CREATE TABLE IF NOT EXISTS production_orders (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no varchar(50) NOT NULL UNIQUE,
  customer_id varchar(36) REFERENCES customers(id),
  customer_order_id varchar(36) REFERENCES customer_orders(id),
  customer_order_item_id varchar(36) REFERENCES customer_order_items(id),
  product_id varchar(36) NOT NULL REFERENCES products(id),
  quantity numeric(12,2) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'pending',
  start_date timestamptz,
  due_date timestamptz,
  completed_at timestamptz,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS production_orders_order_no_idx ON production_orders(order_no);
CREATE INDEX IF NOT EXISTS production_orders_customer_id_idx ON production_orders(customer_id);
CREATE INDEX IF NOT EXISTS production_orders_product_id_idx ON production_orders(product_id);
CREATE INDEX IF NOT EXISTS production_orders_status_idx ON production_orders(status);

-- ========== 10. 生产订单用料明细 ==========
CREATE TABLE IF NOT EXISTS production_order_materials (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id varchar(36) NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  product_id varchar(36) NOT NULL REFERENCES products(id),
  required_qty numeric(12,2) NOT NULL,
  prepared_qty numeric(12,2) NOT NULL DEFAULT 0,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS production_order_materials_order_id_idx ON production_order_materials(order_id);
CREATE INDEX IF NOT EXISTS production_order_materials_product_id_idx ON production_order_materials(product_id);

-- ========== 11. 入库单 ==========
CREATE TABLE IF NOT EXISTS inbound_notes (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  note_no varchar(50) NOT NULL UNIQUE,
  type varchar(30) NOT NULL DEFAULT 'production',
  production_order_id varchar(36) REFERENCES production_orders(id),
  warehouse_id varchar(36) NOT NULL REFERENCES warehouses(id),
  operator varchar(50),
  supplier varchar(100),
  planned_date timestamptz,
  actual_date timestamptz,
  status varchar(30) NOT NULL DEFAULT 'draft',
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS inbound_notes_production_order_id_idx ON inbound_notes(production_order_id);
CREATE INDEX IF NOT EXISTS inbound_notes_warehouse_id_idx ON inbound_notes(warehouse_id);

-- ========== 12. 入库单明细 ==========
CREATE TABLE IF NOT EXISTS inbound_note_items (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id varchar(36) NOT NULL REFERENCES inbound_notes(id) ON DELETE CASCADE,
  product_id varchar(36) NOT NULL REFERENCES products(id),
  quantity numeric(12,2) NOT NULL,
  unit_price numeric(12,2),
  amount numeric(12,2),
  category varchar(50),
  location_no varchar(50),
  diff_qty numeric(12,2),
  item_status varchar(30),
  remark text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inbound_note_items_note_id_idx ON inbound_note_items(note_id);
CREATE INDEX IF NOT EXISTS inbound_note_items_product_id_idx ON inbound_note_items(product_id);

-- ========== 13. 送货单 ==========
CREATE TABLE IF NOT EXISTS delivery_notes (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  note_no varchar(50) NOT NULL UNIQUE,
  customer_id varchar(36) REFERENCES customers(id),
  customer_order_id varchar(36) REFERENCES customer_orders(id),
  customer_name varchar(200) NOT NULL,
  customer_address varchar(500),
  customer_contact varchar(100),
  customer_phone varchar(30),
  warehouse_id varchar(36) REFERENCES warehouses(id),
  delivery_date timestamptz,
  status varchar(30) NOT NULL DEFAULT 'draft',
  delivery_category varchar(255),
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS delivery_notes_note_no_idx ON delivery_notes(note_no);
CREATE INDEX IF NOT EXISTS delivery_notes_customer_name_idx ON delivery_notes(customer_name);
CREATE INDEX IF NOT EXISTS delivery_notes_status_idx ON delivery_notes(status);
CREATE INDEX IF NOT EXISTS delivery_notes_customer_id_idx ON delivery_notes(customer_id);

-- ========== 14. 送货单明细 ==========
CREATE TABLE IF NOT EXISTS delivery_note_items (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id varchar(36) NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  product_id varchar(36) NOT NULL REFERENCES products(id),
  customer_order_item_id varchar(36) REFERENCES customer_order_items(id),
  quantity numeric(12,2) NOT NULL,
  per_box_qty numeric(12,2) DEFAULT 0,
  unit_price numeric(12,2),
  warehouse_id varchar(36),
  remark text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_note_items_note_id_idx ON delivery_note_items(note_id);
CREATE INDEX IF NOT EXISTS delivery_note_items_product_id_idx ON delivery_note_items(product_id);

-- ========== 15. 产品图纸 ==========
CREATE TABLE IF NOT EXISTS product_drawings (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id varchar(36) NOT NULL,
  file_key text NOT NULL,
  file_name text NOT NULL,
  file_type varchar(50),
  file_size numeric(12) DEFAULT 0,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS product_drawings_product_id_idx ON product_drawings(product_id);

-- ========== 16. 送货单类目分组配置 ==========
CREATE TABLE IF NOT EXISTS delivery_category_groups (
  id serial PRIMARY KEY,
  group_no integer NOT NULL,
  group_name text NOT NULL,
  categories text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ========== 17. 健康检查表 ==========
CREATE TABLE IF NOT EXISTS health_check (
  id serial PRIMARY KEY,
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- ========== RBAC 权限系统 ==========
-- ============================================

-- ========== 18. 用户表 ==========
CREATE TABLE IF NOT EXISTS users (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(50) NOT NULL UNIQUE,
  password_hash varchar(200) NOT NULL,
  display_name varchar(100) NOT NULL,
  phone varchar(30),
  email varchar(200),
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);

-- ========== 19. 角色表 ==========
CREATE TABLE IF NOT EXISTS roles (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(50) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS roles_code_idx ON roles(code);

-- ========== 20. 权限表 ==========
CREATE TABLE IF NOT EXISTS permissions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(100) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  module varchar(50) NOT NULL,
  type varchar(20) NOT NULL DEFAULT 'menu',
  description text,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permissions_code_idx ON permissions(code);
CREATE INDEX IF NOT EXISTS permissions_module_idx ON permissions(module);

-- ========== 21. 用户-角色关联表 ==========
CREATE TABLE IF NOT EXISTS user_roles (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id varchar(36) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON user_roles(role_id);

-- ========== 22. 角色-权限关联表 ==========
CREATE TABLE IF NOT EXISTS role_permissions (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id varchar(36) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id varchar(36) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS role_permissions_role_id_idx ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS role_permissions_permission_id_idx ON role_permissions(permission_id);

-- ========== 23. 工艺流程 ==========
CREATE TABLE IF NOT EXISTS process_flows (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id varchar(36) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  step_name varchar(100) NOT NULL,
  description text,
  estimated_minutes integer,
  is_key_step boolean DEFAULT false,
  branch varchar(20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (product_id, step_order, branch)
);
CREATE INDEX IF NOT EXISTS process_flows_product_id_idx ON process_flows(product_id);

-- ========== 24. 工序模板（可自定义的工序名称列表） ==========
CREATE TABLE IF NOT EXISTS process_step_templates (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  step_name varchar(100) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========== 25. 质量警示 ==========
CREATE TABLE IF NOT EXISTS quality_alerts (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id varchar(36) NOT NULL REFERENCES products(id),
  alert_type varchar(50) NOT NULL DEFAULT 'defect',
  severity varchar(20) NOT NULL DEFAULT 'medium',
  title varchar(200) NOT NULL,
  description text,
  status varchar(20) NOT NULL DEFAULT 'active',
  resolved_at timestamptz,
  resolved_by varchar(100),
  resolution text,
  created_by varchar(100),
  images text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS quality_alerts_product_id_idx ON quality_alerts(product_id);
CREATE INDEX IF NOT EXISTS quality_alerts_status_idx ON quality_alerts(status);
CREATE INDEX IF NOT EXISTS quality_alerts_severity_idx ON quality_alerts(severity);

-- ========== 26. 出厂检验报告 ==========
CREATE TABLE IF NOT EXISTS inspection_reports (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  report_no varchar(50) NOT NULL UNIQUE,
  delivery_note_id varchar(36) REFERENCES delivery_notes(id),
  product_id varchar(36) NOT NULL REFERENCES products(id),
  inspection_date timestamptz NOT NULL DEFAULT now(),
  result varchar(20) NOT NULL DEFAULT 'passed',
  inspector varchar(100),
  approved_by varchar(100),
  batch_no varchar(100),
  quantity numeric(12,2),
  sample_quantity numeric(12,2),
  items text,
  conclusion text,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS inspection_reports_delivery_note_id_idx ON inspection_reports(delivery_note_id);
CREATE INDEX IF NOT EXISTS inspection_reports_product_id_idx ON inspection_reports(product_id);
CREATE INDEX IF NOT EXISTS inspection_reports_report_no_idx ON inspection_reports(report_no);

-- ============================================
-- ========== 初始化默认数据 ==========
-- ============================================

-- 插入 admin 角色（如果不存在）
INSERT INTO roles (code, name, description, is_system)
SELECT 'admin', '系统管理员', '拥有所有权限', true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'admin');

-- 插入 admin 用户（如果不存在）
-- 密码: admin123 (bcrypt hash)
INSERT INTO users (username, password_hash, display_name, is_active)
SELECT 'admin', '$2a$10$VYwgrAhpANOiL47dQynr3O0evGxCsw3zgOPGJovVH2bTOsy.UqLjm', '系统管理员', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');

-- 关联 admin 用户与 admin 角色
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.username = 'admin' AND r.code = 'admin'
AND NOT EXISTS (
  SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = r.id
);

-- ============================================
-- 工序模板预设数据
-- ============================================
INSERT INTO process_step_templates (step_name) VALUES
('落料'), ('冲孔'), ('折弯'), ('成型'), ('焊接'), ('打磨'), ('抛光'), ('清洗'),
('喷涂'), ('烘干'), ('组装'), ('调试'), ('检验'), ('包装'), ('入库'),
('切割'), ('车削'), ('铣削'), ('钻削'), ('磨削'), ('刨削'), ('镗削'),
('拉削'), ('铰削'), ('攻丝'), ('滚齿'), ('插齿'), ('剃齿'),
('热处理'), ('表面处理'), ('电镀'), ('氧化'), ('喷涂防锈'),
('铸造'), ('锻造'), ('冲压'), ('挤压'), ('拉拔'), ('旋压'),
('注塑'), ('吹塑'), ('压铸'), ('挤出'),
('绕线'), ('浸漆'), ('烘干固化'), ('动平衡'), ('绝缘处理'),
('外观检查'), ('装箱'), ('试运行')
ON CONFLICT (step_name) DO NOTHING;

-- ============================================
-- PostgREST 匿名角色和权限（本地部署用）
-- ============================================

-- 创建 PostgREST 使用的 anon 角色（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END;
$$;

-- 创建 PostgREST 使用的 authenticator 角色（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOLOGIN;
  END IF;
END;
$$;

-- 让 authenticator 能够切换为 anon
GRANT anon TO authenticator;

-- erp 用户也需要 anon 角色（PostgREST 直接用 erp 连接时需要 SET ROLE anon）
GRANT anon TO erp;

-- 授予 anon 角色对所有表的 SELECT/INSERT/UPDATE/DELETE 权限
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 确保未来新建的表也自动授予权限
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;

-- ============================================
-- 完成提示
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '数据库初始化完成！';
  RAISE NOTICE '默认管理员账号: admin';
  RAISE NOTICE '默认密码: admin123';
  RAISE NOTICE '请登录后及时修改密码！';
END;
$$;
