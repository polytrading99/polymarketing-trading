
export const BACKEND_URL = () => '';
export const WS_URL = () => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  return origin.replace('http', 'ws') + '/api/ws/pnl';
};

const fetcher = async (path: string, init?: RequestInit) => {
  const res = await fetch('/api' + path, { ...init, cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export const listMarkets = () => fetcher('/markets');
export const createMarket = (payload: any) => fetcher('/markets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
export const startMarket = (id: number) => fetcher(`/markets/${id}/start`, { method: 'POST' });
export const stopMarket = (id: number) => fetcher(`/markets/${id}/stop`, { method: 'POST' });
export const getPnl = (id: number) => fetcher(`/pnl/${id}`);
