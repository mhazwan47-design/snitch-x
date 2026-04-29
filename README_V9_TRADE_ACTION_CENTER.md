# SNITCH X v9 Trade Action Center

Replace:
- src/App.jsx
- src/index.css

Keep/update:
- scripts/tracker-worker.mjs
- public/tracker-db.json
- .github/workflows/tracker.yml

New in v9:
- New tab: Trade Action Center.
- Capital/modal input.
- Calculates estimated TP1 profit, TP2 profit, and invalidation risk per lab record.
- Route Advisor chooses:
  - CEX Preferred
  - Low-Fee DEX
  - Chart Only
  - Exit / Avoid Buy
  - Avoid
- Action buttons:
  - Open Best Route
  - Open Chart
  - Copy trade plan
  - Copy all visible plans
- Sort/filter by actionable rows, buy/sell/golden/security pass.
- Direct and beginner-friendly without auto-executing trades.

Important:
- This is not financial advice.
- The action buttons navigate to external platforms or charts; they do not execute trades.
- Always verify final price, fee, slippage, chain and token contract before confirming any trade.
