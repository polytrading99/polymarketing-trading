'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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

type TickMsg = { type: 'pnl_tick'; market_id: number; pnl: number };

/* ====== PAGE ====== */
export default function DashboardPage() {
  const [backendOk, setBackendOk] = useState<'checking' | 'ok' | 'down'>('checking');
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const lastTickRef = useRef<Map<number, number>>(new Map());
  const [pnlPoints, setPnlPoints] = useState<{ ts: number; pnl: number }[]>([]);

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
        .then((data) => setMarkets(data))
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
            // push PnL to small chart
            setPnlPoints((prev) => {
              const next = [...prev, { ts: Date.now(), pnl: msg.pnl }];
              return next.slice(-40);
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
  }, [markets, wsStatus, pnlPoints]);

  const handleStart = async (id: number) => {
    setLoadingId(id);
    try {
      const res = await fetch(`${BACKEND_URL}/markets/${id}/start`, { method: 'POST' });
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
      const res = await fetch(`${BACKEND_URL}/markets/${id}/stop`, { method: 'POST' });
      if (!res.ok) throw new Error('stop failed');
      lastTickRef.current.delete(id);
      setToast(`Stopped market #${id}`);
    } catch {
      setToast(`Failed to stop market #${id}`);
    } finally {
      setLoadingId(null);
    }
  };

  // fake wallet connect
  const handleConnectWallet = () => {
    if (walletAddr) {
      setWalletAddr(null);
      return;
    }
    setWalletOpen(true);
  };

  const chooseWallet = (addr: string) => {
    setWalletAddr(addr);
    setWalletOpen(false);
    setToast('Wallet connected');
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
                    <li key={m.id} className="market-row">
                      <div>
                        <p className="market-title">
                          {m.name}
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
              <h2 style={{ fontWeight: 600 }}>Live PnL</h2>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {pnlPoints.length ? `${pnlPoints[pnlPoints.length - 1].pnl.toFixed(4)} USDC` : '—'}
              </span>
            </div>
            <div className="sparkline-box">
              {pnlPoints.length === 0 ? (
                <p className="sparkline-empty">Waiting for ticks…</p>
              ) : (
                <Sparkline data={pnlPoints.map((p) => p.pnl)} />
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
            <h2 style={{ fontWeight: 600 }}>Live log</h2>
          </div>
          <LiveLogPanel />
        </section>
      </div>

      {/* toast */}
      {toast && (
        <div className="toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}

      {/* wallet modal */}
      {walletOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Connect wallet</h3>
            <p>Select a wallet to simulate real trading.</p>
            <button className="wallet-option" onClick={() => chooseWallet('0xAB12...FA23')}>
              MetaMask (demo)
            </button>
            <button className="wallet-option" onClick={() => chooseWallet('0xDEAD...BEEF')}>
              WalletConnect (demo)
            </button>
            <button className="cancel" onClick={() => setWalletOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
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

function LiveLogPanel() {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    const ws = new WebSocket(WS_URL());
    ws.onopen = () => setLines((p) => [...p, 'WS connected']);
    ws.onmessage = (e) => setLines((p) => [...p, e.data]);
    ws.onerror = () => setLines((p) => [...p, 'WS error']);
    ws.onclose = () => setLines((p) => [...p, 'WS closed']);
    return () => ws.close();
  }, []);
  return (
    <div className="log-body">
      {lines.length === 0 ? (
        <p className="log-empty">Waiting for messages…</p>
      ) : (
        lines.map((l, i) => <div key={i} style={{ marginBottom: 6 }}>{l}</div>)
      )}
    </div>
  );
}
