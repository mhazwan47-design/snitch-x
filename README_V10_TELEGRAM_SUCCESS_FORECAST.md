# SNITCH X v10 Telegram Alert + Success Forecast Engine

Replace:
- src/App.jsx
- src/index.css
- scripts/tracker-worker.mjs
- .github/workflows/tracker.yml

Keep/update:
- public/tracker-db.json

GitHub Secrets required:
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID

New in v10:
- Telegram alerts from GitHub Actions worker.
- Alerts trigger once per hit:
  - ZN = Buy/Sell Zone Hit
  - TR = Trigger Hit
  - T1 = TP1 Hit
  - T2 = TP2 Hit / success forecast
  - INV = Invalidation Hit
- Anti-spam memory per record:
  alertsSent: { ZN, TR, T1, T2, INV }
- Success Forecast tab:
  completed forecasts are separated from active Performance Lab records.
- public/tracker-db.json now stores:
  records[]
  successForecasts[]

Recommended workflow:
1. Commit v10 files.
2. GitHub Actions → SNITCH X Background Tracker → Run workflow.
3. Check Telegram for test alerts if any existing records already hit ZN/T1/T2/INV.
4. Open website → Success Forecast tab.

Important:
- ZN alert means potential entry zone, not guaranteed buy.
- TR alert is stronger confirmation.
- T1/T2 are profit-management alerts.
- This does not execute trades automatically.
