const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listContracts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/contracts${qs ? `?${qs}` : ''}`);
  },
  getContract: (id) => request(`/api/contracts/${id}`),
  createContract: (data) => request('/api/contracts', { method: 'POST', body: JSON.stringify(data) }),
  updateContract: (id, data) => request(`/api/contracts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteContract: (id) => request(`/api/contracts/${id}`, { method: 'DELETE' }),
  getAlerts: () => request('/api/alerts'),
  getSummary: () => request('/api/summary'),
  getStatusValues: () => request('/api/meta/status-values'),
  runNotifyNow: () => request('/api/notify/run-now', { method: 'POST' }),

  listNotifications: () => request('/api/notifications'),
  unseenCount: () => request('/api/notifications/unseen-count'),
  markSeen: (id) => request(`/api/notifications/${id}/seen`, { method: 'POST' }),
  markAllSeen: () => request('/api/notifications/mark-all-seen', { method: 'POST' }),
};
