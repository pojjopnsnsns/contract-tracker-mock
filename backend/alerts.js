const THRESHOLDS = { CRITICAL: 30, URGENT: 60, WARNING: 90 };
const NOTIFICATION_THRESHOLDS = [90, 60, 30, 7];
const CLOSED_STATUSES = ['Renewed', 'Expired/Not renewed'];
function daysUntil(endDate, now = new Date()) {
  if (typeof endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return null;
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(end) || new Date(end).toISOString().slice(0,10) !== endDate) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: process.env.ALERT_TIMEZONE || 'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(p => [p.type,p.value]));
  return Math.round((end - Date.UTC(+values.year, +values.month-1, +values.day)) / 86400000);
}
function alertLevel(contract, now) {
  const days = daysUntil(contract.end_date, now);
  if (days === null) return { level: 'unknown', days };
  if (CLOSED_STATUSES.includes(contract.status)) return { level: 'ok', days };
  if (days < 0) return { level: 'overdue', days };
  if (days <= 30) return { level: 'critical', days };
  if (days <= 60) return { level: 'urgent', days };
  if (days <= 90) return { level: 'warning', days };
  return { level: 'ok', days };
}
function withAlert(contract) {
  const {level, days} = alertLevel(contract);
  return {...contract, alert_level:level, days_until_end:days};
}
module.exports = {THRESHOLDS, NOTIFICATION_THRESHOLDS, CLOSED_STATUSES, daysUntil, alertLevel, withAlert};
