const API_BASE = import.meta.env.VITE_API_URL || '';

async function apiFetch(path, options = {}, retries = 1) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const apiKey = options?.headers?.['X-API-Key'] || localStorage.getItem('fw_api_key');
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  
  const token = localStorage.getItem('fw_jwt');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, { ...options, headers, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw { status: response.status, ...error };
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw { status: 408, error: 'Request timeout' };
    }
    // Retry on network errors or 5xx
    if ((!error.status || error.status >= 500) && retries > 0) {
      console.warn(`Retrying API call to ${path}...`);
      await new Promise(r => setTimeout(r, 1000));
      return apiFetch(path, options, retries - 1);
    }
    throw error;
  }
}

export const api = {
  // Check endpoints
  check: (prompt, threshold, app_context, custom_canary, keyId = null) =>
    apiFetch('/v1/check', {
      method: 'POST',
      body: JSON.stringify({ prompt, threshold, app_context, custom_canary }),
      headers: keyId ? { 'X-Dashboard-Key-ID': keyId } : {}
    }),

  checkBatch: (prompts) =>
    apiFetch('/v1/check/batch', {
      method: 'POST',
      body: JSON.stringify({ prompts }),
    }),

  // Dashboard
  getStats: () => apiFetch('/v1/stats'),
  getGraphStats: () => apiFetch('/v1/graph/stats'),

  getLogs: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query.set(key, val);
      }
    });
    return apiFetch(`/v1/logs?${query.toString()}`);
  },

  getLogDetail: (requestId) => apiFetch(`/v1/logs/${requestId}`),

  // Keys
  createKey: (name, app_context, custom_canary, custom_intent_examples, use_openai_moderation) =>
    apiFetch('/v1/keys', {
      method: 'POST',
      body: JSON.stringify({ name, app_context, custom_canary, custom_intent_examples, use_openai_moderation }),
    }),

  listKeys: () => apiFetch('/v1/keys'),

  revokeKey: (keyId) =>
    apiFetch(`/v1/keys/${keyId}`, { method: 'DELETE' }),

  // Auth
  login: (email, password) =>
    apiFetch('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  signup: (email, password) =>
    apiFetch('/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => apiFetch('/v1/auth/me'),

  // Health
  health: () => apiFetch('/health'),
};
