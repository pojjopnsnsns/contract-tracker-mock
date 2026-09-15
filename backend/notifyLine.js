// Optional LINE notification for upcoming/overdue contract renewals.
// Uses the LINE Messaging API "push message" endpoint.
// Disabled unless LINE_CHANNEL_ACCESS_TOKEN and LINE_TARGET_ID are set in the environment.

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_TARGET_ID = process.env.LINE_TARGET_ID; // userId, groupId, or roomId

async function sendLineMessage(text) {
  if (!LINE_TOKEN || !LINE_TARGET_ID) {
    console.log('[LINE notify skipped - not configured]', text);
    return { skipped: true };
  }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({
      to: LINE_TARGET_ID,
      messages: [{ type: 'text', text }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }
  return { sent: true };
}

module.exports = { sendLineMessage };
