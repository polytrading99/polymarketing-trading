
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

## Testing

### Backend (pytest)
```bash
cd backend
source .venv/bin/activate  # if not already active
pytest
```

### Frontend (Playwright)
```bash
cd frontend
npm install
npx playwright install chromium
npx playwright test
```

## Configuration

Environment variables (with defaults):

- `CORS_ALLOWED_ORIGINS` — comma-separated list of allowed origins (`http://localhost:3000`)
- `ENFORCE_HTTPS` — set to `true` to require HTTPS (`false`)
- `NONCE_TTL_SECONDS` — lifetime of wallet nonces before they expire (`300`)
- `AUTH_RATE_LIMIT_MAX_REQUESTS` — maximum auth requests per window (`10`)
- `AUTH_RATE_LIMIT_WINDOW_SECONDS` — rate limit window size (`60`)
- `POLYMARKET_PUBLIC_API_BASE` — public market feed base URL (`https://gamma-api.polymarket.com`)
- `POLYMARKET_API_BASE` — authenticated CLOB API base URL (`https://clob.polymarket.com`)
- `POLYMARKET_API_KEY` — optional API key for private endpoints (unset)
- `POLYMARKET_TIMEOUT_SECONDS` — timeout for Polymarket HTTP calls (`5`)
- `BOT_LOOP_INTERVAL_SECONDS` — base bot loop cadence in seconds (`1.0`)
- `BOT_RETRY_BACKOFF_SECONDS` — multiplier applied after failures (`2.0`)
- `BOT_MAX_BACKOFF_SECONDS` — maximum backoff delay (`30`)
- `BOT_QUOTE_SIZE` — virtual position size used for paper PnL (`25`)
- `BOT_INVENTORY_CAP` — virtual inventory cap (`1000`)

## Next Steps (replace stubs)
- Replace `core/bot_manager.py` `run_market_loop()` with real Polymarket API logic
- Write to `pnl_ticks` as fills occur and inventory/fees update
- Secure endpoints (Auth) and add rate-limits/kill-switches
- Add metrics (Prometheus) and logs
