'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { CreateMarketForm } from '../components/CreateMarketForm';
import { apiFetcher, createMarket, listMarkets, requestNonce, verifySignature, saveToken, loadToken } from '../lib/api';

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
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const lastTickRef = useRef<Map<number, number>>(new Map());
  const [pnlByMarket, setPnlByMarket] = useState<Map<number, { ts: number; pnl: number }[]>>(new Map());
  const [logByMarket, setLogByMarket] = useState<Map<number, string[]>>(new Map());

  const { data: healthData, error: healthError } = useSWR('/health', apiFetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: true,
  });
  const backendStatus: 'checking' | 'ok' | 'down' = healthError ? 'down' : healthData ? 'ok' : 'checking';

  const {
    data: marketsData,
    error: marketsError,
    mutate: mutateMarkets,
  } = useSWR<Market[]>('/markets', () => listMarkets(), {
    revalidateOnFocus: false,
    refreshInterval: 10000,
    dedupingInterval: 5000,
  });

  const marketsLoading = !marketsData && !marketsError;
  const markets = marketsData ?? [];

  useEffect(() => {
    if (markets.length === 0) {
      setSelectedMarketId(null);
      return;
    }
    if (!selectedMarketId) {
      setSelectedMarketId(markets[0].id);
      return;
    }
    if (!markets.some((m) => m.id === selectedMarketId)) {
      setSelectedMarketId(markets[0].id);
    }
  }, [markets, selectedMarketId]);

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

  const marketsCountLabel = marketsLoading ? 'Loading…' : `${markets.length} total`;
  const activeMarketsValue = marketsLoading ? '…' : activeIds.size.toString();
  const totalMarketsValue = marketsLoading ? '…' : markets.length.toString();

  const handleCreateMarket = async (payload: { name: string; external_id: string; base_spread_bps: number; enabled: boolean }) => {
    setCreateError(null);
    try {
      await createMarket(payload);
      await mutateMarkets();
      setToast(`Created market "${payload.name}"`);
      setIsCreateOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create market';
      setCreateError(message);
      throw err;
    }
  };

  const handleStart = async (id: number) => {
    setLoadingId(id);
    try {
      const token = loadToken();
      const res = await fetch(`${BACKEND_URL}/markets/${id}/start`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const detail = (await res.text()) || 'Failed to start market';
        throw new Error(detail);
      }
      lastTickRef.current.set(id, Date.now());
      await mutateMarkets();
      setToast(`Started market #${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to start market #${id}`;
      setToast(message);
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
      if (!res.ok) {
        const detail = (await res.text()) || 'Failed to stop market';
        throw new Error(detail);
      }
      lastTickRef.current.delete(id);
      await mutateMarkets();
      setToast(`Stopped market #${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to stop market #${id}`;
      setToast(message);
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
          <span className={`tag ${backendStatus === 'ok' ? 'tag-ok' : backendStatus === 'checking' ? 'tag-checking' : 'tag-down'}`}>
            Backend: {backendStatus}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{marketsCountLabel}</span>
              <button className="btn btn-ghost btn-mini" onClick={() => { setCreateError(null); setIsCreateOpen(true); }}>
                Create market
              </button>
            </div>
          </div>
          <div className="market-list">
            {marketsLoading ? (
              <p className="state-message loading">Loading markets…</p>
            ) : marketsError ? (
              <div className="state-message error">
                Failed to load markets.
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-ghost btn-mini" onClick={() => mutateMarkets()}>
                    Retry
                  </button>
                </div>
              </div>
            ) : markets.length === 0 ? (
              <p className="state-message">No markets yet</p>
            ) : (
              <ul>
                {markets.map((m) => {
                  const isActive = activeIds.has(m.id);
                  const isBusy = loadingId === m.id;
                  const isSelected = selectedMarketId === m.id;
                  const rowClass = [
                    'market-row',
                    isSelected ? 'market-row-selected' : '',
                    isActive ? 'market-row-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <li
                      key={m.id}
                      className={rowClass}
                      onClick={() => setSelectedMarketId(m.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <p className="market-title">
                          {m.name} {isSelected ? <span className="badge" style={{ marginLeft: 6 }}>Selected</span> : null}
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
              <Stat label="Active markets" value={activeMarketsValue} />
              <Stat label="Total markets" value={totalMarketsValue} />
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

      {isCreateOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>New market</h3>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 10 }}>Fill out the details to add a new market.</p>
            {createError ? <p className="state-message error" style={{ padding: '12px 8px' }}>{createError}</p> : null}
            <CreateMarketForm
              onCreate={async (payload) => {
                try {
                  await handleCreateMarket(payload);
                } catch {
                  // CreateMarketForm already showing busy state; we keep modal open.
                }
              }}
            />
            <button className="cancel" onClick={() => setIsCreateOpen(false)} style={{ marginTop: 12 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ====== components (local to page) ====== */

function Sparkline({ data }: { data: number[] }) {
  const values = data.slice(-120);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gradientIdRef = useRef(`sparklineGradient-${Math.random().toString(36).slice(2)}`);
  const [width, setWidth] = useState(520);
  const height = 300;
  const paddingX = 16;
  const paddingY = 16;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextWidth = Math.max(200, Math.floor(entry.contentRect.width));
        setWidth(nextWidth);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (values.length === 0) {
    return (
      <div ref={containerRef} className="sparkline-container">
        <p className="sparkline-empty">Waiting for ticks…</p>
      </div>
    );
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const sameValue = max === min;
  const range = sameValue ? 1 : max - min;
  const innerWidth = Math.max(1, width - paddingX * 2);
  const innerHeight = Math.max(1, height - paddingY * 2);

  const points = values.map((value, idx) => {
    const normalized = sameValue ? 0.5 : (value - min) / range;
    const x = paddingX + (idx / Math.max(1, values.length - 1)) * innerWidth;
    const y = height - paddingY - normalized * innerHeight;
    return { x, y, value };
  });

  const linePath = points
    .map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  const areaPath =
    points.length > 1
      ? [
          `M ${points[0].x} ${height - paddingY}`,
          ...points.map((point) => `L ${point.x} ${point.y}`),
          `L ${points[points.length - 1].x} ${height - paddingY}`,
          'Z',
        ].join(' ')
      : '';

  const baselineY =
    min < 0 && max > 0
      ? (() => {
          const normalized = (0 - min) / range;
          const y = height - paddingY - normalized * innerHeight;
          return Math.min(height - paddingY, Math.max(paddingY, y));
        })()
      : null;

  const last = values[values.length - 1];
  const first = values[0];
  const change = last - first;
  const changePct = first !== 0 ? (change / Math.abs(first)) * 100 : null;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const formatValue = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatDelta = (value: number) => {
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${Math.abs(value).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatPercent = (value: number | null) =>
    value === null
      ? '—'
      : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}%`;

  const gradientId = gradientIdRef.current;
  const lastPoint = points[points.length - 1];

  return (
    <div ref={containerRef} className="sparkline-container">
      <div className="sparkline-header">
        <div className="sparkline-metric">
          <span>Last</span>
          <strong>{formatValue(last)}</strong>
        </div>
        <div className={`sparkline-metric ${change > 0 ? 'positive' : change < 0 ? 'negative' : ''}`}>
          <span>Change</span>
          <strong>{formatDelta(change)}</strong>
          <small>{formatPercent(changePct)}</small>
        </div>
        <div className="sparkline-metric">
          <span>High</span>
          <strong>{formatValue(maxValue)}</strong>
        </div>
        <div className="sparkline-metric">
          <span>Low</span>
          <strong>{formatValue(minValue)}</strong>
        </div>
      </div>
      <svg className="sparkline-svg" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="PnL trend">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaPath && <path d={areaPath} className="area-fill" fill={`url(#${gradientId})`} />}
        {baselineY !== null ? (
          <line x1={paddingX} x2={width - paddingX} y1={baselineY} y2={baselineY} className="baseline" />
        ) : null}
        <path d={linePath} className="line" />
        {lastPoint ? <circle className="sparkline-point" cx={lastPoint.x} cy={lastPoint.y} r={4} /> : null}
      </svg>
    </div>
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
