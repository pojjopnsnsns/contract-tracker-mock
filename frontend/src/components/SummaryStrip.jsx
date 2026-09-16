const BLOCKS = [
  { key: 'total', label: 'สัญญาทั้งหมด', tone: 'blue', icon: '📄' },
  { key: 'overdue', label: 'เกินกำหนด', tone: 'red', icon: '⏰' },
  { key: 'critical', label: 'วิกฤต (≤30 วัน)', tone: 'critical', icon: '🔥' },
  { key: 'warning', label: 'เฝ้าระวัง (≤90 วัน)', tone: 'warn', icon: '⚠️' },
  { key: 'ok', label: 'ปกติ', tone: 'green', icon: '✅' },
];

export default function SummaryStrip({ contracts }) {
  const counts = { total: contracts.length, overdue: 0, critical: 0, warning: 0, ok: 0 };
  for (const c of contracts) {
    const level = c.alert_level;
    if (level === 'overdue') counts.overdue += 1;
    else if (level === 'critical') counts.critical += 1;
    else if (level === 'warning') counts.warning += 1;
    else if (level === 'ok') counts.ok += 1;
  }

  return (
    <div className="summary-strip">
      {BLOCKS.map((b) => {
        const pct = counts.total > 0 && b.key !== 'total'
          ? Math.round((counts[b.key] / counts.total) * 100)
          : null;
        return (
          <div key={b.key} className={`summary-block summary-block--${b.tone}`}>
            <span className={`summary-icon summary-icon--${b.tone}`}>{b.icon}</span>
            <div className="summary-block__text">
              <span className="summary-value">{counts[b.key]}</span>
              <span className="summary-label">{b.label}</span>
              {pct !== null && <span className="summary-pct">{pct}% ของทั้งหมด</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
