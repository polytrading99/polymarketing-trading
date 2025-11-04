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
  pendingStarts,
  pendingStops,
  isLoading,
}: {
  markets: Market[];
  onStart: (id: number) => void;
  onStop: (id: number) => void;
  loadingId: number | null;
  activeIds: Set<number>;
  pendingStarts: Set<number>;
  pendingStops: Set<number>;
  isLoading?: boolean;
}) {
  const rows = markets || [];

  return (
    <div className="table-wrap">
      <table className="table">
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
          {rows.map((m) => {
            const isActive = activeIds.has(m.id);
            const isStarting = pendingStarts.has(m.id);
            const isStopping = pendingStops.has(m.id);
            const isBusy = loadingId === m.id;

            let statusText = 'Idle';
            let statusClass = 'status-idle';
            if (isStarting) {
              statusText = 'Starting…';
              statusClass = 'status-starting';
            } else if (isStopping) {
              statusText = 'Stopping…';
              statusClass = 'status-stopping';
            } else if (isActive) {
              statusText = 'Active';
              statusClass = 'status-active';
            }

            const disableStart = isBusy || isActive || isStarting;
            const disableStop = isBusy || (!isActive && !isStopping);

            return (
              <tr
                key={m.id}
                className={clsx(
                  isActive && 'row-active',
                  isStarting && 'row-starting',
                  isStopping && 'row-stopping'
                )}
              >
                <td>{m.id}</td>
                <td>{m.name}</td>
                <td>{m.external_id}</td>
                <td>{m.base_spread_bps}</td>
                <td>{m.enabled ? 'Yes' : 'No'}</td>
                <td>
                  <span className={clsx('status-badge', statusClass)}>{statusText}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => onStart(m.id)}
                      disabled={disableStart}
                      aria-busy={isStarting}
                      className="btn btn-success btn-mini"
                    >
                      {isStarting ? 'Starting…' : 'Start'}
                    </button>
                    <button
                      onClick={() => onStop(m.id)}
                      disabled={disableStop}
                      aria-busy={isStopping}
                      className="btn btn-secondary btn-mini"
                    >
                      {isStopping ? 'Stopping…' : 'Stop'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {(rows.length === 0 || isLoading) && (
            <tr>
              <td colSpan={7} style={{ padding: 18, textAlign: 'center', color: '#6b7280' }}>
                {isLoading ? 'Loading markets…' : 'No markets yet'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
