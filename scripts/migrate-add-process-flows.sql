-- ============================================
-- 增量迁移脚本 - 添加缺失的表
-- 在已有的数据库上执行此脚本来补充新建的表
-- 每条语句独立执行，单条失败不影响后续
-- ============================================

-- 0. 确保 uuid 扩展可用
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. 工艺流程表（不添加外键约束，避免依赖问题）
CREATE TABLE IF NOT EXISTS process_flows (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id varchar(36) NOT NULL,
  step_order integer NOT NULL DEFAULT 0,
  step_name varchar(100) NOT NULL,
  description text,
  estimated_minutes integer,
  is_key_step boolean DEFAULT false,
  branch varchar(20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS process_flows_product_id_idx ON process_flows(product_id);

-- 2. 工序模板表
CREATE TABLE IF NOT EXISTS process_step_templates (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  step_name varchar(100) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. 质量警示表（不添加外键约束）
CREATE TABLE IF NOT EXISTS quality_alerts (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id varchar(36),
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

-- 4. 出厂检验报告表（不添加外键约束）
CREATE TABLE IF NOT EXISTS inspection_reports (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  report_no varchar(50) NOT NULL UNIQUE,
  delivery_note_id varchar(36),
  product_id varchar(36),
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
CREATE INDEX IF NOT EXISTS inspection_reports_report_no_idx ON inspection_reports(report_no);

-- 5. production_orders 增加 current_step 字段
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_orders' AND column_name = 'current_step') THEN
    ALTER TABLE production_orders ADD COLUMN current_step integer DEFAULT 0;
  END IF;
END $$;

-- 6. 工序模板预设数据
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

-- 7. ⚠️ 关键：给 anon 角色授权新表的访问权限
-- PostgREST 使用 anon 角色访问数据库，没有权限会返回 403
DO $$
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON process_flows TO anon;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'GRANT process_flows failed: %', SQLERRM;
END $$;

DO $$
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON process_step_templates TO anon;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'GRANT process_step_templates failed: %', SQLERRM;
END $$;

DO $$
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON quality_alerts TO anon;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'GRANT quality_alerts failed: %', SQLERRM;
END $$;

DO $$
BEGIN
  GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_reports TO anon;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'GRANT inspection_reports failed: %', SQLERRM;
END $$;

-- 8. 授权限给所有现有序列
DO $$
BEGIN
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'GRANT sequences failed: %', SQLERRM;
END $$;

-- ⚠️ 注意：执行完后必须重启 postgrest 容器！
-- docker compose restart postgrest
