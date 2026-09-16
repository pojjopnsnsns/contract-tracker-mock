// Optional email notification for upcoming/overdue contract renewals, via any
// standard SMTP server (company mail relay, Gmail with an app password, or a
// transactional provider like SendGrid/SES's SMTP endpoint).
// Disabled unless SMTP_HOST and ALERT_EMAIL_TO are set in the environment.

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'; // true for port 465, false for 587/25
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO; // comma-separated list of recipients

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    // Some internal/relay SMTP servers accept unauthenticated mail from
    // trusted IPs - only pass auth if credentials were actually configured.
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return transporter;
}

async function sendAlertEmail(subject, textBody, htmlBody) {
  if (!SMTP_HOST || !ALERT_EMAIL_TO) {
    console.log('[Email notify skipped - not configured]', subject);
    return { skipped: true };
  }

  const info = await getTransporter().sendMail({
    from: SMTP_FROM,
    to: ALERT_EMAIL_TO.split(',').map((s) => s.trim()).filter(Boolean),
    subject,
    text: textBody,
    html: htmlBody,
  });
  return { sent: true, messageId: info.messageId };
}

module.exports = { sendAlertEmail };
