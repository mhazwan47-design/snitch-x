# SNITCH X v9.1 Trade Action Center Route Fix

Replace:
- src/App.jsx
- src/index.css

Keep/update:
- scripts/tracker-worker.mjs
- public/tracker-db.json
- .github/workflows/tracker.yml

New in v9.1:
- Binance button uses direct spot URL:
  https://www.binance.com/en/trade/{TOKEN}_USDT?type=spot
- Button label becomes Open Binance TOKEN/USDT.
- Added OKX and Bybit fallback action buttons for CEX-preferred rows.
- Actionable Only now excludes:
  - WAIT category
  - SELL WATCH
  - legacy records with missing security score
  - NOT WORTH / AVOID rows
- Legacy security records become WATCH ONLY until scanner/worker refreshes them.
