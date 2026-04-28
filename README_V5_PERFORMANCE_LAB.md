# SNITCH X v5 Performance Lab Extreme Pack

## Replace
- `src/App.jsx`
- `src/index.css`

## Add
- `scripts/tracker-worker.mjs`
- `.github/workflows/tracker.yml`
- `public/tracker-db.json`

## What it does
- Scanner/Search remains free to use.
- PRIME WATCH is auto-tracked into Performance Lab.
- Performance Lab shows forecast vs actual movement.
- Local DB is stored in browser localStorage.
- Background GitHub Actions worker can update `public/tracker-db.json` every 15 minutes even when browser is closed.

## After upload
1. Commit to GitHub.
2. Go to Actions.
3. Run `SNITCH X Background Tracker` manually once.
4. Wait for GitHub Pages deploy.
5. Open dashboard → Performance Lab → Sync Remote DB.
