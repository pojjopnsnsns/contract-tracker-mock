const path = require('path');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const { pool, initSchema, seedFromCsv } = require('./db');
const { withAlert, NOTIFICATION_THRESHOLDS, CLOSED_STATUSES } = require('./alerts');
// Loaded only when actually sending; existing project adapters stay unchanged.
const sendLineMessage = (...args) => require('./notifyLine').sendLineMessage(...args);
const sendAlertEmail = (...args) => require('./notifyEmail').sendAlertEmail(...args);
const { installAuth } = require('./auth');
const { trustedOrigins } = require('./origins');
const { correctionEntry } = require('./correctionLog');

const app = express();
app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.set('X-Content-Type-Options','nosniff');
  res.set('X-Frame-Options','DENY');
  res.set('Referrer-Policy','no-referrer');
  if(req.path.startsWith('/api/')) res.set('Cache-Control','no-store');
  next();
});
// Exact trusted frontend origins; cookies require credentials on cross-origin requests.
app.use(cors({
  origin: trustedOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
  preflightContinue: false,
}));
app.use(express.json({ limit: '100kb' }));

const PORT = process.env.PORT || 4000;

const STATUS_VALUES = [
  'Upcoming renewal',
  'Negotiation in progress',
  'Renewed',
  'Expired/Not renewed',
];

// Wrap async route handlers so thrown errors reach Express's error handler
// instead of crashing the process.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
installAuth(app, pool, ah);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function positiveId(value, field = 'id') {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new HttpError(400, `${field} must be a positive integer`);
  }
  return Number(value);
}

app.param('id', (req, res, next, value) => {
  try { req.contractId = positiveId(value); next(); } catch (err) { next(err); }
});

const TEXT_FIELDS = ['service_type', 'contract_name', 'country', 'partner', 'customer',
  'note', 'responsible_by', 'remark', 'cost_currency'];
const WRITE_FIELDS = [...TEXT_FIELDS, 'effective_date', 'start_date', 'end_date',
  'status', 'cost_amount', 'contract_type', 'parent_contract_id'];

function validateContract(body, existing = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be an object');
  }
  // Ignore server-derived fields (alert_level, days_until_end, timestamps, id).
  const input = Object.fromEntries(WRITE_FIELDS.filter(k => Object.hasOwn(body, k)).map(k => [k, body[k]]));
  const result = { status: 'Upcoming renewal', contract_type: 'Master', cost_currency: 'THB', ...existing, ...input };
  for (const field of TEXT_FIELDS) {
    const value = result[field];
    if (value == null || value === '') { result[field] = null; continue; }
    if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`);
    result[field] = value.trim() || null;
    if (value.length > (['note', 'remark'].includes(field) ? 10000 : 1000)) {
      throw new HttpError(400, `${field} is too long`);
    }
  }
  if (!result.contract_name) throw new HttpError(400, 'contract_name is required');
  if (!STATUS_VALUES.includes(result.status)) throw new HttpError(400, 'Invalid status');
  if (!['Master', 'Amendment', 'Addendum'].includes(result.contract_type)) {
    throw new HttpError(400, 'Invalid contract_type');
  }
  for (const field of ['effective_date', 'start_date', 'end_date']) {
    let value = result[field];
    if (value instanceof Date) value = value.toISOString().slice(0, 10);
    if (value == null || value === '') { result[field] = null; continue; }
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
      throw new HttpError(400, `${field} must be a valid YYYY-MM-DD date`);
    }
    result[field] = value;
  }
  if (!result.end_date) throw new HttpError(400, 'end_date is required');
  if (result.start_date && result.start_date > result.end_date) {
    throw new HttpError(400, 'end_date must not precede start_date');
  }
  const amount = result.cost_amount;
  if (amount == null || amount === '') result.cost_amount = null;
  else {
    if (!['number', 'string'].includes(typeof amount) || String(amount).trim() === '' ||
        !Number.isFinite(Number(amount)) || Number(amount) < 0 || Number(amount) > Number.MAX_SAFE_INTEGER) {
      throw new HttpError(400, 'cost_amount must be a non-negative finite amount within the supported range');
    }
    // Keep PostgreSQL NUMERIC strings intact; avoid extra rounding in the API.
    result.cost_amount = amount;
  }
  result.cost_currency = (result.cost_currency || 'THB').toUpperCase();
  if (!/^[A-Z]{3}$/.test(result.cost_currency)) throw new HttpError(400, 'cost_currency must have 3 letters');
  if (result.contract_type === 'Master') {
    if (result.parent_contract_id != null && result.parent_contract_id !== '') {
      throw new HttpError(400, 'Master cannot have a parent');
    }
    result.parent_contract_id = null;
  } else result.parent_contract_id = positiveId(result.parent_contract_id, 'parent_contract_id');
  return result;
}

async function transaction(work, lockKey = 71001, actor = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize this service's hierarchy writers, including moves/deletes.
    // A database constraint is still required for writers outside this service.
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
    await client.query("SELECT set_config('app.actor_id',$1,true), set_config('app.actor_name',$2,true)", [actor ? String(actor.id) : '', actor?.username || 'system']);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (rollbackError) { console.error('Rollback failed:', rollbackError); }
    throw error;
  } finally { client.release(); }
}

async function validateParent(client, contract, id) {
  if (contract.parent_contract_id === id) throw new HttpError(400, 'Contract cannot be its own parent');
  if (contract.parent_contract_id) {
    const { rows } = await client.query('SELECT * FROM contracts WHERE id = $1', [contract.parent_contract_id]);
    if (!rows.length || (rows[0].contract_type || 'Master') !== 'Master') {
      throw new HttpError(400, 'Parent must be an existing Master contract');
    }
  }
  if (id && contract.contract_type !== 'Master') {
    const { rows } = await client.query('SELECT id FROM contracts WHERE parent_contract_id = $1 LIMIT 1', [id]);
    if (rows.length) throw new HttpError(409, 'A Master with sub-contracts cannot change type');
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ---------- Contracts ----------

app.get('/api/contracts', ah(async (req, res) => {
  const { status, alert_level, q } = req.query;
  for (const value of [status, alert_level, q]) {
    if (value !== undefined && typeof value !== 'string') throw new HttpError(400, 'Filters must be strings');
  }
  if (status && !STATUS_VALUES.includes(status)) throw new HttpError(400, 'Invalid status filter');
  if (alert_level && !['overdue', 'critical', 'urgent', 'warning', 'ok', 'unknown'].includes(alert_level)) {
    throw new HttpError(400, 'Invalid alert_level filter');
  }
  const { rows } = await pool.query('SELECT * FROM contracts ORDER BY end_date ASC NULLS LAST');
  let result = rows.map(withAlert);

  if (status) result = result.filter(r => r.status === status);
  if (alert_level) result = result.filter(r => r.alert_level === alert_level);
  if (q) {
    const needle = q.toLowerCase();
    result = result.filter(r =>
      [r.contract_name, r.partner, r.customer, r.responsible_by, r.country]
        .filter(Boolean)
        .some(field => String(field).toLowerCase().includes(needle))
    );
  }
  res.json(result);
}));

app.get('/api/contracts/:id', ah(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM contracts WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(withAlert(rows[0]));
}));

// If this contract is an Amendment/Addendum with a parent, the parent Master's
// end_date AND status follow the MOST RECENTLY ADDED Amendment/Addendum among
// ALL of its sub-contracts - not a "furthest date wins" comparison. Editing an
// amendment's own end_date afterward doesn't change which one is "latest"
// (creation order is fixed), so it can't retroactively override a newer amendment.
// With no children, restore the confirmed original date and status.
async function cascadeEndDateToParent(client, contract) {
  if (!['Amendment', 'Addendum'].includes(contract.contract_type)) return;
  if (!contract.parent_contract_id) return;
  await recomputeParentEndDate(client, contract.parent_contract_id);
}

async function recomputeParentEndDate(client, parentId) {
  const { rows } = await client.query(
    `SELECT end_date, status FROM contracts
     WHERE parent_contract_id = $1 AND contract_type IN ('Amendment', 'Addendum')
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [parentId]
  );
  const latest = rows[0];
  if (!latest) {
    const {rows: parents} = await client.query('SELECT * FROM contracts WHERE id=$1', [parentId]);
    const parent = parents[0];
    if (!parent) return;
    if (parent.baseline_needs_review) throw new HttpError(409, 'Admin must confirm original Master date/status before removing the final sub-contract');
    await client.query(`UPDATE contracts SET end_date=original_end_date, status=original_status, updated_at=now()
      WHERE id=$1 AND (end_date IS DISTINCT FROM original_end_date OR status IS DISTINCT FROM original_status)`, [parentId]);
    return;
  }

  const fields = [];
  const values = [];
  let i = 1;
  if (latest.end_date) { fields.push(`end_date = $${i++}`); values.push(latest.end_date); }
  if (latest.status) { fields.push(`status = $${i++}`); values.push(latest.status); }
  if (fields.length === 0) return;

  values.push(parentId);
  await client.query(
    `UPDATE contracts SET ${fields.join(', ')}, updated_at = now() WHERE id = $${i}`,
    values
  );
}

app.post('/api/contracts', ah(async (req, res) => {
  const b = validateContract(req.body);
  const contract = await transaction(async client => {
    await validateParent(client, b);
    const { rows } = await client.query(`
      INSERT INTO contracts
        (service_type, contract_name, country, partner, customer, note,
         effective_date, start_date, end_date, responsible_by, remark, status,
         cost_amount, cost_currency, contract_type, parent_contract_id, original_end_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *
    `, [b.service_type, b.contract_name, b.country, b.partner, b.customer, b.note,
      b.effective_date, b.start_date, b.end_date, b.responsible_by, b.remark, b.status,
      b.cost_amount, b.cost_currency, b.contract_type, b.parent_contract_id, b.end_date]);
    await cascadeEndDateToParent(client, rows[0]);
    return rows[0];
  }, 71001, req.user);
  res.status(201).json(withAlert(contract));
}));

app.put('/api/contracts/:id', ah(async (req, res) => {
  const contract = await transaction(async client => {
    const { rows: existingRows } = await client.query('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [req.contractId]);
    if (!existingRows.length) throw new HttpError(404, 'Not found');
    const previous = existingRows[0];
    const b = validateContract(req.body, previous);
    await validateParent(client, b, req.contractId);
    if (previous.contract_type !== b.contract_type) throw new HttpError(409, 'Create a new contract to change contract_type');
    if (b.contract_type === 'Master') {
      const {rows: children} = await client.query('SELECT id FROM contracts WHERE parent_contract_id=$1 LIMIT 1',[req.contractId]);
      if (children.length && (b.end_date !== previous.end_date || b.status !== previous.status)) {
        throw new HttpError(409, 'Update the latest sub-contract to change the effective Master date/status');
      }
      if (!children.length) {
        await client.query('UPDATE contracts SET original_end_date=$1, original_status=$2 WHERE id=$3', [b.end_date,b.status,req.contractId]);
      }
    }
    const { rows } = await client.query(`
      UPDATE contracts SET service_type=$1, contract_name=$2, country=$3, partner=$4,
        customer=$5, note=$6, effective_date=$7, start_date=$8, end_date=$9,
        responsible_by=$10, remark=$11, status=$12, cost_amount=$13, cost_currency=$14,
        contract_type=$15, parent_contract_id=$16, updated_at=now()
      WHERE id=$17 RETURNING *
    `, [b.service_type, b.contract_name, b.country, b.partner, b.customer, b.note,
      b.effective_date, b.start_date, b.end_date, b.responsible_by, b.remark, b.status,
      b.cost_amount, b.cost_currency, b.contract_type, b.parent_contract_id, req.contractId]);
    if (previous.parent_contract_id && String(previous.parent_contract_id) !== String(b.parent_contract_id)) {
      await recomputeParentEndDate(client, previous.parent_contract_id);
    }
    await cascadeEndDateToParent(client, rows[0]);
    // Preserve the rule that a Master's effective values follow its latest child.
    if (b.contract_type === 'Master') await recomputeParentEndDate(client, req.contractId);
    const { rows: updated } = await client.query('SELECT * FROM contracts WHERE id = $1', [req.contractId]);
    return updated[0];
  }, 71001, req.user);
  res.json(withAlert(contract));
}));

app.delete('/api/contracts/:id', ah(async (req, res) => {
  await transaction(async client => {
    const { rows } = await client.query('SELECT * FROM contracts WHERE id = $1 FOR UPDATE', [req.contractId]);
    if (!rows.length) throw new HttpError(404, 'Not found');
    const { rows: children } = await client.query('SELECT id FROM contracts WHERE parent_contract_id = $1 LIMIT 1', [req.contractId]);
    if (children.length) throw new HttpError(409, 'Remove or move sub-contracts before deleting this Master');
    await client.query('DELETE FROM contracts WHERE id = $1', [req.contractId]);
    if (rows[0].parent_contract_id) await recomputeParentEndDate(client, rows[0].parent_contract_id);
  }, 71001, req.user);
  res.status(204).end();
}));

// ---------- Alerts / dashboard summary ----------

app.get('/api/alerts', ah(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM contracts ORDER BY end_date ASC NULLS LAST');
  const active = rows.map(withAlert).filter(r => ['overdue', 'critical', 'urgent', 'warning'].includes(r.alert_level));
  res.json(active);
}));

app.get('/api/summary', ah(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM contracts');
  const withAlerts = rows.map(withAlert);
  const summary = {
    total: withAlerts.length,
    by_status: Object.create(null),
    by_alert_level: { overdue: 0, critical: 0, urgent: 0, warning: 0, ok: 0, unknown: 0 },
  };
  for (const r of withAlerts) {
    summary.by_status[r.status] = (summary.by_status[r.status] || 0) + 1;
    summary.by_alert_level[r.alert_level] = (summary.by_alert_level[r.alert_level] || 0) + 1;
  }
  res.json(summary);
}));

app.get('/api/meta/status-values', (req, res) => res.json(STATUS_VALUES));

// ---------- In-app notifications (bell) ----------
// Generates a notification the first time a contract's days-remaining crosses
// below each threshold in NOTIFICATION_THRESHOLDS, plus one when it goes overdue.
// Existence check keeps this idempotent, so it's safe to call on every read.
async function syncNotifications() {
  return transaction(async client => {
    const {rows} = await client.query('SELECT * FROM contracts');
    for (const c of rows.map(withAlert)) {
      if (c.days_until_end == null || CLOSED_STATUSES.includes(c.status)) continue;
      const hits = c.days_until_end < 0 ? [-1] : NOTIFICATION_THRESHOLDS.filter(t=>c.days_until_end<=t);
      for (const threshold of hits) {
        const message = c.days_until_end < 0
          ? `สัญญา "${c.contract_name}" เกินกำหนดแล้ว (${c.end_date})`
          : `สัญญา "${c.contract_name}" จะครบกำหนดใน ${c.days_until_end} วัน (${c.end_date})`;
        await client.query(`INSERT INTO notification_log(contract_id,channel,message,threshold_days,renewal_cycle,due_date)
          VALUES($1,'app',$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[c.id,message,threshold,c.renewal_cycle,c.end_date]);
      }
    }
  }, 71001);
}
app.get('/api/notifications',ah(async(req,res)=>{
  await syncNotifications();
  const {rows}=await pool.query(`SELECT n.id,n.contract_id,n.message,n.threshold_days,n.sent_at,
    (r.notification_id IS NOT NULL) AS seen,c.contract_name,c.partner
    FROM notification_log n JOIN contracts c ON c.id=n.contract_id
    LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.user_id=$1
    WHERE n.channel='app' AND n.renewal_cycle=c.renewal_cycle
      AND c.status NOT IN ('Renewed','Expired/Not renewed')
    ORDER BY n.sent_at DESC,n.id DESC LIMIT 50`,[req.user.id]);
  res.json(rows);
}));
app.get('/api/notifications/unseen-count',ah(async(req,res)=>{
  await syncNotifications();
  const {rows}=await pool.query(`SELECT COUNT(*)::int AS count FROM notification_log n
    JOIN contracts c ON c.id=n.contract_id
    LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.user_id=$1
    WHERE n.channel='app' AND n.renewal_cycle=c.renewal_cycle AND r.notification_id IS NULL
    AND c.status NOT IN ('Renewed','Expired/Not renewed')`,[req.user.id]);
  res.json(rows[0]);
}));
app.post('/api/notifications/:id/seen',ah(async(req,res)=>{
  const {rows}=await pool.query("SELECT id FROM notification_log WHERE id=$1 AND channel='app'",[req.contractId]);
  if(!rows.length) throw new HttpError(404,'Not found');
  await pool.query('INSERT INTO notification_reads(notification_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.contractId,req.user.id]);
  res.json({ok:true});
}));
app.post('/api/notifications/mark-all-seen',ah(async(req,res)=>{
  await pool.query(`INSERT INTO notification_reads(notification_id,user_id)
    SELECT n.id,$1 FROM notification_log n JOIN contracts c ON c.id=n.contract_id
    WHERE n.channel='app' AND n.renewal_cycle=c.renewal_cycle
    AND c.status NOT IN ('Renewed','Expired/Not renewed') ON CONFLICT DO NOTHING`,[req.user.id]);
  res.json({ok:true});
}));
app.get('/api/correction-log',ah(async(req,res)=>{
  const contractId = req.query.contract_id === undefined ? null : positiveId(req.query.contract_id, 'contract_id');
  const before = req.query.before;
  if (before !== undefined && (typeof before !== 'string' || !/^[1-9]\d{0,18}$/.test(before) || BigInt(before) > 9223372036854775807n)) throw new HttpError(400, 'Invalid history cursor');
  const action = req.query.action;
  if (action !== undefined && !['INSERT', 'UPDATE', 'DELETE'].includes(action)) throw new HttpError(400, 'Invalid history action');
  if (req.query.contract_name !== undefined && typeof req.query.contract_name !== 'string') throw new HttpError(400, 'Invalid contract name');
  const name = req.query.contract_name?.trim() || null;
  const { rows } = await pool.query(`SELECT * FROM contract_audit_log
    WHERE ($1::integer IS NULL OR contract_id=$1)
      AND ($2::bigint IS NULL OR id<$2)
      AND ($3::text IS NULL OR action=$3)
      AND ($4::text IS NULL OR strpos(lower(COALESCE(after_data->>'contract_name', '')), lower($4)) > 0
        OR strpos(lower(COALESCE(before_data->>'contract_name', '')), lower($4)) > 0)
      AND (action <> 'UPDATE' OR (before_data - 'updated_at') IS DISTINCT FROM (after_data - 'updated_at'))
    ORDER BY id DESC LIMIT 26`, [contractId, before ?? null, action ?? null, name]);
  const entries = rows.slice(0, 25).map(correctionEntry);
  res.json({ entries, next_cursor: rows.length > 25 ? entries.at(-1).id : null });
}));
app.get('/api/audit',ah(async(req,res)=>{
  const id=req.query.contract_id ? positiveId(req.query.contract_id,'contract_id') : null;
  const {rows}=await pool.query('SELECT * FROM contract_audit_log WHERE ($1::integer IS NULL OR contract_id=$1) ORDER BY id DESC LIMIT 100',[id]);
  res.json(rows);
}));
app.put('/api/contracts/:id/baseline',ah(async(req,res)=>{
  const b=req.body || {};
  const checked=validateContract({contract_name:'baseline',end_date:b.original_end_date,status:b.original_status});
  if(!Object.hasOwn(b,'original_status')) throw new HttpError(400,'original_status is required');
  const result=await transaction(async client=>{
    const {rows}=await client.query(`UPDATE contracts SET original_end_date=$1,original_status=$2,
      baseline_needs_review=false,updated_at=now() WHERE id=$3 AND contract_type='Master' RETURNING *`,
      [checked.end_date,checked.status,req.contractId]);
    if(!rows.length) throw new HttpError(404,'Master not found');
    await recomputeParentEndDate(client,req.contractId);
    return (await client.query('SELECT * FROM contracts WHERE id=$1',[req.contractId])).rows[0];
  },71001,req.user);
  res.json(withAlert(result));
}));

// ---------- Notifications ----------

async function runDailyAlertCheck() {
  const { rows } = await pool.query('SELECT * FROM contracts');
  const due = rows.map(withAlert).filter(r => ['overdue', 'critical'].includes(r.alert_level));
  if (due.length === 0) return { skipped: true, reason: 'no active alerts' };

  const lines = due.map(r =>
    `• ${r.contract_name} (${r.partner || '-'}) — ${r.alert_level === 'overdue' ? 'overdue' : `${r.days_until_end}d left`}`
  );
  const message = `Contract renewal alert (${due.length}):\n${lines.join('\n')}`;

  const htmlRows = due.map(r => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(r.contract_name)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(r.partner || '-')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(r.end_date || '-')}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${r.alert_level === 'overdue' ? '#b3261e' : '#c1571b'};">
        ${r.alert_level === 'overdue' ? 'เกินกำหนด' : `เหลือ ${r.days_until_end} วัน`}
      </td>
    </tr>`).join('');
  const html = `
    <div style="font-family:sans-serif;font-size:14px;color:#1b1f27;">
      <p>สัญญาที่ต้องติดตามการต่อสัญญา (${due.length} รายการ):</p>
      <table style="border-collapse:collapse;width:100%;">
        <thead>
          <tr style="text-align:left;background:#fafaf8;">
            <th style="padding:6px 10px;">ชื่อสัญญา</th>
            <th style="padding:6px 10px;">คู่สัญญา</th>
            <th style="padding:6px 10px;">วันครบกำหนด</th>
            <th style="padding:6px 10px;">สถานะ</th>
          </tr>
        </thead>
        <tbody>${htmlRows}</tbody>
      </table>
    </div>`;

  const channelResults = await Promise.allSettled([
    sendLineMessage(message),
    sendAlertEmail(`แจ้งเตือนการต่อสัญญา (${due.length} รายการ)`, message, html),
  ]);

  const [lineResult, emailResult] = channelResults.map((result, index) => {
    if (result.status === 'fulfilled') return result.value || { skipped: true };
    console.error(`Alert channel ${index === 0 ? 'line' : 'email'} failed:`, result.reason);
    return { skipped: true, failed: true };
  });
  for (const r of due) {
    if (!lineResult.skipped && !lineResult.failed) {
      await pool.query(
        'INSERT INTO notification_log (contract_id, channel, message) VALUES ($1, $2, $3)',
        [r.id, 'line', message]
      );
    }
    if (!emailResult.skipped && !emailResult.failed) {
      await pool.query(
        'INSERT INTO notification_log (contract_id, channel, message) VALUES ($1, $2, $3)',
        [r.id, 'email', message]
      );
    }
  }
  return { line: lineResult, email: emailResult };
}

async function guardedDailyAlertCheck() {
  const client=await pool.connect();
  let locked=false;
  try {
    const {rows}=await client.query('SELECT pg_try_advisory_lock(71003) AS locked');
    locked=rows[0].locked;
    if(!locked) throw new HttpError(409,'Alert check already running');
    return await runDailyAlertCheck();
  } finally {
    try { if(locked) await client.query('SELECT pg_advisory_unlock(71003)'); }
    finally { client.release(); }
  }
}

app.post('/api/notify/run-now', ah(async (req, res) => {
  // Auth middleware restricts this route to an authenticated Admin.
  const result = await guardedDailyAlertCheck();
  res.json({ ok: true, result });
}));

// Liveness only: no schema or connection details are exposed.
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Generic error handler - keeps a bad query from crashing the whole process
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
  const databaseErrors = {
    '23514': [409, 'Contract violates a data or hierarchy constraint'],
    '23503': [409, 'Related records prevent this operation'],
    '23505': [409, 'Record already exists'],
    '23502': [400, 'A required field is missing'],
    '22P02': [400, 'Invalid field value'],
    '22003': [400, 'Numeric value is out of range'],
  };
  if (databaseErrors[err.code]) {
    const [status, message] = databaseErrors[err.code];
    return res.status(status).json({ error: message });
  }
  console.error('Unhandled API error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  await initSchema();
  if (process.env.SEED_MOCK_DATA === 'true') await seedFromCsv(path.join(__dirname, 'data', 'Contract_Tracking_Mock.csv'));
  // Fail before listening for an invalid timezone.
  new Intl.DateTimeFormat('en-US',{timeZone:process.env.ALERT_TIMEZONE || 'Asia/Bangkok'}).format();
  const server = await new Promise((resolve,reject)=>{
    const listener=app.listen(PORT,()=>resolve(listener));
    listener.once('error',reject);
  });
  console.log(`Contract tracker API listening on port ${PORT}`);
  const task = process.env.ENABLE_DAILY_ALERTS === 'true' ? cron.schedule('0 8 * * *', () => {
    guardedDailyAlertCheck().catch(err => console.error('Daily alert check failed:', err));
  }, { timezone: process.env.ALERT_TIMEZONE || 'Asia/Bangkok' }) : null;
  return { server, task };
}

if (require.main === module) {
  start().then(({server,task})=>{
    let closing=false;
    const shutdown=()=>{
      if(closing) return; closing=true; task?.stop();
      const timer=setTimeout(()=>process.exit(1),15000); timer.unref();
      server.close(()=>pool.end().then(()=>{clearTimeout(timer);process.exit(0);}));
    };
    process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
  }).catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { app, start, validateContract, positiveId, escapeHtml, transaction, syncNotifications, recomputeParentEndDate };
