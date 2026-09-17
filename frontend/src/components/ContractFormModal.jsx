import { useState } from 'react';

const STATUS_OPTIONS = [
  'Upcoming renewal',
  'Negotiation in progress',
  'Renewed',
  'Expired/Not renewed',
];

const CONTRACT_TYPE_OPTIONS = [
  { value: 'Master', label: 'Master (สัญญาหลัก)' },
  { value: 'Amendment', label: 'Amendment (สัญญาย่อย - แก้ไข)' },
  { value: 'Addendum', label: 'Addendum (สัญญาย่อย - เพิ่มเติม)' },
];

const EMPTY = {
  contract_name: '', service_type: '', country: '', partner: '', customer: '',
  effective_date: '', start_date: '', end_date: '', responsible_by: '',
  status: 'Upcoming renewal', cost_amount: '', cost_currency: 'THB', note: '', remark: '',
  contract_type: 'Master', parent_contract_id: '',
};

export default function ContractFormModal({ initial, contracts, onSave, onClose }) {
  const [form, setForm] = useState(initial ? { ...EMPTY, ...initial } : EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isSubContract = form.contract_type === 'Amendment' || form.contract_type === 'Addendum';

  // Only true Master contracts can be picked as a parent, and a contract can't
  // be its own parent when editing.
  const masterOptions = (contracts || []).filter(
    (c) => (c.contract_type || 'Master') === 'Master' && c.id !== initial?.id
  );

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.contract_name.trim()) return setError('กรุณากรอกชื่อสัญญา');
    if (!form.end_date) return setError('กรุณาระบุวันที่ครบกำหนด');
    if (isSubContract && !form.parent_contract_id) return setError('กรุณาเลือกสัญญาหลัก (Master) ที่สัญญานี้สังกัดอยู่');

    setError('');
    setSaving(true);
    try {
      await onSave({
        ...form,
        cost_amount: form.cost_amount === '' ? null : Number(form.cost_amount),
        parent_contract_id: isSubContract ? Number(form.parent_contract_id) : null,
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
              ประเภทสัญญา
              <select value={form.contract_type} onChange={(e) => set('contract_type', e.target.value)}>
                {CONTRACT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>

            {isSubContract && (
              <label className="form-wide">
                สัญญาหลัก (Master) *
                <select value={form.parent_contract_id || ''} onChange={(e) => set('parent_contract_id', e.target.value)}>
                  <option value="">-- เลือกสัญญาหลัก --</option>
                  {masterOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.contract_name}</option>
                  ))}
                </select>
                {masterOptions.length === 0 && (
                  <span style={{ fontSize: '11.5px', color: 'var(--ink-muted)', marginTop: '4px' }}>
                    ยังไม่มีสัญญา Master ในระบบ - สร้างสัญญาหลักก่อนจึงจะเพิ่ม Amendment/Addendum ได้
                  </span>
                )}
              </label>
            )}

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
              {isSubContract && (
                <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                  วันที่นี้จะอัปเดตไปยังสัญญาหลักที่เลือกไว้ด้วย
                </span>
              )}
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
