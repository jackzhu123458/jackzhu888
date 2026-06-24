-- ============================================
-- 增量迁移脚本 - 添加缺失的表
-- 在已有的数据库上执行此脚本来补充新建的表
-- ============================================

-- 工艺流程
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
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS process_flows_product_id_idx ON process_flows(product_id);

-- 工序模板
CREATE TABLE IF NOT EXISTS process_step_templates (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  step_name varchar(100) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 质量警示
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

-- 出厂检验报告
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

-- 工序模板预设数据
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

-- production_orders 增加 current_step 字段
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS current_step integer DEFAULT 0;
