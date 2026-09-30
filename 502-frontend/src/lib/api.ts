import axios, { type AxiosResponse } from 'axios';

let accessToken: string | null = null;
// When the login expires (ms): the server makes every session end 24 hours after login.
let sessionExpiresAt: number | null = null;
const sessionListeners = new Set<(expiresAt: number | null) => void>();
const expiredListeners = new Set<() => void>();

// Keeps the access token (in memory only) and when its session ends.
export const setSession = (token: string | null, expiresAt?: string | null) => {
  accessToken = token;
  sessionExpiresAt = token && expiresAt ? Date.parse(expiresAt) : null;
  sessionListeners.forEach((listener) => listener(sessionExpiresAt));
};

export const getSessionExpiresAt = () => sessionExpiresAt;

// The current access token (memory only), for the WebSocket's auth message.
export const getAccessToken = () => accessToken;

// Called whenever the session changes (login, renewal, logout) with its end time.
export function onSessionChange(listener: (expiresAt: number | null) => void) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

// Called when the session could not be renewed (expired, password changed, account locked).
export function onSessionExpired(listener: () => void) {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}

// Errors of requests that failed because the session ended: the auth provider
// already tells the user, so pages need not toast them.
const sessionErrors = new WeakSet<object>();
export const isSessionEnded = (error: unknown) =>
  typeof error === 'object' && error !== null && sessionErrors.has(error);

// A 401 from these means wrong credentials or no session, never a stale access token.
const NO_REFRESH = ['/auth/login', '/auth/refresh', '/auth/logout'];

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach Access Token
api.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 & Refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't tried to refresh yet
    // AND the failed request was NOT a login/refresh attempt itself
    const url: string = originalRequest?.url ?? '';
    if (error.response?.status === 401 && !originalRequest._retry && !NO_REFRESH.some((path) => url.includes(path))) {
      originalRequest._retry = true;

      try {
        // Call refresh endpoint (cookies are sent automatically)
        const response = await api.post('/auth/refresh');
        const { access_token, sessionExpiresAt: expiresAt } = response.data;

        // Update memory token
        setSession(access_token, expiresAt);

        // Update header for the retried request
        originalRequest.headers.Authorization = `Bearer ${access_token}`;

        // Retry original request
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed (session expired or revoked): the user must log in again.
        setSession(null);
        if (typeof refreshError === "object" && refreshError) sessionErrors.add(refreshError);
        expiredListeners.forEach((listener) => listener());
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Message from a failed API call (backend messages are Vietnamese).
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(message)) return message.join(", ");
    if (message) return message;
  }
  return fallback;
}

// How many rows a capped list matched in all (X-Total-Count; the body holds
// only the newest ones), or null when the server did not say.
export function totalCountOf(res: AxiosResponse): number | null {
  const header = res.headers['x-total-count'];
  const total = Number(header);
  return header == null || !Number.isFinite(total) ? null : total;
}

export default api;
