import { useEffect, useMemo, useState, useCallback, Suspense, lazy } from 'react';
import { api } from './api.js';
import Sidebar from './components/Topbar.jsx';
import FilterBar from './components/FilterBar.jsx';
import ContractsTable from './components/ContractsTable.jsx';
import ContractFormModal from './components/ContractFormModal.jsx';
import NotificationBell from './components/NotificationBell.jsx';

const DashboardPage = lazy(() => import('./components/DashboardPage.jsx'));

const PAGE_TITLES = {
  contracts: { eyebrow: 'ทะเบียนสัญญา', title: 'ระบบติดตามการต่อสัญญา' },
  dashboard: { eyebrow: 'ภาพรวม', title: 'สรุปภาพรวมสัญญา' },
};

const EMPTY_FILTERS = { search: '', status: '', alertLevel: '', serviceType: '', country: '' };

export default function App() {
  const [contracts, setContracts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState('dashboard');
  const [navHistory, setNavHistory] = useState([]);
  const [highlightId, setHighlightId] = useState(null);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [modalContract, setModalContract] = useState(null); // null = closed, {} = new, {...} = edit
  const [toast, setToast] = useState('');

  const loadContracts = useCallback(async () => {
    const data = await api.listContracts();
    setContracts(data);
  }, []);

  const loadNotifications = useCallback(async () => {
    const [list, unseen] = await Promise.all([api.listNotifications(), api.unseenCount()]);
    setNotifications(list);
    setUnseenCount(unseen.count);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadContracts(), loadNotifications()]);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadContracts, loadNotifications]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  // Central navigation helper: remembers where we came from (page + filters)
  // so the back button can restore it exactly.
  function goTo(newPage, opts = {}) {
    setNavHistory((h) => [...h, { page, filters }]);
    if (opts.filters) setFilters(opts.filters);
    if ('highlightId' in opts) setHighlightId(opts.highlightId);
    setPage(newPage);
  }

  function goBack() {
    setNavHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setPage(prev.page);
      setFilters(prev.filters);
      setHighlightId(null);
      return h.slice(0, -1);
    });
  }

  async function handleSave(data) {
    if (modalContract && modalContract.id) {
      await api.updateContract(modalContract.id, data);
      showToast('บันทึกการแก้ไขแล้ว');
    } else {
      await api.createContract(data);
      showToast('เพิ่มสัญญาใหม่แล้ว');
    }
    setModalContract(null);
    await loadContracts();
  }

  async function handleDelete(id) {
    await api.deleteContract(id);
    showToast('ลบสัญญาแล้ว');
    await loadContracts();
  }

  async function handleUpdateStatus(id, status) {
    await api.updateContract(id, { status });
    showToast('อัปเดตสถานะแล้ว');
    await loadContracts();
  }

  async function handleMarkSeen(id) {
    await api.markSeen(id);
    await loadNotifications();
  }

  async function handleMarkAllSeen() {
    await api.markAllSeen();
    await loadNotifications();
  }

  function handleSummaryCardClick(key) {
    goTo('contracts', { filters: { ...EMPTY_FILTERS, alertLevel: key === 'total' ? '' : key } });
  }

  function handleNotificationClick(n) {
    if (!n.contract_id) return;
    goTo('contracts', {
      filters: { ...EMPTY_FILTERS, search: n.contract_name || '' },
      highlightId: n.contract_id,
    });
  }

  const serviceTypes = useMemo(
    () => [...new Set(contracts.map((c) => c.service_type).filter(Boolean))].sort(),
    [contracts]
  );
  const countries = useMemo(
    () => [...new Set(contracts.map((c) => c.country).filter(Boolean))].sort(),
    [contracts]
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (filters.status && c.status !== filters.status) return false;
      if (filters.alertLevel && c.alert_level !== filters.alertLevel) return false;
      if (filters.serviceType && c.service_type !== filters.serviceType) return false;
      if (filters.country && c.country !== filters.country) return false;
      if (q) {
        const hay = `${c.contract_name} ${c.partner} ${c.customer}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contracts, filters]);

  const { eyebrow, title } = PAGE_TITLES[page];

  return (
    <div className="app-shell">
      <Sidebar activePage={page} onNavigate={(p) => goTo(p)} />

      <div className="app">
        <header className="app-header">
          <div className="app-header__title">
            {navHistory.length > 0 && (
              <button className="back-btn" onClick={goBack}>← ย้อนกลับ</button>
            )}
            <span className="app-header__eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
          </div>
          <div className="app-header__actions">
            {page === 'dashboard' && (
              <button className="btn btn--primary" onClick={() => setModalContract({})}>
                + เพิ่มสัญญาใหม่
              </button>
            )}
            <NotificationBell
              notifications={notifications}
              unseenCount={unseenCount}
              onRefresh={async () => {
                await Promise.all([loadContracts(), loadNotifications()]);
              }}
              onMarkSeen={handleMarkSeen}
              onMarkAllSeen={handleMarkAllSeen}
              onNotificationClick={handleNotificationClick}
            />
          </div>
        </header>

        <main className="app-main">
          {loading && <p className="loading-text">กำลังโหลดข้อมูล...</p>}
          {error && <p className="form-error">{error}</p>}

          {!loading && !error && page === 'dashboard' && (
            <Suspense fallback={<p className="loading-text">กำลังโหลดกราฟ...</p>}>
              <DashboardPage contracts={contracts} onCardClick={handleSummaryCardClick} />
            </Suspense>
          )}

          {!loading && !error && page === 'contracts' && (
            <>
              <FilterBar
                filters={filters}
                onChange={setFilters}
                serviceTypes={serviceTypes}
                countries={countries}
                onAddClick={() => setModalContract({})}
              />

              <ContractsTable
                contracts={filtered}
                allContracts={contracts}
                onEdit={(c) => setModalContract(c)}
                onDelete={handleDelete}
                onUpdateStatus={handleUpdateStatus}
                highlightId={highlightId}
                onHighlightConsumed={() => setHighlightId(null)}
              />
            </>
          )}
        </main>

        {modalContract !== null && (
          <ContractFormModal
            initial={modalContract.id ? modalContract : null}
            contracts={contracts}
            onSave={handleSave}
            onClose={() => setModalContract(null)}
          />
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
