# SNITCH X v7.1 Prime Category Lab + Full Background Worker

Replace:
- src/App.jsx
- src/index.css

Add/update:
- public/tracker-db.json
- scripts/tracker-worker.mjs
- .github/workflows/tracker.yml

New in v7.1:
- Restores PRIME WATCH as a middle layer.
- Keeps GOLDEN WATCH / BUY WATCH / SELL WATCH / NEW PAIR.
- Same Performance Lab table.
- Category filter includes Prime Watch.
- Full GitHub Actions background worker scans and updates tracker-db.json every 15 minutes.
- Database continues to grow/update even when browser is closed, as long as GitHub Actions is enabled.

Important:
- GitHub scheduled workflows are not real-time execution. They are suitable for tracking and performance database building.
- After deploy, go to GitHub > Actions > SNITCH X Background Tracker > Run workflow once.
