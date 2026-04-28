# SNITCH X — DEX Execution Cockpit

Fresh GitHub-ready React/Vite app for live DEX opportunity scanning using DexScreener public API.

## What it does

- Live search by token symbol, pair, or contract
- Radar mode using boosted tokens + default major radar keywords
- Scores each pair using liquidity, volume, buy/sell pressure, momentum, age, and risk flags
- Generates decision fields:
  - Can Buy Now
  - Action
  - Suggested Size
  - Buy Zone
  - Breakout
  - Invalidation
  - TP1 / TP2
  - Risk Reward
  - Danger Flags
- Opens the pair directly in DexScreener for final chart confirmation

## Important

This app is a decision-support tool, not financial advice. Always verify on the chart and manage risk.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown in terminal.

## Build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

1. Create a new GitHub repo, for example `snitch-x`.
2. Upload all files in this folder.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, select **GitHub Actions**.
5. Push to `main`.
6. Wait for the Action to finish.
7. Your app will be live at:

```text
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/
```

## Notes

DexScreener search endpoints do not provide full candle/OHLCV history, so support/resistance is a heuristic level based on available live pair data. Use it as a filter, then confirm manually on DexScreener chart.
