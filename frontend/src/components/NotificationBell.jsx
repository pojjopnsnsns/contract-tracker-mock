import { useEffect, useRef, useState } from 'react';

function thresholdLabel(threshold) {
  if (threshold === -1) return 'เกินกำหนด';
  return `≤${threshold} วัน`;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationBell({ notifications, unseenCount, onRefresh, onMarkSeen, onMarkAllSeen }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) await onRefresh();
  }

  return (
    <div className="notif" ref={panelRef}>
      <button className="notif-bell" onClick={handleToggle} aria-label="การแจ้งเตือน">
        🔔
        {unseenCount > 0 && <span className="notif-badge">{unseenCount > 99 ? '99+' : unseenCount}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel__header">
            <span>การแจ้งเตือน</span>
            <div className="notif-panel__actions">
              <button className="link-btn" onClick={onMarkAllSeen} disabled={unseenCount === 0}>
                อ่านทั้งหมด
              </button>
            </div>
          </div>

          <div className="notif-list">
            {notifications.length === 0 && (
              <div className="notif-empty">ยังไม่มีการแจ้งเตือน</div>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`notif-item ${!n.seen ? 'notif-item--unseen' : ''}`}
                onClick={() => !n.seen && onMarkSeen(n.id)}
              >
                <div className="notif-item__top">
                  <span className="notif-item__threshold">{thresholdLabel(n.threshold_days)}</span>
                  <span>{formatTime(n.sent_at)}</span>
                </div>
                <div className="notif-item__message">{n.message}</div>
                <span className={`notif-item__tag ${n.seen ? 'notif-item__tag--muted' : ''}`}>
                  {n.seen ? 'อ่านแล้ว' : 'ใหม่'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
