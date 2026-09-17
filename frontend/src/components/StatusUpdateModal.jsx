import { useState } from 'react';

const STATUS_OPTIONS = [
  'Upcoming renewal',
  'Negotiation in progress',
  'Renewed',
  'Expired/Not renewed',
];

export default function StatusUpdateModal({ contract, onSave, onClose }) {
  const [status, setStatus] = useState(contract.status || STATUS_OPTIONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(status);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>อัปเดตสถานะสัญญา</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form className="contract-form" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}

          <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--ink-muted)' }}>
            {contract.contract_name}
          </p>

          <label>
            สถานะใหม่
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>ยกเลิก</button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
