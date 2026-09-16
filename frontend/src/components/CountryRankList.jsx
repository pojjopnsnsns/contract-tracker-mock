const BAR_COLOR = '#6c5dd3';

export default function CountryRankList({ data }) {
  const maxCount = data.length > 0 ? Math.max(...data.map((d) => d.count)) : 0;

  return (
    <div className="chart-card top-expiring">
      <h3 className="chart-card__title">จำนวนสัญญาตามประเทศ (สูงสุด 10 อันดับ)</h3>

      {data.length === 0 ? (
        <p className="empty-state">ไม่มีข้อมูลประเทศ</p>
      ) : (
        <div className="top-expiring__list">
          <div className="top-expiring__row top-expiring__row--header">
            <span className="top-expiring__rank"></span>
            <span>ประเทศ</span>
            <span>สัดส่วน</span>
            <span className="top-expiring__pill-col">จำนวน</span>
          </div>

          {data.map((d, i) => (
            <div key={d.name} className="top-expiring__row">
              <span className="top-expiring__rank">{String(i + 1).padStart(2, '0')}</span>
              <span className="top-expiring__name" title={d.name}>{d.name}</span>
              <span className="top-expiring__bar-track">
                <span
                  className="top-expiring__bar-fill"
                  style={{ width: `${maxCount > 0 ? (d.count / maxCount) * 100 : 0}%`, background: BAR_COLOR }}
                />
              </span>
              <span className="top-expiring__pill-col">
                <span className="top-expiring__pill" style={{ color: BAR_COLOR, borderColor: BAR_COLOR }}>
                  {d.count} สัญญา
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
