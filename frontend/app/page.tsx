'use client';

import useSWR from 'swr';
import { useEffect, useMemo, useRef, useState } from 'react';
import { listMarkets, createMarket, startMarket, stopMarket, WS_URL } from '../lib/api';
import { CreateMarketForm } from '../components/CreateMarketForm';
import { MarketTable } from '../components/MarketTable';
import { Toast } from '../components/Toast';

type TickMsg = { type: 'pnl_tick'; market_id: number; pnl: number };

export default function Page() {
  const [backendUrl, setBackendUrl] = useState<string>('');
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lastTickRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    setBackendUrl(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000');
  }, []);

  // Poll basic market list (lightweight)
  const { data: markets, mutate } = useSWR('markets', listMarkets, { refreshInterval: 3000 });

  // Live ticks -> mark market "active" for a few seconds
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
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
          if (msg?.type === 'pnl_tick' && typeof msg.market_id === 'number') {
            lastTickRef.current.set(msg.market_id, Date.now());
          }
        } catch {
          // ignore non-JSON messages
        }
      };
    } catch {
      setWsStatus('error');
    }
    return () => ws?.close();
  }, []);

  // Compute which markets are "active" (tick within last 5s)
  const activeIds = useMemo(() => {
    const now = Date.now();
    const ids = new Set<number>();
    for (const [mid, ts] of lastTickRef.current.entries()) {
      if (now - ts < 5000) ids.add(mid);
    }
    return ids;
  }, [markets, wsStatus]); // recompute periodically via SWR refresh & ws state

  const onCreate = async (payload: { name: string; external_id: string; base_spread_bps: number; enabled: boolean }) => {
    await createMarket(payload);
    await mutate();
    setToast('Market created');
  };

  const onStart = async (id: number) => {
    setLoadingId(id);
    try {
      await startMarket(id);
      setToast(`Market ${id} starting…`);
      // optimistic: mark it active until first tick arrives
      lastTickRef.current.set(id, Date.now());
    } catch (e) {
      setToast(`Failed to start market ${id}`);
    } finally {
      setLoadingId(null);
    }
  };

  const onStop = async (id: number) => {
    setLoadingId(id);
    try {
      await stopMarket(id);
      setToast(`Market ${id} stopped`);
      // mark idle immediately
      lastTickRef.current.delete(id);
    } catch (e) {
      setToast(`Failed to stop market ${id}`);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="row">
        <span className="badge">Backend: {backendUrl}</span>
        <span className="badge">WS: {wsStatus}</span>
      </div>

      <div className="card">
        <CreateMarketForm onCreate={onCreate} />
      </div>

      <div className="card">
        <MarketTable
          markets={markets || []}
          onStart={onStart}
          onStop={onStop}
          loadingId={loadingId}
          activeIds={activeIds}
        />
      </div>

      <div className="card">
        <h3 className="font-medium mb-2">Live PnL (WebSocket)</h3>
        <LivePnlLog />
      </div>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function LivePnlLog() {
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
    <pre style={{whiteSpace:'pre-wrap', maxHeight:180, overflow:'auto', background:'#0b1021', color:'#e2e8f0', padding:12, borderRadius:10}}>
      {lines.join('\n')}
    </pre>
  );
}
