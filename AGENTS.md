# 项目上下文 - 仓库进销存管理系统

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **数据库**: Supabase (PostgreSQL + Drizzle ORM)
- **打印**: 浏览器原生 window.print() + CSS @media print
- **条码**: JsBarcode
- **Excel**: xlsx + iconv-lite (GBK编码修复)

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   │   ├── api/            # API 路由
│   │   │   ├── dashboard/       # 仪表盘统计
│   │   │   ├── products/        # 产品/物料 CRUD
│   │   │   ├── bom/             # BOM 物料清单 CRUD + Excel导入
│   │   │   ├── bom/import/      # BOM Excel批量导入
│   │   │   ├── production/      # 生产订单 CRUD
│   │   │   ├── production/complete/  # 生产完成 → 自动入库
│   │   │   ├── delivery/        # 送货单 CRUD + 出库
│   │   │   ├── inbound/         # 入库单 CRUD
│   │   │   ├── inventory/       # 库存查询
│   │   │   ├── warehouses/      # 仓库 CRUD
│   │   │   ├── customers/       # 客户 CRUD
│   │   │   ├── orders/          # 客户订单 CRUD
│   │   │   └── orders/push-down/ # 订单下推逻辑
│   │   ├── bom/            # BOM 管理页（树状展示）
│   │   ├── customers/      # 客户管理页
│   │   ├── orders/         # 客户订单页（排程表格）
│   │   ├── production/     # 生产订单页（按客户分组）
│   │   ├── inbound/        # 入库单页
│   │   ├── delivery/       # 送货单页（ERP单据风格+标签打印）
│   │   ├── inventory/      # 库存管理页
│   │   └── page.tsx        # 仪表盘首页
│   ├── components/
│   │   ├── ui/             # Shadcn UI 组件库
│   │   ├── sidebar.tsx     # 侧边导航栏
│   │   └── app-shell.tsx   # 应用外壳布局
│   ├── storage/database/   # 数据库层
│   │   ├── shared/schema.ts        # Drizzle 表定义
│   │   └── supabase-client.ts      # Supabase 客户端
│   ├── hooks/              # 自定义 Hooks
│   └── lib/utils.ts        # 通用工具函数
├── DESIGN.md               # 设计规范
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖
└── tsconfig.json           # TypeScript 配置
```

## 数据库表结构

| 表名 | 说明 | 主要字段 |
|------|------|----------|
| products | 产品/物料 | id, code, name, spec, unit, category, type, price |
| warehouses | 仓库 | id, name, location, remark |
| inventory | 库存 | id, product_id, warehouse_id, quantity, reserved_qty |
| bom | BOM 物料清单 | id, parent_product_id, child_product_id, quantity |
| customers | 客户 | id, name, code, contact, phone, address |
| customer_orders | 客户订单 | id, order_no, customer_id, deadline, delivery_deadline |
| customer_order_items | 订单明细 | id, order_id, product_id, quantity, delivered_qty, reserved_qty, price |
| customer_order_schedules | 订单排程 | id, item_id, schedule_date, quantity |
| production_orders | 生产订单 | id, order_no, customer_id, customer_order_id, product_id, quantity, status, due_date |
| production_order_materials | 订单用料 | id, order_id, product_id, required_qty, prepared_qty |
| inbound_notes | 入库单 | id, note_no, type, production_order_id, warehouse_id, operator, status |
| inbound_note_items | 入库明细 | id, note_id, product_id, quantity |
| delivery_notes | 送货单 | id, note_no, customer_id, customer_order_id, customer_name, warehouse_id, delivery_date, status |
| delivery_note_items | 送货明细 | id, note_id, product_id, customer_order_item_id, quantity, per_box_qty, unit_price |

## API 接口清单

| 路由 | 方法 | 说明 |
|------|------|------|
| /api/dashboard | GET | 仪表盘统计数据 |
| /api/products | GET/POST | 产品列表 / 创建产品 |
| /api/bom | GET/POST/PUT/DELETE | BOM 列表 / 创建 / 更新 / 删除 |
| /api/bom/import | POST | BOM Excel批量导入 (GBK编码修复) |
| /api/customers | GET/POST/PUT/DELETE | 客户 CRUD |
| /api/orders | GET/POST/PUT/DELETE | 客户订单 CRUD |
| /api/orders/push-down | POST | 订单下推：检查BOM/库存→生成生产订单或预扣 |
| /api/production | GET/POST/PUT | 生产订单列表 / 创建 / 更新 |
| /api/production/complete | POST | 生产完成 → 自动入库 + 预扣 + 扣原材料 |
| /api/inbound | GET/POST/DELETE | 入库单 CRUD |
| /api/delivery | GET/POST/PUT | 送货单 CRUD + 出库扣减 |
| /api/inventory | GET/PUT | 库存查询 / 更新 |
| /api/warehouses | GET/POST | 仓库列表 / 创建仓库 |

## 核心业务逻辑

### 全链路业务流程
客户订单 → 下推检查 → 需要生产→生成生产订单 / 不需要→预扣库存 → 生产完成→自动入库+预扣 → 开送货单→出库扣减库存

- **订单下推** (`/api/orders/push-down`): 遍历订单明细，有BOM的生成生产订单，无BOM的检查库存并预扣(reserved_qty)，库存不足的返回缺料提示
- **生产完成入库** (`/api/production/complete`): 更新订单状态→创建入库单→成品入库→如关联客户订单则预扣→扣减原材料库存
- **送货单出库** (`/api/delivery PUT`): 状态改为shipped时→扣减库存quantity和reserved_qty→更新客户订单已交量
- **库存预扣**: reserved_qty字段区分可用库存(quantity-reserved_qty)和已预留库存

### 各模块逻辑
- **BOM**: 定义成品与子物料的关系（父产品 → 子产品 + 用量），支持树状展示，支持Excel批量导入
- **客户订单**: 按客户分组显示，排程表格展示30天交货计划，支持下推操作
- **生产订单**: 按客户分组展示，支持完成入库操作（自动创建入库单+更新库存）
- **送货单**: ERP单据风格，集成标签打印（每箱数量不固定分配），支持关联客户订单自动填充
- **入库单**: 手动创建或生产自动生成，确认后自动更新库存
- **库存**: 按仓库+产品维度记录，显示总库存/预留量/可用量

## 关键技术实现

- **GBK编码修复**: xlsx库在Next.js ESM运行时codepage选项不生效，用iconv-lite实现`latin1→Buffer→GBK decode`链路
- **BOM组名**: 使用extractCommonPrefix提取组内公共名称（如"蜗壳"、"支架"）
- **标签打印箱数分配**: 支持不固定每箱数量，如100个5箱=4×8+1×68
- **打印**: CSS @media print + window.print()，`.no-print`类标记打印时隐藏元素
- **全局布局**: AppShell在layout.tsx中包裹，侧边栏全局可用

## 包管理规范

**仅允许使用 pnpm** 作为包管理器。

## 开发规范

- TypeScript strict 模式，禁止隐式 any
- 组件使用 'use client' 标记客户端组件
- Hydration 注意事项：禁止在 JSX 中直接使用 typeof window / Date.now() / Math.random()
- Supabase 外键约束名格式为 `_fk` 后缀而非 `_fkey`
- 库存字段统一使用 `reserved_qty`（非 reserved_quantity）
