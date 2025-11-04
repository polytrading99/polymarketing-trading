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
  const res = await fetch(url, { ...init, cache: "no-store" });
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
