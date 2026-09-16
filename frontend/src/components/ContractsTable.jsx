import { useState, useMemo, Fragment } from 'react';
import Pagination from './Pagination.jsx';

const STATUS_TONE = {
  'Upcoming renewal': 'amber',
  'Negotiation in progress': 'blue',
  'Renewed': 'green',
  'Expired/Not renewed': 'red',
};

const COLUMNS = [
  { key: 'contract_name', label: 'ชื่อสัญญา', width: '20%' },
  { key: 'partner', label: 'คู่สัญญา', width: '13%' },
  { key: 'country', label: 'ประเทศ', width: '9%' },
  { key: 'end_date', label: 'วันที่ครบกำหนด', width: '11%' },
  { key: 'days_until_end', label: 'คงเหลือ', width: '9%', num: true },
  { key: 'status', label: 'สถานะ', width: '13%' },
  { key: 'responsible_by', label: 'ผู้รับผิดชอบ', width: '11%' },
  { key: 'cost_amount', label: 'มูลค่าสัญญา', width: '10%', num: true },
];

function statusTone(status) {
  return STATUS_TONE[status] || 'neutral';
}

function daysTone(days) {
  if (days == null) return 'safe';
  if (days < 0) return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warn';
  if (days <= 90) return 'notice';
  return 'safe';
}

function formatDays(days) {
  if (days == null) return '-';
  if (days < 0) return `เกิน ${Math.abs(days)} วัน`;
  return `${days} วัน`;
}

function formatMoney(amount, currency) {
  if (amount == null) return '-';
  return `${Number(amount).toLocaleString()} ${currency || ''}`.trim();
}

// Values come back null/blank a lot in this dataset - keep those sorted to the
// bottom regardless of direction, so an asc/desc toggle doesn't just shuffle
// blanks to the top.
function compareValues(a, b, key) {
  const av = a[key];
  const bv = b[key];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av).localeCompare(String(bv), 'th');
}

const PAGE_SIZE = 10;

export default function ContractsTable({ contracts, onEdit, onDelete }) {
  const [expandedId, setExpandedId] = useState(null);
  const [sort, setSort] = useState({ key: 'end_date', direction: 'asc' });
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const arr = [...contracts];
    arr.sort((a, b) => {
      const cmp = compareValues(a, b, sort.key);
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [contracts, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // Clamp instead of using state directly, so a filter/sort change that shrinks
  // the result set below the current page number doesn't leave the table blank.
  const currentPage = Math.min(page, pageCount);
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (contracts.length === 0) {
    return <div className="empty-state">ไม่พบสัญญาตามเงื่อนไขที่เลือก</div>;
  }

  function toggleExpand(id) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  function handleSort(key) {
    setPage(1);
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  }

  return (
    <>
    <div className="table-wrap">
      <table className="contracts-table">
        <colgroup>
          <col style={{ width: '32px' }} />
          {COLUMNS.map((col) => <col key={col.key} style={{ width: col.width }} />)}
          <col style={{ width: '96px' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="expand-toggle"></th>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`sortable-th ${col.num ? 'num' : ''} ${sort.key === col.key ? 'sortable-th--active' : ''}`}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                <span className="sort-arrow">
                  {sort.key === col.key ? (sort.direction === 'asc' ? '▲' : '▼') : ''}
                </span>
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((c) => {
            const isExpanded = expandedId === c.id;
            return (
              <Fragment key={c.id}>
                <tr
                  className={isExpanded ? 'row-expanded' : ''}
                  onClick={() => toggleExpand(c.id)}
                >
                  <td className="expand-toggle">{isExpanded ? '▾' : '▸'}</td>
                  <td className="cell-strong cell-clip" title={c.contract_name}>{c.contract_name}</td>
                  <td className="cell-clip" title={c.partner || ''}>{c.partner || '-'}</td>
                  <td className="cell-clip" title={c.country || ''}>{c.country || '-'}</td>
                  <td className="mono">{c.end_date || '-'}</td>
                  <td className="num">
                    <span className={`days-value days--${daysTone(c.days_until_end)}`}>
                      {formatDays(c.days_until_end)}
                    </span>
                  </td>
                  <td>
                    <span className={`status-chip status--${statusTone(c.status)}`}>
                      {c.status || '-'}
                    </span>
                  </td>
                  <td className="cell-clip" title={c.responsible_by || ''}>{c.responsible_by || '-'}</td>
                  <td className="num">{formatMoney(c.cost_amount, c.cost_currency)}</td>
                  <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="link-btn" onClick={() => onEdit(c)}>แก้ไข</button>
                    <button className="link-btn link-btn--danger" onClick={() => onDelete(c.id)}>ลบ</button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="detail-row">
                    <td colSpan={10}>
                      <div className="detail-grid">
                        <div>
                          <span className="detail-label">ประเภทบริการ</span>
                          {c.service_type || '-'}
                        </div>
                        <div>
                          <span className="detail-label">หน่วยงาน / ลูกค้า</span>
                          {c.customer || '-'}
                        </div>
                        <div>
                          <span className="detail-label">วันที่มีผล</span>
                          {c.effective_date || '-'}
                        </div>
                        <div>
                          <span className="detail-label">วันที่เริ่มสัญญา</span>
                          {c.start_date || '-'}
                        </div>
                        <div className="detail-wide">
                          <span className="detail-label">หมายเหตุ</span>
                          {c.note || '-'}
                        </div>
                        <div className="detail-wide">
                          <span className="detail-label">Remark</span>
                          {c.remark || '-'}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>

    <div className="table-footer">
      <span className="table-footer__count">
        แสดง {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, sorted.length)} จาก {sorted.length} รายการ
      </span>
      <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />
    </div>
    </>
  );
}
