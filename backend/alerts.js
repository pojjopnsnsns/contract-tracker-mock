const dayjs = require('dayjs');

// Renewal-alert thresholds (days remaining until end_date)
const THRESHOLDS = {
  CRITICAL: 30,  // <= 30 days, or already overdue
  WARNING: 90,   // <= 90 days
};

// Days-remaining checkpoints at which an in-app notification gets generated
// (once each, the first time a contract crosses below that many days left).
const NOTIFICATION_THRESHOLDS = [90, 30, 7];

function daysUntil(endDate) {
  if (!endDate) return null;
  return dayjs(endDate).startOf('day').diff(dayjs().startOf('day'), 'day');
}

function alertLevel(contract) {
  // Contracts already marked Renewed/Expired-and-closed don't need an active alert,
  // but we still surface the number so the UI can show history.
  const days = daysUntil(contract.end_date);
  if (days === null) return { level: 'unknown', days: null };

  if (days < 0) return { level: 'overdue', days };
  if (days <= THRESHOLDS.CRITICAL) return { level: 'critical', days };
  if (days <= THRESHOLDS.WARNING) return { level: 'warning', days };
  return { level: 'ok', days };
}

function withAlert(contract) {
  const { level, days } = alertLevel(contract);
  return { ...contract, alert_level: level, days_until_end: days };
}

module.exports = { THRESHOLDS, NOTIFICATION_THRESHOLDS, daysUntil, alertLevel, withAlert };
