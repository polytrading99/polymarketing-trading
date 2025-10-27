'use client';

import clsx from 'clsx';

type Market = {
  id: number;
  name: string;
  external_id: string;
  base_spread_bps: number;
  enabled: boolean;
};

export function MarketTable({
  markets,
  onStart,
  onStop,
  loadingId,
  activeIds,
}: {
  markets: Market[];
  onStart: (id: number) => void;
  onStop: (id: number) => void;
  loadingId: number | null;
  activeIds: Set<number>;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 70 }}>ID</th>
            <th>Name</th>
            <th>External ID</th>
            <th>Spread (bps)</th>
            <th>Enabled</th>
            <th style={{ width: 120 }}>Status</th>
            <th style={{ width: 180 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(markets || []).map((m) => {
            const isActive = activeIds.has(m.id);
            const isBusy = loadingId === m.id;
            return (
              <tr key={m.id} className={clsx(isActive && 'row-active')}>
                <td>{m.id}</td>
                <td>{m.name}</td>
                <td>{m.external_id}</td>
                <td>{m.base_spread_bps}</td>
                <td>{m.enabled ? 'Yes' : 'No'}</td>
                <td>
                  <span className={clsx('badge', isActive ? 'status-active' : 'status-idle')}>
                    {isActive ? 'Active' : 'Idle'}
                  </span>
                </td>
                <td className="row">
                  <button
                    onClick={() => onStart(m.id)}
                    disabled={isBusy || isActive}
                    aria-busy={isBusy && !isActive}
                  >
                    {isBusy && !isActive ? 'Starting…' : 'Start'}
                  </button>
                  <button
                    onClick={() => onStop(m.id)}
                    disabled={isBusy || !isActive}
                    aria-busy={isBusy && isActive}
                  >
                    {isBusy && isActive ? 'Stopping…' : 'Stop'}
                  </button>
                </td>
              </tr>
            );
          })}
          {(!markets || markets.length === 0) && (
            <tr>
              <td colSpan={7} style={{ padding: '18px', textAlign: 'center', color: '#6b7280' }}>
                No markets yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <style jsx global>{`
        .row-active { background: #f0fff4; }                 /* subtle green */
        .status-active { border-color: #10b981; color: #065f46; background: #d1fae5; }
        .status-idle { color: #374151; }
        button[disabled] { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
