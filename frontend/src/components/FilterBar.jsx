const STATUS_OPTIONS = [
  'Upcoming renewal',
  'Negotiation in progress',
  'Renewed',
  'Expired/Not renewed',
];

const ALERT_OPTIONS = [
  { value: 'overdue', label: 'เกินกำหนด' },
  { value: 'critical', label: 'วิกฤต (≤30 วัน)' },
  { value: 'warning', label: 'เฝ้าระวัง (≤90 วัน)' },
  { value: 'ok', label: 'ปกติ' },
];

export default function FilterBar({ filters, onChange, serviceTypes, countries, onAddClick }) {
  function set(field, value) {
    onChange({ ...filters, [field]: value });
  }

  return (
    <div className="filter-bar">
      <input
        type="text"
        className="filter-search"
        placeholder="ค้นหาชื่อสัญญา คู่สัญญา หรือหน่วยงาน..."
        value={filters.search}
        onChange={(e) => set('search', e.target.value)}
      />

      <select value={filters.status} onChange={(e) => set('status', e.target.value)}>
        <option value="">สถานะทั้งหมด</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select value={filters.alertLevel} onChange={(e) => set('alertLevel', e.target.value)}>
        <option value="">ระดับแจ้งเตือนทั้งหมด</option>
        {ALERT_OPTIONS.map((a) => (
          <option key={a.value} value={a.value}>{a.label}</option>
        ))}
      </select>

      <select value={filters.serviceType} onChange={(e) => set('serviceType', e.target.value)}>
        <option value="">ประเภทบริการทั้งหมด</option>
        {serviceTypes.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select value={filters.country} onChange={(e) => set('country', e.target.value)}>
        <option value="">ประเทศทั้งหมด</option>
        {countries.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <button className="btn btn--primary filter-bar__add" onClick={onAddClick}>
        + เพิ่มสัญญาใหม่
      </button>
    </div>
  );
}
