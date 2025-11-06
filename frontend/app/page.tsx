'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { requestNonce, verifySignature, saveToken, loadToken } from '../lib/api';

/* ====== CONFIG ====== */
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (typeof window !== 'undefined'
    ? window.location.origin.replace(':3000', ':8000')
    : 'http://localhost:8000');

const WS_URL = () => BACKEND_URL.replace('http', 'ws') + '/ws/pnl';

/* ====== TYPES ====== */
type Market = {
  id: number;
  name: string;
  external_id: string;
  base_spread_bps: number;
  enabled: boolean;
};

type TickMsg = { type: 'pnl_tick'; market_id: number; pnl: number; inventory?: number };

/* ====== PAGE ====== */
export default function DashboardPage() {
  const [backendOk, setBackendOk] = useState<'checking' | 'ok' | 'down'>('checking');
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const lastTickRef = useRef<Map<number, number>>(new Map());
  const [pnlByMarket, setPnlByMarket] = useState<Map<number, { ts: number; pnl: number }[]>>(new Map());
  const [logByMarket, setLogByMarket] = useState<Map<number, string[]>>(new Map());

  // check backend
  useEffect(() => {
    fetch(BACKEND_URL + '/health')
      .then((r) => {
        if (r.ok) setBackendOk('ok');
        else setBackendOk('down');
      })
      .catch(() => setBackendOk('down'));
  }, []);

  // load markets periodically
  useEffect(() => {
    const load = () => {
      fetch(BACKEND_URL + '/markets')
        .then((r) => r.json())
        .then((data) => {
          setMarkets(data);
          if (!selectedMarketId && data.length > 0) {
            setSelectedMarketId(data[0].id);
          }
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  // websocket -> live pnl
  useEffect(() => {
    const url = WS_URL();
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(url);
      ws.onopen = () => setWsStatus('open');
      ws.onerror = () => setWsStatus('error');
      ws.onclose = () => setWsStatus('closed');
      ws.onmessage = (ev) => {
        try {
          const msg: TickMsg = JSON.parse(ev.data);
          if (msg?.type === 'pnl_tick') {
            lastTickRef.current.set(msg.market_id, Date.now());
            const ts = Date.now();
            setPnlByMarket((prev) => {
              const next = new Map(prev);
              const arr = next.get(msg.market_id) || [];
              arr.push({ ts, pnl: msg.pnl });
              next.set(msg.market_id, arr.slice(-80));
              return next;
            });
            setLogByMarket((prev) => {
              const next = new Map(prev);
              const arr = next.get(msg.market_id) || [];
              const line = `Tick  pnl=${msg.pnl.toFixed(4)} inv=${(msg.inventory ?? 0).toFixed(4)} @ ${new Date(ts).toLocaleTimeString()}`;
              arr.push(line);
              next.set(msg.market_id, arr.slice(-100));
              return next;
            });
          }
        } catch {
          // ignore
        }
      };
    } catch {
      setWsStatus('error');
    }
    return () => ws?.close();
  }, []);

  // active ids = last tick < 5s
  const activeIds = useMemo(() => {
    const ids = new Set<number>();
    const now = Date.now();
    for (const [mid, ts] of lastTickRef.current.entries()) {
      if (now - ts < 5000) ids.add(mid);
    }
    return ids;
  }, [markets, wsStatus, pnlByMarket]);

  const selectedSeries = useMemo(() => {
    if (!selectedMarketId) return [] as { ts: number; pnl: number }[];
    return pnlByMarket.get(selectedMarketId) || [];
  }, [pnlByMarket, selectedMarketId]);

  const handleStart = async (id: number) => {
    setLoadingId(id);
    try {
      const token = loadToken();
      const res = await fetch(`${BACKEND_URL}/markets/${id}/start`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('start failed');
      lastTickRef.current.set(id, Date.now());
      setToast(`Started market #${id}`);
    } catch {
      setToast(`Failed to start market #${id}`);
    } finally {
      setLoadingId(null);
    }
  };

  const handleStop = async (id: number) => {
    setLoadingId(id);
    try {
      const token = loadToken();
      const res = await fetch(`${BACKEND_URL}/markets/${id}/stop`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('stop failed');
      lastTickRef.current.delete(id);
      setToast(`Stopped market #${id}`);
    } catch {
      setToast(`Failed to stop market #${id}`);
    } finally {
      setLoadingId(null);
    }
  };

  // wallet connect (MetaMask)
  const handleConnectWallet = async () => {
    try {
      if (walletAddr) {
        setWalletAddr(null);
        saveToken('');
        return;
      }
      const eth = (window as any).ethereum;
      if (!eth) {
        setToast('MetaMask not found');
        return;
      }
      const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
      const addr = accounts[0];
      const n = await requestNonce(addr);
      const signature: string = await eth.request({ method: 'personal_sign', params: [n.message, addr] });
      const v = await verifySignature(addr, signature);
      if (v?.token) {
        saveToken(v.token);
        setWalletAddr(addr);
        setToast('Wallet connected');
      } else {
        setToast('Auth failed');
      }
    } catch {
      setToast('Wallet connection failed');
    }
  };

  return (
    <div className="main">
      {/* top bar */}
      <header className="topbar">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="topbar-title">Polymarket MM Dashboard</span>
          <span className={`tag ${backendOk === 'ok' ? 'tag-ok' : backendOk === 'checking' ? 'tag-checking' : 'tag-down'}`}>
            Backend: {backendOk}
          </span>
          <span className={`tag ${wsStatus === 'open' ? 'tag-ws-open' : 'tag-ws-other'}`} style={{ marginLeft: 8 }}>
            WS: {wsStatus}
          </span>
        </div>
        <div>
          {walletAddr ? (
            <button className="btn btn-primary" onClick={handleConnectWallet}>
              {walletAddr.slice(0, 6)}...{walletAddr.slice(-4)}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleConnectWallet}>Connect wallet</button>
          )}
        </div>
      </header>

      {/* main grid */}
      <div className="main-grid">
        {/* left: markets */}
        <section className="card">
          <div className="card-header">
            <h2 style={{ fontWeight: 600 }}>Markets</h2>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{markets.length} total</span>
          </div>
          <div className="market-list">
            {markets.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, padding: 24 }}>No markets yet</p>
            ) : (
              <ul>
                {markets.map((m) => {
                  const isActive = activeIds.has(m.id);
                  const isBusy = loadingId === m.id;
                  return (
                    <li key={m.id} className="market-row" onClick={() => setSelectedMarketId(m.id)} style={{ cursor: 'pointer' }}>
                      <div>
                        <p className="market-title">
                          {m.name} {selectedMarketId === m.id ? <span className="badge" style={{ marginLeft: 6 }}>Selected</span> : null}
                          {isActive ? (
                            <span className="badge badge-active">Active</span>
                          ) : (
                            <span className="badge badge-idle">Idle</span>
                          )}
                        </p>
                        <p className="market-sub">
                          {m.external_id} • spread: {m.base_spread_bps}bps
                        </p>
                      </div>
                      <div className="actions">
                        <button
                          className="btn btn-success btn-mini"
                          onClick={() => handleStart(m.id)}
                          disabled={isActive || isBusy}
                        >
                          {isBusy ? '...' : 'Start'}
                        </button>
                        <button
                          className="btn btn-secondary btn-mini"
                          onClick={() => handleStop(m.id)}
                          disabled={!isActive || isBusy}
                        >
                          Stop
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* center: chart + metrics */}
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 16 }}>
          <div className="card-body" style={{ paddingBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h2 style={{ fontWeight: 600 }}>Live PnL</h2>
                <span className="tag">{selectedMarketId ? `Market #${selectedMarketId}` : 'No market selected'}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {selectedSeries.length ? `${selectedSeries[selectedSeries.length - 1].pnl.toFixed(4)} USDC` : '—'}
              </span>
            </div>
            <div className="sparkline-box">
              {selectedSeries.length === 0 ? (
                <p className="sparkline-empty">Waiting for ticks…</p>
              ) : (
                <div>
                  <Sparkline data={selectedSeries.map((p) => p.pnl)} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
                    <span>Older</span>
                    <span>Newer</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card-body" style={{ paddingTop: 0 }}>
            <h2 style={{ fontWeight: 600, marginBottom: 8 }}>Summary</h2>
            <div className="stats">
              <Stat label="Active markets" value={activeIds.size.toString()} />
              <Stat label="Total markets" value={markets.length.toString()} />
              <Stat label="Wallet" value={walletAddr ? 'Connected' : 'Not connected'} />
            </div>
          </div>
        </section>

        {/* right: log */}
        <section className="card log-panel">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h2 style={{ fontWeight: 600 }}>Live log</h2>
              <span className="tag">{selectedMarketId ? `Market #${selectedMarketId}` : 'No market selected'}</span>
            </div>
          </div>
          <LiveLogPanel selectedMarketId={selectedMarketId} logByMarket={logByMarket} />
        </section>
      </div>

      {/* toast */}
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}

      {/* no modal; real wallet connect above */}
    </div>
  );
}

/* ====== components (local to page) ====== */

function Sparkline({ data }: { data: number[] }) {
  const w = 520;
  const h = 160;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / Math.max(1, data.length - 1)) * (w - 10) + 5;
      const y = h - ((v - min) / range) * (h - 20) - 10;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg className="sparkline" width={w} height={h} role="img" aria-label="pnl trend">
      <polyline fill="none" strokeWidth="2.5" points={points} />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}

function LiveLogPanel({ selectedMarketId, logByMarket }: { selectedMarketId: number | null; logByMarket: Map<number, string[]> }) {
  const lines = useMemo(() => (selectedMarketId ? logByMarket.get(selectedMarketId) || [] : []), [selectedMarketId, logByMarket]);
  return (
    <div className="log-body">
      {(!selectedMarketId || lines.length === 0) ? (
        <p className="log-empty">{selectedMarketId ? 'Waiting for messages…' : 'Select a market to view logs'}</p>
      ) : (
        lines.slice().reverse().map((l, i) => <div key={i} style={{ marginBottom: 6 }}>{l}</div>)
      )}
    </div>
  );
}
