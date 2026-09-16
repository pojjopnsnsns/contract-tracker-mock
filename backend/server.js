const path = require('path');
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const { pool, initSchema, seedFromCsv } = require('./db');
const { withAlert, NOTIFICATION_THRESHOLDS } = require('./alerts');
const { sendLineMessage } = require('./notifyLine');
const { sendAlertEmail } = require('./notifyEmail');

const app = express();
app.use(cors());
app.use(express.json());

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

// ---------- Contracts ----------

app.get('/api/contracts', ah(async (req, res) => {
  const { status, alert_level, q } = req.query;
  const { rows } = await pool.query('SELECT * FROM contracts ORDER BY end_date ASC NULLS LAST');
  let result = rows.map(withAlert);

  if (status) result = result.filter(r => r.status === status);
  if (alert_level) result = result.filter(r => r.alert_level === alert_level);
  if (q) {
    const needle = q.toLowerCase();
    result = result.filter(r =>
      [r.contract_name, r.partner, r.customer, r.responsible_by, r.country]
        .filter(Boolean)
        .some(field => field.toLowerCase().includes(needle))
    );
  }
  res.json(result);
}));

app.get('/api/contracts/:id', ah(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM contracts WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(withAlert(rows[0]));
}));

app.post('/api/contracts', ah(async (req, res) => {
  const b = req.body;
  if (!b.contract_name) return res.status(400).json({ error: 'contract_name is required' });

  const { rows } = await pool.query(`
    INSERT INTO contracts
      (service_type, contract_name, country, partner, customer, note,
       effective_date, start_date, end_date, responsible_by, remark, status,
       cost_amount, cost_currency)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *
  `, [
    b.service_type || null, b.contract_name, b.country || null, b.partner || null,
    b.customer || null, b.note || null, b.effective_date || null, b.start_date || null,
    b.end_date || null, b.responsible_by || null, b.remark || null,
    b.status || 'Upcoming renewal', b.cost_amount ?? null, b.cost_currency || 'THB',
  ]);
  res.status(201).json(withAlert(rows[0]));
}));

app.put('/api/contracts/:id', ah(async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM contracts WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });

  const merged = { ...existingRows[0], ...req.body };
  const { rows } = await pool.query(`
    UPDATE contracts SET
      service_type=$1, contract_name=$2, country=$3, partner=$4, customer=$5, note=$6,
      effective_date=$7, start_date=$8, end_date=$9, responsible_by=$10, remark=$11,
      status=$12, cost_amount=$13, cost_currency=$14, updated_at=now()
    WHERE id=$15
    RETURNING *
  `, [
    merged.service_type, merged.contract_name, merged.country, merged.partner, merged.customer,
    merged.note, merged.effective_date, merged.start_date, merged.end_date, merged.responsible_by,
    merged.remark, merged.status, merged.cost_amount, merged.cost_currency, req.params.id,
  ]);
  res.json(withAlert(rows[0]));
}));

app.delete('/api/contracts/:id', ah(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM contracts WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
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
    by_status: {},
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
  const { rows } = await pool.query('SELECT * FROM contracts');
  for (const c of rows.map(withAlert)) {
    if (c.days_until_end == null) continue;

    const hits = c.days_until_end < 0
      ? [-1]
      : NOTIFICATION_THRESHOLDS.filter((t) => c.days_until_end <= t);

    for (const threshold of hits) {
      const { rows: exists } = await pool.query(
        `SELECT 1 FROM notification_log WHERE contract_id = $1 AND threshold_days = $2 AND channel = 'app'`,
        [c.id, threshold]
      );
      if (exists.length > 0) continue;

      const message = threshold === -1
        ? `สัญญา "${c.contract_name}" เกินกำหนดต่อสัญญาแล้ว (ครบกำหนด ${c.end_date})`
        : `สัญญา "${c.contract_name}" จะครบกำหนดใน ${c.days_until_end} วัน (${c.end_date})`;

      await pool.query(
        `INSERT INTO notification_log (contract_id, channel, message, threshold_days, seen)
         VALUES ($1, 'app', $2, $3, false)`,
        [c.id, message, threshold]
      );
    }
  }
}

app.get('/api/notifications', ah(async (req, res) => {
  await syncNotifications();
  const { rows } = await pool.query(`
    SELECT n.id, n.contract_id, n.message, n.threshold_days, n.seen, n.sent_at,
           c.contract_name, c.partner
    FROM notification_log n
    LEFT JOIN contracts c ON c.id = n.contract_id
    WHERE n.channel = 'app'
    ORDER BY n.sent_at DESC
    LIMIT 50
  `);
  res.json(rows);
}));

app.get('/api/notifications/unseen-count', ah(async (req, res) => {
  await syncNotifications();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM notification_log WHERE channel = 'app' AND seen = false`
  );
  res.json(rows[0]);
}));

app.post('/api/notifications/:id/seen', ah(async (req, res) => {
  const { rowCount } = await pool.query(
    `UPDATE notification_log SET seen = true WHERE id = $1 AND channel = 'app'`,
    [req.params.id]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
}));

app.post('/api/notifications/mark-all-seen', ah(async (req, res) => {
  await pool.query(`UPDATE notification_log SET seen = true WHERE channel = 'app' AND seen = false`);
  res.json({ ok: true });
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
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.contract_name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.partner || '-'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${r.end_date || '-'}</td>
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

  const [lineResult, emailResult] = await Promise.all([
    sendLineMessage(message),
    sendAlertEmail(`แจ้งเตือนการต่อสัญญา (${due.length} รายการ)`, message, html),
  ]);

  for (const r of due) {
    if (!lineResult.skipped) {
      await pool.query(
        'INSERT INTO notification_log (contract_id, channel, message) VALUES ($1, $2, $3)',
        [r.id, 'line', message]
      );
    }
    if (!emailResult.skipped) {
      await pool.query(
        'INSERT INTO notification_log (contract_id, channel, message) VALUES ($1, $2, $3)',
        [r.id, 'email', message]
      );
    }
  }
  return { line: lineResult, email: emailResult };
}

app.post('/api/notify/run-now', ah(async (req, res) => {
  const result = await runDailyAlertCheck();
  res.json({ ok: true, result });
}));

// Daily at 08:00 server time - sends nothing on channels that aren't configured
cron.schedule('0 8 * * *', () => {
  runDailyAlertCheck().catch(err => console.error('Daily alert check failed:', err));
});

// Generic error handler - keeps a bad query from crashing the whole process
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

async function start() {
  await initSchema();
  await seedFromCsv(path.join(__dirname, 'data', 'Contract_Tracking_Mock.csv'));
  app.listen(PORT, () => {
    console.log(`Contract tracker API listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
