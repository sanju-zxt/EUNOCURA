// API configuration
//
// The base URL is resolved at call time, not import time, because the same
// bundle runs in three places with three different notions of "the backend":
//
//   1. a desktop browser on the dev server        -> same host, port 8000
//   2. the Android shell                          -> the deployed API
//   3. the Android shell against this machine     -> the emulator's 10.0.2.2, or
//                                                    `adb reverse` + 127.0.0.1
//
// (2) is the default because a shipped APK cannot reach a laptop: the phone has
// no idea where `localhost` is, and the dev machine is usually not even on. So a
// release build points at the hosted backend and works out of the box.
//
// (3) is why there is still a runtime override: developing against a local
// backend must not require a rebuild. The Settings sheet writes it to
// localStorage so a restart keeps it.
const STORAGE_KEY_BASE = 'eunocura.api_base';
const STORAGE_KEY_URLS = 'eunocura.allow_http';

/** The hosted API. What the packaged app talks to when nothing overrides it. */
export const PRODUCTION_API_BASE_URL = 'https://eunocura-backend.vercel.app';

/** True when this bundle is running inside the Capacitor Android/iOS shell. */
export const isNativePlatform = () => {
  try {
    return Boolean(
      typeof window !== 'undefined' &&
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === 'function' &&
        window.Capacitor.isNativePlatform()
    );
  } catch {
    return false;
  }
};

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

/** The URL the app falls back to when the user has never set one. */
export const getDefaultApiBaseUrl = () => {
  const fromEnv = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL);
  const isLoopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(fromEnv || '');

  if (isNativePlatform()) {
    // A build-time env value pointing at loopback is correct for the browser and
    // meaningless inside the app (on a phone, 127.0.0.1 *is* the phone), so it is
    // ignored here. Otherwise: the deployed API, which is the only address a
    // shipped APK can reach. Working against a local backend, or the emulator's
    // host loopback (10.0.2.2), is what the Settings sheet's override is for.
    if (fromEnv && !isLoopback) return fromEnv;
    return PRODUCTION_API_BASE_URL;
  }

  if (fromEnv) return fromEnv;

  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location;
    // Opening the Vite dev server from a phone already puts the laptop's IP in
    // the address bar, so reuse it instead of hardcoding localhost.
    if (hostname) return `${protocol}//${hostname}:8000`;
  }

  return 'http://localhost:8000';
};

/** The base URL currently in effect (override > env > platform default). */
export const getApiBaseUrl = () => {
  try {
    const override = trimTrailingSlash(window.localStorage.getItem(STORAGE_KEY_BASE));
    if (override) return override;
  } catch {
    // Private-mode / disabled storage: fall through to the default.
  }
  return getDefaultApiBaseUrl();
};

/**
 * Persist a manual overrides. Passing an empty string clears it.
 * Returns the value now in effect so callers can confirm what stuck.
 */
export const setApiBaseUrl = (value) => {
  const clean = trimTrailingSlash(String(value || '').trim());
  try {
    if (clean) window.localStorage.setItem(STORAGE_KEY_BASE, clean);
    else window.localStorage.removeItem(STORAGE_KEY_BASE);
  } catch {
    // Nothing to do; getApiBaseUrl still works from the environment.
  }
  return getApiBaseUrl();
};

export const getApiBaseUrlOverride = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY_BASE) || '';
  } catch {
    return '';
  }
};

/**
 * Turn a URL the backend handed us into one this device can actually open.
 *
 * The storage layer builds absolute URLs from its own `public_base_url`
 * (http://localhost:8000), which is meaningless from a phone. Anything that
 * points at localhost / 127.0.0.1 is re-pointed at the configured base; real
 * external URLs are left alone.
 */
export const resolveAssetUrl = (url) => {
  if (!url) return url;
  const raw = String(url);
  const match = raw.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i);
  if (!match) return raw;
  return `${getApiBaseUrl()}${match[3] || ''}`;
};

/** True when the target is plain HTTP, which Android blocks by default. */
export const isPlainHttp = (value) => /^http:\/\//i.test(String(value || ''));

/**
 * Get the stored access token
 */
export const getToken = () => {
  return localStorage.getItem('access_token');
};

/**
 * Set the access token
 */
export const setToken = (token) => {
  localStorage.setItem('access_token', token);
};

/**
 * Remove the access token
 */
export const removeToken = () => {
  localStorage.removeItem('access_token');
};

/**
 * Make an API request with authentication
 */
export const apiRequest = async (endpoint, options = {}) => {
  const token = getToken();
  const base = getApiBaseUrl();
  const url = `${base}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);

    // Check if response has JSON content
    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { detail: text || `HTTP error! status: ${response.status}` };
    }

    if (!response.ok) {
      throw new Error(data.detail || `HTTP error! status: ${response.status}`);
    }

    return { success: true, data };
  } catch (error) {
    // Handle network errors or JSON parsing errors
    if (error.name === 'TypeError') {
      return {
        success: false,
        network: true,
        error: `Cannot reach the server at ${base}. ${
          isNativePlatform()
            ? 'Check the API address in Settings (the phone must see the same network as the laptop).'
            : 'Please check if the backend server is running.'
        }`,
      };
    }
    return {
      success: false,
      error: error.message || 'An error occurred while making the request',
    };
  }
};

/**
 * Cheap reachability probe used by the settings sheet and the offline banner.
 */
export const pingApi = async (baseUrl) => {
  const base = trimTrailingSlash(baseUrl === undefined ? getApiBaseUrl() : baseUrl);
  const started = Date.now();
  try {
    const response = await fetch(`${base}/healthz`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
      base,
      body,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      base,
      body: null,
      error: error?.message || 'Network unreachable',
    };
  }
};

/**
 * Deprecated: a copy of the base URL frozen at import time. Nothing imports it
 * any more — use `getApiBaseUrl()`, which respects the runtime override and the
 * native default. Kept only so an out-of-tree consumer cannot crash on a
 * missing export.
 */
export const API_BASE_URL = getDefaultApiBaseUrl();

/**
 * Citation audit API function
 */
export const auditCitations = async (file, question = '') => {
  const token = getToken();
  const url = `${getApiBaseUrl()}/citations/audit`;

  const formData = new FormData();
  formData.append('file', file);
  if (question) {
    formData.append('question', question);
  }

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: headers,
    });

    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { detail: text || `HTTP error! status: ${response.status}` };
    }

    if (!response.ok) {
      throw new Error(data.detail || `HTTP error! status: ${response.status}`);
    }

    return { success: true, data };
  } catch (error) {
    if (error.name === 'TypeError') {
      return {
        success: false,
        network: true,
        error: `Cannot reach the server at ${getApiBaseUrl()}.`,
      };
    }
    return {
      success: false,
      error: error.message || 'An error occurred while making the request',
    };
  }
};

/**
 * Auth API functions
 */
export const authAPI = {
  // Login
  login: async (email, password) => {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  // Patient signup
  signupPatient: async (userData) => {
    return apiRequest('/auth/signup/patient', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  // Doctor signup
  signupDoctor: async (userData) => {
    return apiRequest('/auth/signup/doctor', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  // Get current user
  getCurrentUser: async () => {
    return apiRequest('/auth/me', {
      method: 'GET',
    });
  },
};
