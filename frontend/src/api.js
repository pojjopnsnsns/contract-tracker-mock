const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

// A 401 anywhere means the session is gone (expired, logged out elsewhere, or
// never existed). Any part of the app can subscribe to be told about this so
// it can drop back to the login screen instead of showing a broken error.
let onUnauthorized = null;
function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // send/receive the session cookie across origins
    ...options,
  });
  if (res.status === 401) {
    onUnauthorized?.();
    const body = await res.json().catch(() => ({}));
    throw new ApiError(401, body.error || 'Login required');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || `API error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  setUnauthorizedHandler,

  login: (username, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),

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
