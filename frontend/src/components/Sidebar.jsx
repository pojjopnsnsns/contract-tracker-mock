const NAV_ITEMS = [
  { id: 'contracts', icon: '☰', label: 'รายการสัญญา' },
  { id: 'dashboard', icon: '◧', label: 'สรุปภาพรวม (กราฟ)' },
];

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">CT</span>
        <span className="sidebar__brand-text">Contract Tracker</span>
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
