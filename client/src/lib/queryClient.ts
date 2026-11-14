import { QueryClient, QueryFunction } from "@tanstack/react-query";

/*
 * API client for the website. The server authenticates every signed-in call with the same
 * Bearer JWT the mobile apps send (server/auth.ts authMiddleware) — it has no cookie session,
 * so a cookie-only request always gets 401 "No token provided".
 *
 * The session lives in localStorage under "userProfile" as { ...user, token } — the same key
 * the run-video page and the admin pages read their token from.
 */

const SESSION_KEY = "userProfile";

export type StoredSession = { id: string; token: string; name?: string; email?: string; isAdmin?: boolean };

export function getSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return getSession()?.token ?? null;
}

export function saveSession(user: Record<string, any>, token: string) {
  // Profile pictures are base64 blobs (often >100 KB): never keep them in localStorage.
  const { profilePic: _pic, password: _pw, fcmToken: _fcm, ...rest } = user ?? {};
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...rest, token }));
  } catch {
    /* storage unavailable: the session just won't survive a reload */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, message: string, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export function onUnauthorized(fn: Listener) {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
}

async function toError(res: Response): Promise<ApiError> {
  let body: any = null;
  let message = res.statusText || `Request failed (${res.status})`;
  try {
    const text = await res.text();
    try {
      body = JSON.parse(text);
      message = body?.message || body?.error || message;
    } catch {
      if (text && text.length < 300) message = text;
    }
  } catch {
    /* ignore */
  }
  return new ApiError(res.status, message, body);
}

/** fetch with the Bearer token. Never uses the HTTP cache: the server marks GETs cacheable. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-App-Platform", "web");
  const res = await fetch(url, { cache: "no-store", ...init, headers });
  if (res.status === 401 && token) {
    // Only a rejected token signs the user out; endpoints with no token simply fail.
    const err = await toError(res.clone());
    if (/token|expired|not found/i.test(err.message)) unauthorizedListeners.forEach((fn) => fn());
  }
  return res;
}

export async function api<T = any>(method: string, url: string, data?: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method,
    headers: data !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/** Kept for existing callers (Support, admin pages): resolves to the raw Response, throws on !ok. */
export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const res = await apiFetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) throw await toError(res);
  return res;
}

const defaultQueryFn: QueryFunction = async ({ queryKey }) => {
  const url = queryKey.filter((k) => typeof k === "string" || typeof k === "number").join("/");
  return api("GET", url);
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: (count, err: any) => count < 1 && !(err instanceof ApiError && err.status < 500),
    },
    mutations: { retry: false },
  },
});
