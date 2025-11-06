// frontend/lib/api.ts

// figure out backend at runtime, but prefer NEXT_PUBLIC_BACKEND_URL
export const BACKEND_URL = () => {
  // 1) build-time / docker env
  if (process.env.NEXT_PUBLIC_BACKEND_URL) {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }

  // 2) browser runtime (VPS, different host)
  if (typeof window !== "undefined") {
    // e.g. http://51.38.126.98:3000 -> http://51.38.126.98:8000
    const origin = window.location.origin; // http://host:3000
    return origin.replace(":3000", ":8000");
  }

  // 3) fallback for SSR/dev
  return "http://localhost:8000";
};

// build WS endpoint from backend
export const WS_URL = () => {
  const http = BACKEND_URL();
  return http.replace("http", "ws") + "/ws/pnl";
};

// a tiny fetch wrapper that never adds a trailing slash
const fetcher = async (path: string, init?: RequestInit) => {
  const base = BACKEND_URL().replace(/\/+$/, "");
  const url = base + path;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("mm_jwt") : null;
    if (token && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  } catch {}

  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    console.error("API error", res.status, url, text);
    throw new Error(text || `Request failed: ${res.status} ${url}`);
  }
  // some endpoints might return 204
  if (res.status === 204) {
    return { ok: true };
  }
  return res.json();
};

// APIs
export const listMarkets = () => fetcher("/markets");
export const createMarket = (payload: any) =>
  fetcher("/markets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
export const startMarket = (id: number) =>
  fetcher(`/markets/${id}/start`, { method: "POST" });
export const stopMarket = (id: number) =>
  fetcher(`/markets/${id}/stop`, { method: "POST" });
export const getPnl = (id: number) => fetcher(`/pnl/${id}`);

// Auth helpers
export const requestNonce = (address: string) =>
  fetcher(`/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });

export const verifySignature = (address: string, signature: string) =>
  fetcher(`/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signature }),
  });

export const saveToken = (token: string) => {
  if (typeof window !== "undefined") localStorage.setItem("mm_jwt", token);
};

export const loadToken = (): string | null => {
  try {
    return typeof window !== "undefined" ? localStorage.getItem("mm_jwt") : null;
  } catch {
    return null;
  }
};
