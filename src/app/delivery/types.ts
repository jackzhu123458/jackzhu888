/* ─── Shared Types ─── */

export interface Product {
  id: string;
  code: string;
  name: string;
  spec: string | null;
  unit: string;
  category: string | null;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
}

export interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  delivered_qty: number;
  price: number | null;
  remark: string | null;
  products?: Product | Product[];
}

export interface CustomerOrder {
  id: string;
  order_no: string;
  customer_id: string;
  status: string;
  customer_order_items?: OrderItem[];
  customers?: Customer;
}

export interface DeliveryItem {
  id?: string;
  product_id: string;
  product?: Product;
  products?: Product | Product[];
  quantity: number;
  unit_price: number;
  per_box_qty: number;
  remark: string;
  customer_order_item_id?: string | null;
  customer_order?: string;
}

export interface DeliveryNote {
  id: string;
  note_no: string;
  customer_id?: string | null;
  customer_name: string;
  customer_address?: string | null;
  customer_contact?: string | null;
  customer_phone?: string | null;
  customer_order?: string | null;
  customer_order_id?: string | null;
  warehouse_id?: string | null;
  delivery_category?: string | null;
  delivery_date: string;
  status: string;
  remark: string | null;
  created_at: string;
  delivery_note_items: DeliveryItem[];
}

export interface CategoryGroup {
  id?: number;
  group_no: number;
  group_name: string;
  categories: string; // 逗号分隔
}

export interface CompanyInfo {
  name?: string;
  short_name?: string;
  code?: string;
  address?: string;
  contact?: string;
  phone?: string;
  fax?: string;
  email?: string;
  tax_no?: string;
  bank_name?: string;
  bank_account?: string;
  invoice_title?: string;
}

/* ─── Utility Functions ─── */

/** Supabase JOIN 返回 products 为对象或数组，统一提取为单对象 */
export function resolveProduct(raw: Product | Product[] | undefined): Product | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

/** 解析逗号分隔的类目字符串为数组 */
export function parseCategories(cat: string | null | undefined): string[] {
  return (cat || '').split(',').filter(Boolean);
}

/** 判断某个类目编码是否属于指定分组 */
export function isCategoryInGroup(category: string, group: CategoryGroup): boolean {
  return parseCategories(group.categories).includes(category);
}

/** 查找类目所属的分组 */
export function findCategoryGroup(category: string, groups: CategoryGroup[]): CategoryGroup | undefined {
  return groups.find(g => isCategoryInGroup(category, g));
}

/** 从同类目产品名称中提取公共中文描述（与 BOM 页面 extractCommonLabel 同逻辑） */
function extractCategoryLabel(products: Product[]): string {
  const names = products.map(p => p.name).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) {
    // 单个产品：取名称开头的中文部分
    const match = names[0].match(/^[\u4e00-\u9fff]+/);
    return match ? match[0] : names[0].split('/')[0];
  }

  // 统计每个中文关键词（2字及以上）出现的频率
  const freq = new Map<string, number>();
  for (const name of names) {
    const matches = name.match(/[\u4e00-\u9fff]{2,}/g);
    if (matches) {
      for (const m of matches) {
        if (m.length >= 2) {
          freq.set(m, (freq.get(m) || 0) + 1);
        }
      }
    }
  }

  if (freq.size === 0) {
    // 没有中文关键词，取第一个产品名开头的中文
    const match = names[0].match(/^[\u4e00-\u9fff]+/);
    return match ? match[0] : names[0].split('/')[0];
  }

  // 按频率降序、长度降序排序
  const sorted = Array.from(freq.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0].length - a[0].length;
  });

  const topFreq = sorted[0][1];
  const candidates = sorted.filter(([, f]) => f === topFreq || f >= topFreq * 0.5);

  // 优先选择出现在名称开头的词
  for (const name of names) {
    const prefix = name.match(/^[\u4e00-\u9fff]{2,}/);
    if (prefix) {
      const matched = candidates.find(([word]) =>
        prefix[0].includes(word) || word.includes(prefix[0])
      );
      if (matched) return matched[0];
    }
  }

  return sorted[0][0];
}

/** 获取类目显示标签，如 "027-电容罩"（从同类目产品中提取公共中文名） */
export function getCategoryLabel(cat: string, products: Product[]): string {
  const catProducts = products.filter(p => p.category === cat);
  const label = extractCategoryLabel(catProducts);
  return cat && cat !== '0' ? `${cat}-${label}` : (label || `类目${cat}`);
}

/** 格式化日期为 YYYY-MM-DD */
export function formatDate(d: string): string {
  try {
    return new Date(d).toISOString().split('T')[0];
  } catch {
    return d;
  }
}

/** 获取状态标签 */
export function statusLabel(s: string): { label: string; cls: string } {
  const m: Record<string, { label: string; cls: string }> = {
    draft: { label: '草稿', cls: 'bg-yellow-100 text-yellow-800' },
    confirmed: { label: '已确认', cls: 'bg-blue-100 text-blue-800' },
    shipped: { label: '已出货', cls: 'bg-blue-100 text-blue-800' },
    printed: { label: '已打印', cls: 'bg-green-100 text-green-800' },
  };
  return m[s] || { label: s, cls: 'bg-gray-100 text-gray-800' };
}

/** 创建空白送货单 */
export function emptyNote(): Omit<DeliveryNote, 'id' | 'created_at'> {
  return {
    note_no: '',
    customer_id: null,
    customer_name: '',
    customer_address: '',
    customer_contact: '',
    customer_phone: '',
    customer_order: '',
    customer_order_id: null,
    warehouse_id: null,
    delivery_category: '',
    delivery_date: new Date().toISOString().split('T')[0],
    status: 'draft',
    remark: '',
    delivery_note_items: [],
  };
}

/** 按类目筛选订单项 */
export function filterItemsByCategory<T extends { products?: Product | Product[] }>(
  items: T[],
  selectedCategories: string[],
): T[] {
  if (selectedCategories.length === 0) return items;
  return items.filter(item => {
    const prod = resolveProduct(item.products);
    return prod?.category && selectedCategories.includes(prod.category);
  });
}

/** 自动均分数量到 N 箱 */
export function autoDistribute(total: number, boxCount: number): number[] {
  if (boxCount <= 0 || total <= 0) return [total];
  const base = Math.floor(total / boxCount);
  const remainder = total % boxCount;
  return Array.from({ length: boxCount }, (_, i) => i < remainder ? base + 1 : base);
}
