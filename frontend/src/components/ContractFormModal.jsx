import { useState } from 'react';

const STATUS_OPTIONS = [
  'Upcoming renewal',
  'Negotiation in progress',
  'Renewed',
  'Expired/Not renewed',
];

const EMPTY = {
  contract_name: '', service_type: '', country: '', partner: '', customer: '',
  effective_date: '', start_date: '', end_date: '', responsible_by: '',
  status: 'Upcoming renewal', cost_amount: '', cost_currency: 'THB', note: '', remark: '',
};

export default function ContractFormModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial ? { ...EMPTY, ...initial } : EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.contract_name.trim()) return setError('กรุณากรอกชื่อสัญญา');
    if (!form.end_date) return setError('กรุณาระบุวันที่ครบกำหนด');

    setError('');
    setSaving(true);
    try {
      await onSave({
        ...form,
        cost_amount: form.cost_amount === '' ? null : Number(form.cost_amount),
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{initial ? 'แก้ไขสัญญา' : 'เพิ่มสัญญาใหม่'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form className="contract-form" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}

          <div className="form-grid">
            <label>
              ชื่อสัญญา *
              <input value={form.contract_name} onChange={(e) => set('contract_name', e.target.value)} />
            </label>
            <label>
              ประเภทบริการ
              <input value={form.service_type} onChange={(e) => set('service_type', e.target.value)} />
            </label>
            <label>
              คู่สัญญา
              <input value={form.partner} onChange={(e) => set('partner', e.target.value)} />
            </label>
            <label>
              ประเทศ
              <input value={form.country} onChange={(e) => set('country', e.target.value)} />
            </label>
            <label>
              หน่วยงาน / ลูกค้า
              <input value={form.customer} onChange={(e) => set('customer', e.target.value)} />
            </label>
            <label>
              ผู้รับผิดชอบ
              <input value={form.responsible_by} onChange={(e) => set('responsible_by', e.target.value)} />
            </label>
            <label>
              วันที่มีผล
              <input type="date" value={form.effective_date || ''} onChange={(e) => set('effective_date', e.target.value)} />
            </label>
            <label>
              วันที่เริ่มสัญญา
              <input type="date" value={form.start_date || ''} onChange={(e) => set('start_date', e.target.value)} />
            </label>
            <label>
              วันที่ครบกำหนด *
              <input type="date" value={form.end_date || ''} onChange={(e) => set('end_date', e.target.value)} />
            </label>
            <label>
              สถานะ
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              มูลค่าสัญญา
              <input type="number" step="0.01" value={form.cost_amount ?? ''} onChange={(e) => set('cost_amount', e.target.value)} />
            </label>
            <label>
              สกุลเงิน
              <input value={form.cost_currency} onChange={(e) => set('cost_currency', e.target.value)} />
            </label>
          </div>

          <label className="form-wide">
            หมายเหตุ
            <textarea rows={2} value={form.note || ''} onChange={(e) => set('note', e.target.value)} />
          </label>
          <label className="form-wide">
            Remark
            <textarea rows={2} value={form.remark || ''} onChange={(e) => set('remark', e.target.value)} />
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
