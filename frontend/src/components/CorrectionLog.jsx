import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const actions = { INSERT: 'สร้าง', UPDATE: 'แก้ไข', DELETE: 'ลบ' };
const labels = {
  contract_name: 'ชื่อสัญญา', service_type: 'ประเภทบริการ', country: 'ประเทศ', partner: 'คู่ค้า',
  customer: 'ลูกค้า', note: 'บันทึก', responsible_by: 'ผู้รับผิดชอบ', remark: 'หมายเหตุ',
  effective_date: 'วันที่มีผลบังคับใช้', start_date: 'วันเริ่มสัญญา', end_date: 'วันสิ้นสุดสัญญา',
  status: 'สถานะ', cost_amount: 'ค่าใช้จ่าย', cost_currency: 'สกุลเงิน', contract_type: 'ประเภทสัญญา',
  parent_contract_id: 'รหัสสัญญาหลัก', original_end_date: 'วันสิ้นสุดสัญญาเดิม', original_status: 'สถานะเดิม',
  baseline_needs_review: 'ต้องตรวจสอบข้อมูลตั้งต้น', renewal_cycle: 'รอบการต่อสัญญา',
};
function valueText(value, field) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่ใช่';
  if (field === 'cost_amount' && Number.isFinite(Number(value))) return Number(value).toLocaleString('th-TH', { maximumFractionDigits: 20 });
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export default function CorrectionLog({ contracts }) {
  const [name, setName] = useState('');
  const [action, setAction] = useState('');
  const [revision, setRevision] = useState(0);
  const [entries, setEntries] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const pending = useRef(false);

  useEffect(() => {
    const current = ++generation.current;
    pending.current = true;
    setLoading(true); setError(''); setEntries([]); setCursor(null);
    const timer = setTimeout(() => {
      api.correctionLog({ ...(name.trim() && { contract_name: name.trim() }), ...(action && { action }) })
        .then(data => { if (current === generation.current) { setEntries(data.entries); setCursor(data.next_cursor); } })
        .catch(err => { if (current === generation.current) setError(err.message); })
        .finally(() => { if (current === generation.current) { pending.current = false; setLoading(false); } });
    }, 250);
    return () => { clearTimeout(timer); generation.current++; };
  }, [name, action, revision, contracts]);

  async function loadMore() {
    if (pending.current || !cursor) return;
    const current = generation.current;
    pending.current = true; setLoading(true); setError('');
    try {
      const data = await api.correctionLog({ before: cursor, ...(name.trim() && { contract_name: name.trim() }), ...(action && { action }) });
      if (current === generation.current) { setEntries(previous => [...previous, ...data.entries]); setCursor(data.next_cursor); }
    } catch (err) { if (current === generation.current) setError(err.message); }
    finally { if (current === generation.current) { pending.current = false; setLoading(false); } }
  }

  return <section className="chart-card correction-log" aria-labelledby="correction-log-title">
    <div className="correction-log__heading">
      <div><h2 id="correction-log-title">ประวัติการแก้ไข</h2>
        <p>ประวัติการดำเนินการเกี่ยวกับสัญญาโดยผู้ใช้และผู้ดูแลระบบ เรียงจากล่าสุด โดยแสดงเวลาตามเขตเวลาท้องถิ่นของคุณ</p></div>
      <button type="button" className="btn correction-log__refresh" title="รีเฟรช" aria-label="รีเฟรชประวัติการแก้ไข" disabled={loading} onClick={() => setRevision(v => v + 1)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" />
        </svg>
      </button>
    </div>
    <div className="correction-log__filters">
      <label>ชื่อสัญญา<input type="search" placeholder="ค้นหาจากชื่อสัญญา" value={name} onChange={event => setName(event.target.value)} /></label>
      <label>การดำเนินการ<select value={action} onChange={event => setAction(event.target.value)}>
        <option value="">การดำเนินการทั้งหมด</option>
        {Object.entries(actions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loading && !error && !entries.length && <p className="loading-text">ไม่พบประวัติการแก้ไข</p>}
    <ol className="correction-log__entries">
      {entries.map(entry => <li key={entry.id}>
        <div className="correction-log__meta">
          <strong>{entry.contract_name} <span>#{entry.contract_id}</span></strong>
          <span>{actions[entry.action] || entry.action} · {entry.actor_name}</span>
          <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString('th-TH')}</time>
        </div>
        <details><summary>
          <span className="correction-log__count">{entry.changes.length}</span><span>รายการที่เปลี่ยนแปลง</span>
          <span className="correction-log__expand">ดูรายละเอียด</span><span className="correction-log__collapse">ซ่อนรายละเอียด</span>
          <span className="correction-log__chevron" aria-hidden="true">⌄</span>
        </summary>
          <div className="correction-log__table-wrap"><table>
            <caption>รายละเอียดการเปลี่ยนแปลง · {entry.contract_name}</caption>
            <thead><tr><th scope="col">ข้อมูลที่แก้ไข</th><th scope="col">ก่อนแก้ไข</th><th scope="col">หลังแก้ไข</th></tr></thead>
            <tbody>{entry.changes.map(change => <tr key={change.field}>
              <th scope="row">{labels[change.field] || change.field.replaceAll('_', ' ')}</th>
              <td className="correction-log__before">{valueText(change.before, change.field)}</td>
              <td className="correction-log__after">{valueText(change.after, change.field)}</td>
            </tr>)}</tbody>
          </table></div>
        </details>
      </li>)}
    </ol>
    {loading && <p role="status">กำลังโหลดประวัติการแก้ไข…</p>}
    {cursor && <button type="button" className="btn" disabled={loading} onClick={loadMore}>โหลดประวัติเพิ่มเติม</button>}
  </section>;
}
