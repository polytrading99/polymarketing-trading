'use client';

import { useState } from 'react';

export function CreateMarketForm({
  onCreate,
}: {
  onCreate: (payload: { name: string; external_id: string; base_spread_bps: number; enabled: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState('US Election 2024');
  const [externalId, setExternalId] = useState('election');
  const [spread, setSpread] = useState(50);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onCreate({ name, external_id: externalId, base_spread_bps: spread, enabled });
      setName('');
      setExternalId('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card card-body">
      <div className="form-row">
        <input className="input" placeholder="Market name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="input" placeholder="external_id (slug/ticker)" value={externalId} onChange={(e) => setExternalId(e.target.value)} required />
        <input className="input" type="number" min={0} max={10000} value={spread} onChange={(e) => setSpread(parseInt(e.target.value, 10) || 0)} />
        <label className="checkbox"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled</label>
        <button type="submit" className="btn btn-success" disabled={busy}>
          {busy ? 'Creating…' : 'Create market'}
        </button>
      </div>
    </form>
  );
}
