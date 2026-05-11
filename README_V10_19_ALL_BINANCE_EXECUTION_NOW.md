# SNITCH X v10.19 — All Binance Execution Now

## Upgrade focus

This version changes the execution philosophy from a noisy watchlist into a lighter execution list:

- Scan wide across Binance possibility space.
- Add Binance Spot/Margin/Futures/Perpetual public market-data collectors.
- Keep DexScreener RADAR fallback for legacy continuity.
- Filter silently in the background.
- Display only tradable rows.
- Replace confusing labels with direct execution labels:
  - BUY SPOT / SELL SPOT
  - BUY MARGIN / SELL MARGIN
  - BUY FUTURES / SELL FUTURES
  - BUY PERP / SELL PERP

## Important safety note

This is a market-data scanner, not an auto-trading bot. It does not guarantee profit and does not execute orders automatically. Use small test sizing first and verify every market, fee, funding, and order condition inside Binance before placing a trade.

## Main code changes

### scripts/tracker-worker.mjs

- Added Binance all-market universe scanner using public endpoints:
  - Spot exchangeInfo + 24hr ticker + book ticker
  - USD-M futures exchangeInfo + 24hr ticker + book ticker
- Added hidden filters for:
  - spread
  - volume
  - transaction count
  - TP room
  - estimated cost
  - risk gate
  - new pair handling
- Added `marketType`, `actionLabel`, `binanceSymbol`, `spreadPct`, and `estimatedCostPct` into generated records.

### src/App.jsx

- Trade Action Center renamed visually to SNITCH Execution Now.
- Action labels now use BUY/SELL + market type.
- SELL is no longer skipped.
- Route links support Spot and Futures/Perp Binance pages.
- Action filtering now supports BUY only, SELL only, SPOT only, MARGIN only, FUTURES/PERP only.
- Background logic hides weak rows instead of displaying rejection reasons.

## Version

v10.19-all-binance-execution-now
