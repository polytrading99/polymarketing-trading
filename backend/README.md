
# Polymarket Bot Prototype (Backend)

A minimal FastAPI backend scaffold to control markets, persist config in PostgreSQL, and stream live PnL.
This is a **starter** so you can iterate quickly.

## What’s inside
- **FastAPI** app (`/backend`) with:
  - `GET /health` — health check
  - `GET /markets` — list markets
  - `POST /markets` — create a market
  - `POST /markets/{id}/start` — start bot loop for a market (mock)
  - `POST /markets/{id}/stop` — stop bot loop for a market (mock)
  - `GET /pnl/{id}` — last known PnL for a market
  - `WS /ws/pnl` — websocket broadcasting PnL updates (stubbed with random values/event loop for now)

- **PostgreSQL** via Docker Compose
- **SQLAlchemy** models for `markets` and `pnl_ticks`
- **BotManager** stub with per-market async tasks (replace with real Polymarket logic)

## Quick start

### 1) With Docker (recommended)
```bash
docker compose up --build
```
- API docs at http://localhost:8000/docs
- Postgres at localhost:5432 (user: `app`, password: `app`, db: `appdb`)

### 2) Local (Python 3.11+ recommended)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql+asyncpg://app:app@localhost:5432/appdb"
uvicorn main:app --reload
```

### Create a market
```bash
curl -X POST http://localhost:8000/markets -H "Content-Type: application/json" -d '{
  "name": "Who will win election?",
  "external_id": "poly_12345",
  "base_spread_bps": 50,
  "enabled": true
}'
```

### Start/Stop a market loop
```bash
curl -X POST http://localhost:8000/markets/1/start
curl -X POST http://localhost:8000/markets/1/stop
```

## Next Steps (replace stubs)
- Replace `core/bot_manager.py` `run_market_loop()` with real Polymarket API logic
- Write to `pnl_ticks` as fills occur and inventory/fees update
- Secure endpoints (Auth) and add rate-limits/kill-switches
- Add metrics (Prometheus) and logs
