'use client';

import { translateUnit } from '@/lib/utils';
import {
  type DeliveryNote,
  type DeliveryItem,
  type CategoryGroup,
  type CompanyInfo,
  type Product,
  resolveProduct,
  parseCategories,
  findCategoryGroup,
  formatDate,
} from './types';

/* ─── 打印页抬头 (首页/续页复用) ─── */
function PrintHeader({
  companyInfo,
  printData,
  categoryGroups,
  compact = false,
}: {
  companyInfo: CompanyInfo;
  printData: DeliveryNote;
  categoryGroups: CategoryGroup[];
  compact?: boolean;
}) {
  const categoryDisplay = printData.delivery_category && parseCategories(printData.delivery_category).length > 0
    ? categoryGroups
        .filter(g => parseCategories(printData.delivery_category!).some((c: string) => parseCategories(g.categories).includes(c)))
        .map(g => `${g.group_no}.${g.group_name}`)
        .join('、')
    : '';

  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: '1px' }}>
        <div style={{ fontSize: '25px', fontWeight: 'bold', letterSpacing: '4px' }}>
          {companyInfo.name || '常州横林新顺电器配件厂'}
        </div>
        <div style={{ fontSize: '12px', color: '#555', marginTop: '0' }}>
          {companyInfo.address && <span style={{ marginRight: '24px' }}>地址：{companyInfo.address}</span>}
          {companyInfo.phone && <span style={{ marginRight: '24px' }}>电话：{companyInfo.phone}</span>}
          {companyInfo.fax && <span>传真：{companyInfo.fax}</span>}
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: '22px', fontWeight: 'bold', margin: '1px 0 2px', letterSpacing: compact ? '8px' : undefined }}>
        送 货 单
      </div>

      {compact ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '20px' }}>
          <div>
            <span style={{ marginRight: '16px' }}>客户：{printData.customer_name || ''}</span>
            <span>交货地点：{printData.customer_address || ''}</span>
          </div>
          <div>
            <span style={{ marginRight: '16px' }}>送货单号：{printData.note_no || ''}</span>
            <span>日期：{printData.delivery_date || ''}</span>
            {categoryDisplay && <span style={{ marginLeft: '16px' }}>类目：{categoryDisplay}</span>}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '20px' }}>
          <div>
            <div>客　户：{printData.customer_name || ''}</div>
            <div>交货地点：{printData.customer_address || ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>送货单号：{printData.note_no || ''}</div>
            <div>单据日期：{printData.delivery_date ? formatDate(printData.delivery_date) : ''}</div>
            {categoryDisplay && <div>类目：{categoryDisplay}</div>}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── 打印表格行 (物料行 + 联单列) ─── */
const TD_BASE: React.CSSProperties = {
  border: '1px solid #000',
  padding: '2px 4px',
  textAlign: 'center',
  fontSize: '19px',
};

const TD_MONO: React.CSSProperties = {
  ...TD_BASE,
  fontFamily: 'SF Mono, Menlo, Consolas, monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function ItemRow({ item, seq, getOrderNo }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any;
  seq: number;
  getOrderNo: (item: unknown) => string;
}) {
  const prod: Partial<Product> = resolveProduct(item.products) || item.product || {};
  return (
    <tr>
      <td style={TD_BASE}>{seq}</td>
      <td style={TD_MONO}>{getOrderNo(item)}</td>
      <td style={TD_MONO}>{prod.code || ''}</td>
      <td style={{ ...TD_BASE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {prod.name || ''}{prod.spec ? `/${prod.spec}` : ''}
      </td>
      <td style={TD_BASE}>{translateUnit(prod.unit || '')}</td>
      <td style={TD_MONO}>{item.quantity}</td>
      <td style={{ ...TD_BASE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.remark || ''}
      </td>
    </tr>
  );
}

function EmptyRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} style={{ ...TD_BASE, height: '22px' }}>&nbsp;</td>
      ))}
    </tr>
  );
}

/* ─── 打印页尾 (签署区) ─── */
function PrintFooter({ companyInfo, remark }: { companyInfo: CompanyInfo; remark?: string | null }) {
  return (
    <>
      <div style={{ marginTop: '2px', fontSize: '20px' }}>
        <div>备注：{remark || ''}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '20px' }}>
        <div>收货单位及经手人：________________</div>
        <div>送货单位及经手人：{companyInfo.short_name || '新　顺'}________________</div>
      </div>
    </>
  );
}

/* ─── 获取订单编号 ─── */
function getItemOrderNo(printData: DeliveryNote): (item: unknown) => string {
  const deliveryOrderNo = (printData as DeliveryNote & { customer_orders?: { order_no?: string } | null })?.customer_orders?.order_no || '';
  return (item: unknown) => {
    const rec = item as Record<string, unknown>;
    // 优先从 customer_order_items 关联获取
    const coi = rec.customer_order_items;
    if (coi && typeof coi === 'object' && !Array.isArray(coi)) {
      const co = (coi as Record<string, unknown>).customer_orders;
      if (co && typeof co === 'object' && !Array.isArray(co)) {
        return (co as Record<string, unknown>).order_no as string || '';
      }
    }
    // 其次从 item 自身的 customer_order 字段（前端临时数据）
    if (rec.customer_order) return rec.customer_order as string;
    return deliveryOrderNo;
  };
}

/* ─── 打印主体 ─── */
export default function DeliveryPrintArea({
  printData,
  companyInfo,
  categoryGroups,
}: {
  printData: DeliveryNote;
  companyInfo: CompanyInfo;
  categoryGroups: CategoryGroup[];
}) {
  const allItems = printData.delivery_note_items || [];
  const MAX_ROWS = 10;
  const pages: typeof allItems[] = [];
  for (let i = 0; i < allItems.length; i += MAX_ROWS) {
    pages.push(allItems.slice(i, i + MAX_ROWS));
  }
  if (pages.length === 0) pages.push([]);

  const getOrderNo = getItemOrderNo(printData);

  return (
    <div id="delivery-print-area" className="bg-white shrink-0 my-4" style={{
      fontFamily: 'PingFang SC, Microsoft YaHei, SimSun, sans-serif',
      width: '241mm',
      minHeight: '139.5mm',
      padding: '3mm 5mm',
      boxSizing: 'border-box',
      fontSize: '19px',
      lineHeight: '22px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    }}>
      {pages.map((pageItems, pageIdx) => {
        const isLastPage = pageIdx === pages.length - 1;
        return (
          <div key={pageIdx} style={{
            pageBreakAfter: isLastPage ? 'avoid' : 'always',
            pageBreakInside: 'avoid',
          }}>
            {pageIdx > 0 ? (
              <PrintHeader companyInfo={companyInfo} printData={printData} categoryGroups={categoryGroups} compact />
            ) : (
              <PrintHeader companyInfo={companyInfo} printData={printData} categoryGroups={categoryGroups} />
            )}

            <div style={{ position: 'relative' }}>
              <table style={{ width: '100%', tableLayout: 'auto', borderCollapse: 'collapse', border: '1px solid #000' }}>
                <tbody>
                  <tr style={{ background: '#f0f0f0' }}>
                    <th style={TD_BASE}>项次</th>
                    <th style={TD_BASE}>订单编号</th>
                    <th style={TD_BASE}>物料编号</th>
                    <th style={TD_BASE}>物料名称</th>
                    <th style={TD_BASE}>单位</th>
                    <th style={TD_BASE}>数量</th>
                    <th style={TD_BASE}>备注</th>
                    <th rowSpan={MAX_ROWS + 1} style={{
                      border: '1px solid #000',
                      padding: '4px 1px',
                      fontSize: '10px',
                      writingMode: 'vertical-rl',
                      letterSpacing: '1px',
                      lineHeight: '1.4',
                      textAlign: 'center',
                    }}>
                      <span style={{ color: '#333' }}>(一)存根白</span>
                      <span style={{ color: '#cc0000' }}>(二)客户红</span>
                      <span style={{ color: '#cc8800' }}>(三)回单黄</span>
                    </th>
                  </tr>
                  {pageItems.map((item: DeliveryItem, idx: number) => (
                    <ItemRow key={`item-${pageIdx}-${idx}`} item={item} seq={pageIdx * MAX_ROWS + idx + 1} getOrderNo={getOrderNo} />
                  ))}
                  {Array.from({ length: Math.max(0, MAX_ROWS - pageItems.length) }).map((_, i) => (
                    <EmptyRow key={`empty-${pageIdx}-${i}`} />
                  ))}
                </tbody>
              </table>
            </div>

            {isLastPage ? (
              <PrintFooter companyInfo={companyInfo} remark={printData.remark} />
            ) : (
              <div style={{ fontSize: '12px', color: '#999', textAlign: 'center', marginTop: '4px' }}>
                第 {pageIdx + 1} 页 / 共 {pages.length} 页（续下页）
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
