import { useEffect, useMemo, useState, useCallback, Suspense, lazy } from 'react';
import { api } from './api.js';
import Sidebar from './components/Sidebar.jsx';
import FilterBar from './components/FilterBar.jsx';
import ContractsTable from './components/ContractsTable.jsx';
import ContractFormModal from './components/ContractFormModal.jsx';
import NotificationBell from './components/NotificationBell.jsx';

const DashboardPage = lazy(() => import('./components/DashboardPage.jsx'));

const PAGE_TITLES = {
  contracts: { eyebrow: 'ทะเบียนสัญญา', title: 'ระบบติดตามการต่อสัญญา' },
  dashboard: { eyebrow: 'ภาพรวม', title: 'สรุปภาพรวมสัญญา' },
};

export default function App() {
  const [contracts, setContracts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState('contracts');

  const [filters, setFilters] = useState({ search: '', status: '', serviceType: '', country: '' });
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

  async function handleMarkSeen(id) {
    await api.markSeen(id);
    await loadNotifications();
  }

  async function handleMarkAllSeen() {
    await api.markAllSeen();
    await loadNotifications();
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
      <Sidebar activePage={page} onNavigate={setPage} />

      <div className="app">
        <header className="app-header">
          <div className="app-header__title">
            <span className="app-header__eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
          </div>
          <NotificationBell
            notifications={notifications}
            unseenCount={unseenCount}
            onRefresh={async () => {
              await Promise.all([loadContracts(), loadNotifications()]);
            }}
            onMarkSeen={handleMarkSeen}
            onMarkAllSeen={handleMarkAllSeen}
          />
        </header>

        <main className="app-main">
          {loading && <p className="loading-text">กำลังโหลดข้อมูล...</p>}
          {error && <p className="form-error">{error}</p>}

          {!loading && !error && page === 'dashboard' && (
            <Suspense fallback={<p className="loading-text">กำลังโหลดกราฟ...</p>}>
              <DashboardPage contracts={contracts} />
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
                onEdit={(c) => setModalContract(c)}
                onDelete={handleDelete}
              />
            </>
          )}
        </main>

        {modalContract !== null && (
          <ContractFormModal
            initial={modalContract.id ? modalContract : null}
            onSave={handleSave}
            onClose={() => setModalContract(null)}
          />
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}
