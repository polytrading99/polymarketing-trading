
export const BACKEND_URL = () => process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
export const WS_URL = () => (BACKEND_URL().replace('http','ws') + '/ws/pnl');

const fetcher = async (path: string, init?: RequestInit) => {
  const res = await fetch(BACKEND_URL() + path, { ...init, cache: 'no-store' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export const listMarkets = () => fetcher('/markets');
export const createMarket = (payload: any) => fetcher('/markets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
export const startMarket = (id: number) => fetcher(`/markets/${id}/start`, { method: 'POST' });
export const stopMarket = (id: number) => fetcher(`/markets/${id}/stop`, { method: 'POST' });
export const getPnl = (id: number) => fetcher(`/pnl/${id}`);
