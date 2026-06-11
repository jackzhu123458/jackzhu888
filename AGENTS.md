# 项目上下文 - 仓库进销存管理系统

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **数据库**: Supabase (PostgreSQL + Drizzle ORM)
- **打印**: 浏览器原生 window.print() + CSS @media print

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   │   ├── api/            # API 路由
│   │   │   ├── dashboard/  # 仪表盘统计
│   │   │   ├── products/   # 产品/物料 CRUD
│   │   │   ├── bom/        # BOM 物料清单 CRUD
│   │   │   ├── production/ # 生产订单 CRUD
│   │   │   ├── delivery/   # 送货单 CRUD
│   │   │   ├── inventory/  # 库存查询
│   │   │   └── warehouses/ # 仓库 CRUD
│   │   ├── products/       # 产品/物料管理页
│   │   ├── bom/            # BOM 管理页
│   │   ├── production/     # 生产订单页
│   │   ├── delivery/       # 送货单页
│   │   ├── labels/         # 标签打印页
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
| inventory | 库存 | id, product_id, warehouse_id, quantity |
| bom | BOM 物料清单 | id, parent_product_id, child_product_id, quantity |
| production_orders | 生产订单 | id, order_no, product_id, quantity, status, due_date |
| production_order_materials | 订单用料 | id, order_id, product_id, required_qty, prepared_qty |
| delivery_notes | 送货单 | id, note_no, customer_name, delivery_date, status |
| delivery_note_items | 送货明细 | id, note_id, product_id, quantity, unit_price |

## API 接口清单

| 路由 | 方法 | 说明 |
|------|------|------|
| /api/dashboard | GET | 仪表盘统计数据 |
| /api/products | GET/POST | 产品列表 / 创建产品 |
| /api/bom | GET/POST/PUT/DELETE | BOM 列表 / 创建 / 更新 / 删除 |
| /api/production | GET/POST/PUT | 生产订单列表 / 创建 / 更新 |
| /api/delivery | GET/POST/PUT | 送货单列表 / 创建 / 更新 |
| /api/inventory | GET | 库存查询 |
| /api/warehouses | GET/POST | 仓库列表 / 创建仓库 |

## 核心业务逻辑

- **BOM**: 定义成品与子物料的关系（父产品 → 子产品 + 用量），支持树状结构
- **生产订单**: 关联产品 + BOM 自动展开用料明细，状态流转: pending → in_progress → completed → cancelled
- **送货单**: 关联客户信息 + 产品明细，支持打印功能，状态: draft → shipped
- **标签打印**: 选择产品/物料后生成条形码标签，支持自定义标签尺寸和打印数量
- **库存**: 按仓库+产品维度记录库存量

## 打印功能实现

- 送货单打印: 使用 CSS @media print + window.print()，打印时隐藏侧边栏和操作按钮
- 标签打印: 生成条形码标签 (JsBarcode)，支持 A4/连续纸多种布局
- CSS 类 `.no-print` 用于标记打印时隐藏的元素

## 包管理规范

**仅允许使用 pnpm** 作为包管理器。

## 开发规范

- TypeScript strict 模式，禁止隐式 any
- 组件使用 'use client' 标记客户端组件
- Hydration 注意事项：禁止在 JSX 中直接使用 typeof window / Date.now() / Math.random()
- Supabase 外键约束名格式为 `_fk` 后缀而非 `_fkey`
