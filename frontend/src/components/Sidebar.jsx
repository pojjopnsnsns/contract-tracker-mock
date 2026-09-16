const NAV_ITEMS = [
  { id: 'summary', icon: '◧', label: 'ภาพรวม' },
  { id: 'contracts', icon: '☰', label: 'รายการสัญญา' },
];

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function Sidebar({ activeId }) {
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
            className={`sidebar__nav-item ${activeId === item.id ? 'sidebar__nav-item--active' : ''}`}
            onClick={() => scrollTo(item.id)}
          >
            <span className="sidebar__nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
