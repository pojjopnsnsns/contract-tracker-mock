const TONE_COLOR = {
  expired: '#ff5b5b',
  critical: '#ff5b5b',
  warn: '#ff7d33',
  notice: '#ffa412',
  safe: '#37c17e',
};

function daysTone(days) {
  if (days < 0) return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warn';
  if (days <= 90) return 'notice';
  return 'safe';
}

function formatDays(days) {
  if (days < 0) return `เกิน ${Math.abs(days)} วัน`;
  return `${days} วัน`;
}

// Urgency bar: 0 days (or overdue) = full bar, 90+ days out = empty.
// Purely a visual proportion for this list, not a stored/derived business metric.
function urgencyPct(days) {
  if (days < 0) return 100;
  const capped = Math.min(days, 90);
  return Math.round((1 - capped / 90) * 100);
}

export default function TopExpiringList({ contracts }) {
  const top = contracts
    .filter((c) => c.days_until_end != null)
    .sort((a, b) => a.days_until_end - b.days_until_end)
    .slice(0, 10);

  return (
    <div className="chart-card top-expiring">
      <h3 className="chart-card__title">สัญญาที่ใกล้ครบกำหนด (สูงสุด 10 อันดับ)</h3>

      {top.length === 0 ? (
        <p className="empty-state">ไม่มีสัญญาที่ระบุวันครบกำหนด</p>
      ) : (
        <div className="top-expiring__list">
          <div className="top-expiring__row top-expiring__row--header">
            <span className="top-expiring__rank"></span>
            <span>ชื่อสัญญา</span>
            <span>ความเร่งด่วน</span>
            <span className="top-expiring__pill-col">คงเหลือ</span>
          </div>

          {top.map((c, i) => {
            const tone = daysTone(c.days_until_end);
            const color = TONE_COLOR[tone];
            return (
              <div key={c.id} className="top-expiring__row">
                <span className="top-expiring__rank">{String(i + 1).padStart(2, '0')}</span>
                <span className="top-expiring__name" title={c.contract_name}>{c.contract_name}</span>
                <span className="top-expiring__bar-track">
                  <span
                    className="top-expiring__bar-fill"
                    style={{ width: `${urgencyPct(c.days_until_end)}%`, background: color }}
                  />
                </span>
                <span className="top-expiring__pill-col">
                  <span className="top-expiring__pill" style={{ color, borderColor: color }}>
                    {formatDays(c.days_until_end)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
