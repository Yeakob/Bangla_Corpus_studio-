// Thin fetch wrapper. API base defaults to same origin (/api), proxied in dev.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const getToken = () => localStorage.getItem('cs_token');
export const setToken = (t) => (t ? localStorage.setItem('cs_token', t) : localStorage.removeItem('cs_token'));

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', json, form, blob = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) body = form;

  const res = await fetch(`${API_BASE}/api${path}`, { method, headers, body });
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    window.dispatchEvent(new Event('cs-logout'));
  }
  if (!res.ok) {
    let data = {};
    try {
      data = await res.json();
    } catch {}
    const detail = Array.isArray(data.details) ? data.details.map((d) => `${d.path?.join('.')}: ${d.message}`).join('; ') : '';
    throw new ApiError(res.status, [data.error || res.statusText, detail].filter(Boolean).join(' — '), data.details);
  }
  if (blob) return res;
  return res.status === 204 ? null : res.json();
}

/** URL for <audio>/<img> tags that need the session token. */
export const mediaUrl = (path) => `${API_BASE}/api${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(getToken() || '')}`;

export const fmtDuration = (sec = 0) => {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};
