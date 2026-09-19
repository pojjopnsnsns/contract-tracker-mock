const NAV_ITEMS = [
  { id: 'dashboard', icon: '◧', label: 'สรุปภาพรวม' },
  { id: 'contracts', icon: '☰', label: 'รายการสัญญา' },
  { id: 'corrections', icon: '↺', label: 'ประวัติการแก้ไข' },
];

export default function Topbar({ activePage, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <img className="sidebar__logo" src="/business-contract-tracker-icon.svg" alt="Contract Tracker" />
        <span className="sidebar__brand-text">Business Contract Tracker</span>
      </div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar__nav-item ${activePage === item.id ? 'sidebar__nav-item--active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar__nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
