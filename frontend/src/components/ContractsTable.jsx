import { useState, useMemo, useEffect, Fragment } from 'react';
import Pagination from './Pagination.jsx';
import StatusUpdateModal from './StatusUpdateModal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

const STATUS_TONE = {
  'Upcoming renewal': 'amber',
  'Negotiation in progress': 'blue',
  'Renewed': 'green',
  'Expired/Not renewed': 'red',
};

const TYPE_LABEL = {
  Master: 'Master',
  Amendment: 'Amendment',
  Addendum: 'Addendum',
};

const COLUMNS = [
  { key: 'contract_name', label: 'ชื่อสัญญา', width: '19%' },
  { key: 'partner', label: 'คู่สัญญา', width: '12%' },
  { key: 'country', label: 'ประเทศ', width: '8%' },
  { key: 'end_date', label: 'วันที่ครบกำหนด', width: '10%' },
  { key: 'days_until_end', label: 'คงเหลือ', width: '8%', num: true },
  { key: 'status', label: 'สถานะ', width: '12%' },
  { key: 'responsible_by', label: 'ผู้รับผิดชอบ', width: '10%' },
  { key: 'cost_amount', label: 'มูลค่าสัญญา', width: '9%', num: true },
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

export default function ContractsTable({
  contracts, allContracts, onEdit, onDelete, onUpdateStatus, highlightId, onHighlightConsumed,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [sort, setSort] = useState({ key: 'end_date', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [statusModalContract, setStatusModalContract] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expandedChildIds, setExpandedChildIds] = useState({});
  const [visualHighlight, setVisualHighlight] = useState(null);

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

  // Deep-link from a notification: jump to the page containing the target
  // contract, expand its row, and scroll it into view.
  useEffect(() => {
    if (highlightId == null) return;
    const idx = sorted.findIndex((c) => c.id === highlightId);
    if (idx === -1) return;

    const targetPage = Math.floor(idx / PAGE_SIZE) + 1;
    setPage(targetPage);
    setExpandedId(highlightId);
    setVisualHighlight(highlightId);

    const scrollTimer = setTimeout(() => {
      document.getElementById(`contract-row-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);

    onHighlightConsumed?.();

    const fadeTimer = setTimeout(() => setVisualHighlight(null), 3000);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(fadeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, sorted]);

  function parentName(contract) {
    if (!contract.parent_contract_id) return null;
    const parent = (allContracts || []).find((c) => c.id === contract.parent_contract_id);
    return parent ? parent.contract_name : `#${contract.parent_contract_id}`;
  }

  if (contracts.length === 0) {
    return <div className="empty-state">ไม่พบสัญญาตามเงื่อนไขที่เลือก</div>;
  }

  function toggleExpand(id) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  function toggleChild(id) {
    setExpandedChildIds((cur) => ({ ...cur, [id]: !cur[id] }));
  }

  function handleSort(key) {
    setPage(1);
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  }

  function handleDeleteClick(c) {
    setConfirmDelete(c);
  }

  return (
    <>
    <div className="table-wrap">
      <table className="contracts-table">
        <colgroup>
          <col style={{ width: '32px' }} />
          {COLUMNS.map((col) => <col key={col.key} style={{ width: col.width }} />)}
          <col style={{ width: '130px' }} />
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
            const isHighlighted = visualHighlight === c.id;
            const type = c.contract_type || 'Master';
            const children = type === 'Master'
              ? (allContracts || []).filter((x) => x.parent_contract_id === c.id)
              : [];
            return (
              <Fragment key={c.id}>
                <tr
                  id={`contract-row-${c.id}`}
                  className={`${isExpanded ? 'row-expanded' : ''} ${isHighlighted ? 'row-highlighted' : ''}`}
                  onClick={() => toggleExpand(c.id)}
                >
                  <td className="expand-toggle">{isExpanded ? '▾' : '▸'}</td>
                  <td className="cell-strong cell-clip" title={c.contract_name}>
                    {c.contract_name}
                    {type !== 'Master' && (
                      <span className="type-badge" title={`Amendment/Addendum ของ: ${parentName(c) || '-'}`}>
                        {TYPE_LABEL[type]}
                      </span>
                    )}
                  </td>
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
                    <button className="link-btn" onClick={() => setStatusModalContract(c)}>สถานะ</button>
                    <button className="link-btn" onClick={() => onEdit(c)}>แก้ไข</button>
                    <button className="link-btn link-btn--danger" onClick={() => handleDeleteClick(c)}>ลบ</button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="detail-row">
                    <td colSpan={10}>
                      <div className="detail-grid">
                        <div>
                          <span className="detail-label">ประเภทสัญญา</span>
                          {TYPE_LABEL[type]}
                        </div>
                        {type !== 'Master' && (
                          <div>
                            <span className="detail-label">สัญญาหลัก (Master)</span>
                            {parentName(c) || '-'}
                          </div>
                        )}
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
                        <div>
                          <span className="detail-label">วันสิ้นสุดสัญญา</span>
                          <span className="mono">{(type === 'Master' ? c.original_end_date : c.end_date) || '-'}</span>
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

                      {type === 'Master' && children.length > 0 && (
                        <div className="detail-subcontracts">
                          <span className="detail-label">Sub-contract (Amendment/Addendum)</span>
                          <div className="subcontract-list">
                            <div className="subcontract-item subcontract-item--header">
                              <span></span>
                              <span></span>
                              <span>ชื่อสัญญา</span>
                              <span>คู่สัญญา</span>
                              <span>ประเทศ</span>
                              <span>วันที่ครบกำหนด</span>
                              <span className="num">คงเหลือ</span>
                              <span>สถานะ</span>
                              <span>ผู้รับผิดชอบ</span>
                              <span className="num">มูลค่าสัญญา</span>
                              <span></span>
                            </div>
                            {children.map((k) => {
                              const childOpen = !!expandedChildIds[k.id];
                              return (
                                <div key={k.id} className="subcontract-card">
                                  <div
                                    className="subcontract-item"
                                    onClick={() => toggleChild(k.id)}
                                  >
                                    <span className="hierarchy-toggle">{childOpen ? '▾' : '▸'}</span>
                                    <span className="type-badge">{TYPE_LABEL[k.contract_type] || k.contract_type}</span>
                                    <span className="subcontract-name" title={k.contract_name}>{k.contract_name}</span>
                                    <span className="cell-clip" title={k.partner || ''}>{k.partner || '-'}</span>
                                    <span className="cell-clip" title={k.country || ''}>{k.country || '-'}</span>
                                    <span className="mono">{k.end_date || '-'}</span>
                                    <span className="num">
                                      <span className={`days-value days--${daysTone(k.days_until_end)}`}>
                                        {formatDays(k.days_until_end)}
                                      </span>
                                    </span>
                                    <span className={`status-chip status--${statusTone(k.status)}`}>
                                      {k.status || '-'}
                                    </span>
                                    <span className="cell-clip" title={k.responsible_by || ''}>{k.responsible_by || '-'}</span>
                                    <span className="num">{formatMoney(k.cost_amount, k.cost_currency)}</span>
                                    <button
                                      className="link-btn"
                                      onClick={(e) => { e.stopPropagation(); onEdit(k); }}
                                    >
                                      แก้ไข
                                    </button>
                                  </div>

                                  {childOpen && (
                                    <div className="subcontract-detail detail-grid">
                                      <div>
                                        <span className="detail-label">ประเภทบริการ</span>
                                        {k.service_type || '-'}
                                      </div>
                                      <div>
                                        <span className="detail-label">หน่วยงาน / ลูกค้า</span>
                                        {k.customer || '-'}
                                      </div>
                                      <div>
                                        <span className="detail-label">วันที่มีผล</span>
                                        {k.effective_date || '-'}
                                      </div>
                                      <div>
                                        <span className="detail-label">วันที่เริ่มสัญญา</span>
                                        {k.start_date || '-'}
                                      </div>
                                      <div>
                                        <span className="detail-label">วันสิ้นสุดสัญญา</span>
                                        <span className="mono">{k.end_date || '-'}</span>
                                      </div>
                                      <div className="detail-wide">
                                        <span className="detail-label">หมายเหตุ</span>
                                        {k.note || '-'}
                                      </div>
                                      <div className="detail-wide">
                                        <span className="detail-label">Remark</span>
                                        {k.remark || '-'}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
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

    {statusModalContract && (
      <StatusUpdateModal
        contract={statusModalContract}
        onClose={() => setStatusModalContract(null)}
        onSave={async (status) => {
          await onUpdateStatus(statusModalContract.id, status);
          setStatusModalContract(null);
        }}
      />
    )}

    {confirmDelete && (
      <ConfirmDialog
        message={`ยืนยันการลบข้อมูล "${confirmDelete.contract_name}" ใช่หรือไม่?`}
        confirmLabel="ลบ"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          onDelete(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    )}
    </>
  );
}
