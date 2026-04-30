# SNITCH X v10.1 Telegram Test Button Patch

Replace/update:
- scripts/tracker-worker.mjs
- .github/workflows/tracker.yml
- src/App.jsx

New in v10.1:
- Manual Telegram test mode in GitHub Actions.
- Actions → SNITCH X Background Tracker → Run workflow
- Select:
  test_telegram = true
- The worker sends one test Telegram message and exits without scanning DB.

Expected Telegram message:
✅ SNITCH X TELEGRAM TEST SUCCESSFUL

If test fails:
- Check TELEGRAM_BOT_TOKEN secret
- Check TELEGRAM_CHAT_ID secret
- Make sure the bot was started in Telegram
- Make sure the chat ID is correct

Normal mode:
- test_telegram = false
- Worker scans DexScreener, updates tracker-db.json, sends real ZN/TR/T1/T2/INV alerts, and updates Success Forecast.
