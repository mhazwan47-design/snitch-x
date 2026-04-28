import { useMemo, useState } from "react";

const RADAR_TOKENS = [
  "ETH", "SOL", "BTC", "BNB", "XRP", "ARB", "ONDO", "TON", "SUI", "LINK",
  "DOGE", "PEPE", "WIF", "SEI", "FET", "RNDR", "AVAX", "OP", "INJ", "TIA"
];

const BLUE_CHIP_QUOTES = new Set([
  "USDC", "USDT", "WETH", "ETH", "WBTC", "BTC", "SOL", "WSOL", "BNB", "WBNB", "DAI", "USD"
]);

const STABLE_QUOTES = new Set(["USDC", "USDT", "DAI", "USD"]);
const WRAPPED_MAJOR_QUOTES = new Set(["WETH", "ETH", "WBTC", "BTC", "SOL", "WSOL", "BNB", "WBNB"]);

const MAJOR_DEX = new Set([
  "uniswap", "pancakeswap", "raydium", "orca", "meteora", "aerodrome", "camelot",
  "sushiswap", "curve", "balancer", "traderjoe", "quickswap", "ekubo"
]);

const MAJOR_CHAIN = new Set([
  "ethereum", "arbitrum", "base", "bsc", "solana", "polygon", "optimism", "avalanche", "starknet"
]);

function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function money(value) {
  const x = n(value, NaN);
  if (!Number.isFinite(x)) return "N/A";
  if (Math.abs(x) >= 1_000_000_000) return `$${(x / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(x) >= 1_000_000) return `$${(x / 1_000_000).toFixed(2)}M`;
  if (Math.abs(x) >= 1_000) return `$${(x / 1_000).toFixed(2)}K`;
  return `$${x.toFixed(2)}`;
}

function price(value) {
  const x = n(value, NaN);
  if (!Number.isFinite(x)) return "N/A";
  if (x >= 100) return x.toFixed(2);
  if (x >= 1) return x.toFixed(4);
  if (x >= 0.01) return x.toFixed(6);
  return x.toPrecision(5);
}

function pct(value) {
  const x = n(value, NaN);
  if (!Number.isFinite(x)) return "N/A";
  return `${x.toFixed(2)}%`;
}

function firstUrl(pair) {
  return pair?.url || pair?.pairUrl || "#";
}

function isContractQuery(q) {
  const s = String(q || "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(s) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

function normalizeText(v) {
  return String(v || "").trim().toLowerCase();
}

function median(values) {
  const arr = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function quoteTier(quoteSymbol) {
  const q = String(quoteSymbol || "").toUpperCase();
  if (STABLE_QUOTES.has(q)) return 3;
  if (WRAPPED_MAJOR_QUOTES.has(q)) return 2;
  if (BLUE_CHIP_QUOTES.has(q)) return 1;
  return 0;
}

function queryMatchScore(pair, query) {
  const q = normalizeText(query);
  if (!q) return 0;

  const baseSymbol = normalizeText(pair?.baseToken?.symbol);
  const quoteSymbol = normalizeText(pair?.quoteToken?.symbol);
  const baseName = normalizeText(pair?.baseToken?.name);
  const quoteName = normalizeText(pair?.quoteToken?.name);
  const baseAddr = normalizeText(pair?.baseToken?.address);
  const quoteAddr = normalizeText(pair?.quoteToken?.address);
  const pairAddr = normalizeText(pair?.pairAddress);

  if (q === baseAddr || q === quoteAddr || q === pairAddr) return 40;
  if (q === baseSymbol) return 35;
  if (q === quoteSymbol) return 10;
  if (baseName === q) return 26;
  if (baseName.includes(q)) return 14;
  if (baseSymbol.includes(q)) return 10;
  if (quoteName.includes(q) || quoteSymbol.includes(q)) return -4;
  return -14;
}

function qualityRejectReason(pair, opts) {
  const liq = n(pair?.liquidity?.usd);
  const vol24 = n(pair?.volume?.h24);
  const vol6 = n(pair?.volume?.h6);
  const vol1 = n(pair?.volume?.h1);
  const priceUsd = n(pair?.priceUsd);
  const buys24 = n(pair?.txns?.h24?.buys);
  const sells24 = n(pair?.txns?.h24?.sells);
  const tx24 = buys24 + sells24;
  const h24 = n(pair?.priceChange?.h24);
  const fdv = n(pair?.fdv);
  const cap = n(pair?.marketCap);
  const ageMs = Date.now() - n(pair?.pairCreatedAt, Date.now());
  const ageDays = ageMs / 86400000;
  const strictness = opts.strictness || "balanced";
  const minLiquidity = n(opts.minLiquidity, 0);
  const quote = String(pair?.quoteToken?.symbol || "").toUpperCase();

  const minVolume = strictness === "strict" ? 50_000 : strictness === "hunter" ? 2_000 : 10_000;
  const minTx = strictness === "strict" ? 80 : strictness === "hunter" ? 8 : 25;

  if (!pair?.baseToken?.symbol || !pair?.quoteToken?.symbol) return "Missing token symbol";
  if (!pair?.pairAddress) return "Missing pair address";
  if (priceUsd <= 0) return "Invalid price";
  if (liq < minLiquidity) return `Liquidity below filter ${money(minLiquidity)}`;
  if (vol24 < minVolume) return `24H volume too low (${money(vol24)})`;
  if (tx24 < minTx) return `Too few 24H transactions (${tx24})`;

  // Universal bad-data filters.
  if (liq >= 100_000_000 && vol24 < 100_000) return "Suspicious: huge liquidity but tiny volume";
  if (liq >= 10_000_000 && vol24 < 10_000) return "Suspicious: high liquidity but dead volume";
  if (liq > 0 && vol24 / liq < 0.00001 && liq > 1_000_000) return "Dead pool: volume/liquidity too low";

  // Non-major quote is still allowed, but only if activity is very strong.
  if (!BLUE_CHIP_QUOTES.has(quote) && strictness !== "hunter" && vol24 < 250_000) {
    return "Non-major quote with weak volume";
  }

  if (fdv > 0 && liq > 0 && fdv / liq > 1000 && vol24 < 250_000) return "FDV/liquidity imbalance";
  if (cap > 0 && fdv > 0 && fdv / cap > 50) return "FDV much larger than market cap";
  if (strictness !== "hunter" && h24 > 250) return "Already extreme pump";
  if (strictness !== "hunter" && h24 < -80) return "Severe dump";
  if (strictness === "strict" && ageDays < 1) return "Too new for strict mode";
  if (strictness === "balanced" && ageDays < 0.05 && vol24 < 250_000) return "Very new and insufficient volume";
  if (vol24 > 500_000 && vol6 <= 0 && vol1 <= 0) return "No recent volume despite 24H activity";

  return "";
}

function buildWarnings(pair) {
  const warnings = [];
  const liq = n(pair?.liquidity?.usd);
  const vol24 = n(pair?.volume?.h24);
  const fdv = n(pair?.fdv);
  const h24 = n(pair?.priceChange?.h24);
  const h6 = n(pair?.priceChange?.h6);
  const buys24 = n(pair?.txns?.h24?.buys);
  const sells24 = n(pair?.txns?.h24?.sells);
  const tx24 = buys24 + sells24;
  const buyPressure = tx24 > 0 ? (buys24 / tx24) * 100 : 50;
  const ageMs = Date.now() - n(pair?.pairCreatedAt, Date.now());
  const ageDays = ageMs / 86400000;
  const quote = String(pair?.quoteToken?.symbol || "").toUpperCase();
  const dex = normalizeText(pair?.dexId);
  const chain = normalizeText(pair?.chainId);

  if (liq < 100_000) warnings.push("Liquidity weak");
  if (vol24 < 100_000) warnings.push("Volume weak");
  if (tx24 < 50) warnings.push("Low transaction count");
  if (ageDays < 2) warnings.push("Very new pair");
  if (h24 > 80 || h6 > 35) warnings.push("Already pumped");
  if (h24 < -35) warnings.push("Heavy drawdown");
  if (fdv > 0 && liq > 0 && fdv / liq > 200) warnings.push("FDV/liquidity imbalance");
  if (buyPressure < 45) warnings.push("Sell pressure heavier");
  if (!BLUE_CHIP_QUOTES.has(quote)) warnings.push("Non-major quote asset");
  if (dex && !MAJOR_DEX.has(dex)) warnings.push("Less common DEX");
  if (chain && !MAJOR_CHAIN.has(chain)) warnings.push("Less common chain");
  if (!warnings.length) warnings.push("No major red flag from public pair data");
  return warnings;
}

function analyzePair(pair, query, opts) {
  const liq = n(pair?.liquidity?.usd);
  const vol24 = n(pair?.volume?.h24);
  const vol6 = n(pair?.volume?.h6);
  const fdv = n(pair?.fdv);
  const cap = n(pair?.marketCap);
  const p = n(pair?.priceUsd);
  const h1 = n(pair?.priceChange?.h1);
  const h6 = n(pair?.priceChange?.h6);
  const h24 = n(pair?.priceChange?.h24);
  const txBuys = n(pair?.txns?.h24?.buys);
  const txSells = n(pair?.txns?.h24?.sells);
  const tx24 = txBuys + txSells;
  const ageMs = Date.now() - n(pair?.pairCreatedAt, Date.now());
  const ageDays = ageMs / 86400000;
  const buyPressure = tx24 > 0 ? (txBuys / tx24) * 100 : 50;
  const quote = String(pair?.quoteToken?.symbol || "").toUpperCase();
  const dex = normalizeText(pair?.dexId);
  const chain = normalizeText(pair?.chainId);
  const qScore = queryMatchScore(pair, query);
  const rejection = qualityRejectReason(pair, opts);
  const qTier = quoteTier(quote);

  let validity = 42 + qScore;
  if (liq >= 5_000_000) validity += 20;
  else if (liq >= 1_000_000) validity += 16;
  else if (liq >= 200_000) validity += 10;
  else if (liq >= 50_000) validity += 3;
  else validity -= 22;

  if (vol24 >= 10_000_000) validity += 18;
  else if (vol24 >= 1_000_000) validity += 13;
  else if (vol24 >= 100_000) validity += 7;
  else validity -= 18;

  if (tx24 >= 500) validity += 10;
  else if (tx24 >= 100) validity += 6;
  else if (tx24 < 25) validity -= 12;

  validity += qTier === 3 ? 9 : qTier === 2 ? 7 : qTier === 1 ? 4 : -14;
  if (MAJOR_DEX.has(dex)) validity += 5;
  if (MAJOR_CHAIN.has(chain)) validity += 4;
  if (ageDays > 14) validity += 6;
  if (ageDays < 1) validity -= 6;

  let opportunity = 40 + qScore * 0.4;
  if (vol24 >= 1_000_000) opportunity += 14;
  if (vol24 >= 10_000_000) opportunity += 8;
  if (liq >= 250_000) opportunity += 8;
  if (fdv > 0 && fdv <= 50_000_000) opportunity += 12;
  if (fdv > 500_000_000) opportunity -= 6;
  if (h24 > 3 && h24 < 35) opportunity += 12;
  if (h6 > 1 && h6 < 18) opportunity += 8;
  if (h24 > 80) opportunity -= 18;
  if (h24 < -25) opportunity -= 12;
  if (buyPressure > 55) opportunity += 6;
  if (tx24 >= 200) opportunity += 6;
  if (qTier === 0) opportunity -= 18;

  let execution = 42 + qScore * 0.25;
  if (h1 > -2 && h1 < 6) execution += 8;
  if (h6 > 0 && h6 < 15) execution += 12;
  if (h24 > 0 && h24 < 35) execution += 12;
  if (h1 > 12 || h6 > 30 || h24 > 80) execution -= 25;
  if (liq >= 200_000) execution += 8;
  if (vol6 >= 100_000) execution += 8;
  if (buyPressure >= 52 && buyPressure <= 70) execution += 6;
  if (tx24 >= 100) execution += 5;
  if (qTier === 0) execution -= 20;

  let risk = 42;
  if (liq < 100_000) risk += 22;
  if (vol24 < 100_000) risk += 18;
  if (tx24 < 25) risk += 14;
  if (ageDays < 2) risk += 12;
  if (h24 > 80) risk += 20;
  if (h24 < -35) risk += 18;
  if (fdv > 0 && liq > 0 && fdv / liq > 200) risk += 10;
  if (qTier === 0) risk += 18;
  if (!MAJOR_DEX.has(dex)) risk += 4;
  if (!MAJOR_CHAIN.has(chain)) risk += 4;
  if (rejection) risk += 18;

  validity = clamp(validity);
  opportunity = clamp(opportunity);
  execution = clamp(execution);
  risk = clamp(risk);

  const support = p > 0 ? p * (h24 >= 0 ? 0.965 : 0.94) : 0;
  const buyLow = support * 0.995;
  const buyHigh = support * 1.015;
  const resistance = p > 0 ? p * (h24 >= 0 ? 1.045 : 1.03) : 0;
  const breakout = resistance * 1.006;
  const invalidation = support * 0.965;
  const tp1 = p > 0 ? p * 1.055 : 0;
  const tp2 = p > 0 ? p * 1.11 : 0;
  const rr = p > 0 && invalidation > 0 ? Math.abs(tp1 - p) / Math.abs(p - invalidation) : 0;

  const flags = buildWarnings(pair);
  if (rejection) flags.unshift(`Rejected reason: ${rejection}`);

  let decision = "WAIT";
  let action = "Wait for support/retest confirmation.";
  let size = "0% now";

  const majorQuote = qTier >= 2;
  const strongActivity = vol24 >= 100_000 && tx24 >= 100;
  const priceNearBuyZone = p > 0 && buyLow > 0 && p >= buyLow * 0.99 && p <= buyHigh * 1.018;
  const priceNearBreakout = p > 0 && breakout > 0 && p >= breakout * 0.985 && p <= breakout * 1.012;
  const priceExtendedAboveBuy = p > 0 && buyHigh > 0 && p > buyHigh * 1.035 && p < breakout * 0.985;
  const hasMajorFlag = flags.some((f) =>
    f.includes("FDV/liquidity imbalance") ||
    f.includes("Already pumped") ||
    f.includes("Heavy drawdown") ||
    f.includes("Price anomaly") ||
    f.includes("Non-major quote asset")
  );

  const cleanEnough = !rejection && majorQuote && strongActivity && !hasMajorFlag;
  const executionLocationOk = priceNearBuyZone || priceNearBreakout;
  const buyGate =
    cleanEnough &&
    execution >= 82 &&
    validity >= 72 &&
    risk <= 50 &&
    rr >= 0.8 &&
    executionLocationOk;

  if (rejection && opts.hideRejected !== false) {
    decision = "FILTERED";
    action = rejection;
    size = "0%";
  } else if (validity < 45 || risk > 78) {
    decision = "AVOID";
    action = "Avoid. Risk too high versus data quality.";
    size = "0%";
  } else if (buyGate) {
    decision = "BUY SMALL";
    action = priceNearBuyZone
      ? "Small entry allowed only if price confirms reaction inside/near buy zone."
      : "Small breakout entry allowed only after breakout candle and retest confirmation.";
    size = "0.5% - 1.0% capital";
  } else if (cleanEnough && rr < 0.8 && (execution >= 78 || opportunity >= 70)) {
    decision = "WAIT BETTER RR";
    action = "Good pair, but reward/risk is not attractive enough. Wait for a better entry price.";
    size = "0% now";
  } else if (cleanEnough && priceExtendedAboveBuy && (execution >= 78 || opportunity >= 70)) {
    decision = "WAIT PULLBACK";
    action = "Good pair, but current price is mid-range/extended above buy zone. Wait for pullback or breakout retest.";
    size = "0% now";
  } else if (cleanEnough && opportunity >= 70 && validity >= 60) {
    decision = "WATCH HOT";
    action = "Good candidate, but wait for clean trigger.";
    size = "0.25% - 0.75% after confirmation";
  } else if (h24 > 50 || h6 > 25) {
    decision = "DO NOT CHASE";
    action = "Wait pullback. Price is extended.";
    size = "0% now";
  } else if (!majorQuote) {
    decision = "LOW PRIORITY";
    action = "Non-major quote pair. Prefer major quote pair if available.";
    size = "0% unless manually verified";
  }

  return {
    id: `${pair.chainId}-${pair.pairAddress}`,
    token: pair?.baseToken?.symbol || "UNKNOWN",
    name: pair?.baseToken?.name || "",
    quote,
    quoteTier: qTier,
    pairLabel: `${pair?.baseToken?.symbol || "?"}/${pair?.quoteToken?.symbol || "?"}`,
    chain: pair?.chainId || "unknown",
    dex: pair?.dexId || "unknown",
    url: firstUrl(pair),
    priceUsd: p,
    liquidityUsd: liq,
    volume24h: vol24,
    fdv,
    marketCap: cap,
    h1, h6, h24,
    tx24,
    buyPressure,
    ageDays,
    validity,
    opportunity,
    execution,
    risk,
    decision,
    action,
    size,
    flags,
    rejection,
    matchScore: qScore,
    priceAnomaly: false,
    anomalyReason: "",
    executionState: {
      priceNearBuyZone,
      priceNearBreakout,
      priceExtendedAboveBuy,
      hasMajorFlag,
      executionLocationOk
    },
    levels: { support, resistance, buyLow, buyHigh, breakout, invalidation, tp1, tp2, rr },
    raw: pair
  };
}

function applyCrossPairSanity(items, query) {
  const q = normalizeText(query);
  if (!items.length || isContractQuery(query)) return items;

  const majorPrices = items
    .filter((x) => normalizeText(x.token) === q && x.quoteTier >= 2 && x.volume24h >= 50_000)
    .map((x) => x.priceUsd);

  const ref = median(majorPrices);
  if (!ref) return items;

  return items.map((x) => {
    if (normalizeText(x.token) !== q || !x.priceUsd) return x;

    const ratio = x.priceUsd / ref;
    const anomalous = ratio > 20 || ratio < 0.05;

    if (!anomalous) return x;

    const copy = { ...x };
    copy.priceAnomaly = true;
    copy.anomalyReason = `Price anomaly vs major pairs (${ratio.toFixed(2)}x reference)`;
    copy.flags = [copy.anomalyReason, ...copy.flags];
    copy.risk = clamp(copy.risk + 28);
    copy.validity = clamp(copy.validity - 30);
    copy.execution = clamp(copy.execution - 25);
    copy.opportunity = clamp(copy.opportunity - 18);

    if (copy.decision === "BUY SMALL" || copy.decision === "WATCH HOT") {
      copy.decision = "LOW PRIORITY";
      copy.action = "Price deviates heavily from major quote reference. Prefer major quote pair.";
      copy.size = "0% unless manually verified";
    }

    return copy;
  });
}

function finalRank(x) {
  const decisionBoost =
    x.decision === "BUY SMALL" ? 48 :
    x.decision === "WATCH HOT" ? 28 :
    x.decision === "WAIT PULLBACK" ? 20 :
    x.decision === "WAIT BETTER RR" ? 16 :
    x.decision === "WAIT" ? 8 :
    x.decision === "LOW PRIORITY" ? -30 :
    x.decision === "DO NOT CHASE" ? -20 :
    x.decision === "AVOID" ? -35 : -55;

  const quoteBoost = x.quoteTier === 3 ? 24 : x.quoteTier === 2 ? 20 : x.quoteTier === 1 ? 8 : -55;
  const dexBoost = MAJOR_DEX.has(normalizeText(x.dex)) ? 8 : -5;
  const chainBoost = MAJOR_CHAIN.has(normalizeText(x.chain)) ? 6 : -5;
  const volumeBoost = Math.log10(Math.max(1, x.volume24h)) * 3;
  const liqBoost = Math.log10(Math.max(1, x.liquidityUsd)) * 1.5;
  const anomalyPenalty = x.priceAnomaly ? -80 : 0;
  const weakVolumePenalty = x.volume24h < 100_000 ? -18 : 0;

  return (
    x.matchScore * 1.8 +
    x.validity * 0.95 +
    x.execution * 1.2 +
    x.opportunity * 0.75 -
    x.risk * 0.9 +
    decisionBoost +
    quoteBoost +
    dexBoost +
    chainBoost +
    volumeBoost +
    liqBoost +
    anomalyPenalty +
    weakVolumePenalty
  );
}

function scoreClass(value, inverse = false) {
  const x = n(value);
  if (!inverse) {
    if (x >= 75) return "good";
    if (x >= 55) return "mid";
    return "bad";
  }
  if (x <= 45) return "good";
  if (x <= 65) return "mid";
  return "bad";
}

function decisionClass(decision) {
  const d = String(decision).toUpperCase();
  if (d.includes("BUY")) return "buy";
  if (d.includes("AVOID") || d.includes("CHASE") || d.includes("FILTER") || d.includes("LOW")) return "avoid";
  if (d.includes("HOT")) return "hot";
  return "wait";
}

function ScorePill({ label, value, inverse = false }) {
  return (
    <div className={`score ${scoreClass(value, inverse)}`}>
      <span>{label}</span>
      <b>{Math.round(n(value))}</b>
    </div>
  );
}

function PairCard({ item, onSelect, selected }) {
  return (
    <button className={`pair-card ${selected ? "selected" : ""}`} onClick={() => onSelect(item)}>
      <div className="pair-top">
        <div>
          <h3>{item.token}</h3>
          <p>{item.pairLabel} · {item.chain} · {item.dex}</p>
        </div>
        <span className={`decision ${decisionClass(item.decision)}`}>{item.decision}</span>
      </div>

      <div className="pair-price">
        <b>${price(item.priceUsd)}</b>
        <span className={item.h24 >= 0 ? "up" : "down"}>24H {pct(item.h24)}</span>
      </div>

      <div className="score-grid">
        <ScorePill label="Opp" value={item.opportunity} />
        <ScorePill label="Exec" value={item.execution} />
        <ScorePill label="Valid" value={item.validity} />
        <ScorePill label="Risk" value={item.risk} inverse />
      </div>

      <div className="mini-grid">
        <div><span>Liquidity</span><b>{money(item.liquidityUsd)}</b></div>
        <div><span>Volume</span><b>{money(item.volume24h)}</b></div>
        <div><span>Tx 24H</span><b>{item.tx24}</b></div>
        <div><span>Buy Flow</span><b>{Math.round(item.buyPressure)}%</b></div>
      </div>
    </button>
  );
}

function Detail({ item }) {
  if (!item) {
    return (
      <section className="panel sticky-panel">
        <h2>Action Detail</h2>
        <p className="muted">Search or run Radar, then select a pair.</p>
      </section>
    );
  }

  const l = item.levels;
  return (
    <section className="panel sticky-panel">
      <div className="detail-head">
        <div>
          <h2>{item.token} Execution Plan</h2>
          <p>{item.pairLabel} · {item.chain} · {item.dex}</p>
        </div>
        <span className={`decision big ${decisionClass(item.decision)}`}>{item.decision}</span>
      </div>

      <div className="answer-box">
        <span>Can buy now?</span>
        <b>{item.decision}</b>
        <p>{item.action}</p>
      </div>

      <div className="detail-grid">
        <div><span>Suggested size</span><b>{item.size}</b></div>
        <div><span>Current price</span><b>${price(item.priceUsd)}</b></div>
        <div><span>Buy zone</span><b>${price(l.buyLow)} – ${price(l.buyHigh)}</b></div>
        <div><span>Breakout</span><b>${price(l.breakout)}</b></div>
        <div><span>Invalidation</span><b>${price(l.invalidation)}</b></div>
        <div><span>TP1 / TP2</span><b>${price(l.tp1)} / ${price(l.tp2)}</b></div>
        <div><span>RR estimate</span><b>1:{l.rr.toFixed(2)}</b></div>
        <div><span>Age</span><b>{item.ageDays.toFixed(1)} days</b></div>
        <div><span>Entry Location</span><b>{item.executionState?.priceNearBuyZone ? "Near Buy Zone" : item.executionState?.priceNearBreakout ? "Near Breakout" : "Mid / Not Ideal"}</b></div>
        <div><span>Execution Gate</span><b>{item.executionState?.executionLocationOk && !item.executionState?.hasMajorFlag && l.rr >= 0.8 ? "Open" : "Closed"}</b></div>
      </div>

      <div className="rule-box">
        <h4>V4 Execution Gate</h4>
        <p><b>BUY SMALL gate:</b> RR must be acceptable, price must be near buy zone or breakout, risk must be controlled, and no major execution flag should exist.</p>
        <p><b>WATCH HOT:</b> valid and active pair, but price is still mid-range or RR is not attractive enough.</p>
        <p><b>Radar:</b> one best representative per token to avoid duplicate ETH/SOL/ARB pairs taking over the list.</p>
      </div>

      <div className="flags">
        <h4>Validity / Danger Flags</h4>
        {item.flags.map((f, idx) => <span key={idx}>{f}</span>)}
      </div>

      <a className="dex-link" href={item.url} target="_blank" rel="noreferrer">
        Open live chart on DexScreener
      </a>
    </section>
  );
}

export default function App() {
  const [query, setQuery] = useState("ETH");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const [minLiquidity, setMinLiquidity] = useState(50_000);
  const [strictness, setStrictness] = useState("balanced");
  const [showRejected, setShowRejected] = useState(false);

  const opts = useMemo(() => ({
    minLiquidity,
    strictness,
    hideRejected: !showRejected
  }), [minLiquidity, strictness, showRejected]);

  function processPairs(pairs, q) {
    const analyzedRaw = (pairs || []).map(pair => analyzePair(pair, q, opts));
    const sanity = applyCrossPairSanity(analyzedRaw, q);

    const visible = sanity
      .filter(x => showRejected ? true : x.decision !== "FILTERED")
      .filter(x => {
        if (isContractQuery(q)) return true;
        return x.matchScore >= -2;
      });

    const uniq = new Map();
    visible.forEach(x => {
      const existing = uniq.get(x.id);
      if (!existing || finalRank(x) > finalRank(existing)) uniq.set(x.id, x);
    });

    return [...uniq.values()]
      .sort((a, b) => finalRank(b) - finalRank(a))
      .slice(0, 40);
  }


  function selectBestRepresentativeByToken(candidates) {
    const best = new Map();

    candidates.forEach((x) => {
      const key = String(x.token || "").toUpperCase();
      if (!key) return;
      const existing = best.get(key);
      if (!existing || finalRank(x) > finalRank(existing)) {
        best.set(key, x);
      }
    });

    return [...best.values()].sort((a, b) => finalRank(b) - finalRank(a));
  }

  async function searchToken(q = query) {
    const term = String(q || "").trim();
    if (!term) return;
    setLoading(true);
    setStatus(`Searching ${term}...`);
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(term)}`);
      if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
      const data = await res.json();
      const ranked = processPairs(data.pairs, term);
      setItems(ranked);
      setSelected(ranked[0] || null);
      setStatus(`Loaded ${ranked.length} filtered pairs for ${term}`);
    } catch (e) {
      setStatus(`Failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function radarScan() {
    setLoading(true);
    setStatus("Radar scanning universal watchlist...");
    try {
      const all = [];
      for (const token of RADAR_TOKENS) {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(token)}`);
        if (!res.ok) continue;
        const data = await res.json();
        all.push(...processPairs(data.pairs, token).slice(0, 3));
      }
      const uniq = new Map();
      all.forEach(x => {
        const existing = uniq.get(x.id);
        if (!existing || finalRank(x) > finalRank(existing)) uniq.set(x.id, x);
      });
      const representatives = selectBestRepresentativeByToken([...uniq.values()]);
      const ranked = representatives.slice(0, 40);
      setItems(ranked);
      setSelected(ranked[0] || null);
      setStatus(`Radar found ${ranked.length} best-token representatives`);
    } catch (e) {
      setStatus(`Radar failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const buy = items.filter(x => x.decision.includes("BUY")).length;
    const hot = items.filter(x => x.decision.includes("HOT")).length;
    const avoid = items.filter(x => x.decision.includes("AVOID") || x.decision.includes("CHASE") || x.decision.includes("FILTER") || x.decision.includes("LOW")).length;
    const avg = items.length ? Math.round(items.reduce((s, x) => s + x.execution, 0) / items.length) : 0;
    return { buy, hot, avoid, avg };
  }, [items]);

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">SNITCH X · Universal DEX Execution Cockpit v4</p>
          <h1>Buy only when execution is actually clean.</h1>
          <p className="sub">
            V3 adds major-quote priority, price anomaly detection, stronger weak-volume penalties,
            better ranking, and safer BUY SMALL conditions.
          </p>
        </div>
        <div className="hero-card">
          <span>Status</span>
          <b>{loading ? "Scanning..." : status}</b>
        </div>
      </header>

      <section className="toolbar">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && searchToken()} placeholder="Search token, pair or contract e.g. ETH, SOL, PEPE" />
        <select value={minLiquidity} onChange={e => setMinLiquidity(Number(e.target.value))}>
          <option value="0">No liquidity filter</option>
          <option value="50000">Min liquidity $50K</option>
          <option value="200000">Min liquidity $200K</option>
          <option value="1000000">Min liquidity $1M</option>
        </select>
        <select value={strictness} onChange={e => setStrictness(e.target.value)}>
          <option value="hunter">Hunter</option>
          <option value="balanced">Balanced</option>
          <option value="strict">Strict</option>
        </select>
        <button onClick={() => searchToken()} disabled={loading}>Search</button>
        <button className="secondary" onClick={radarScan} disabled={loading}>Run Radar</button>
      </section>

      <section className="toggle-row">
        <label>
          <input type="checkbox" checked={showRejected} onChange={e => setShowRejected(e.target.checked)} />
          Show rejected / bad-data pairs
        </label>
      </section>

      <section className="stats">
        <div><span>Pairs</span><b>{items.length}</b></div>
        <div><span>Buy Small</span><b>{stats.buy}</b></div>
        <div><span>Watch Hot</span><b>{stats.hot}</b></div>
        <div><span>Avoid/Low</span><b>{stats.avoid}</b></div>
        <div><span>Avg Execution</span><b>{stats.avg}</b></div>
      </section>

      <section className="layout">
        <div className="list">
          {items.length === 0 ? (
            <div className="empty">
              <h2>No pairs loaded yet</h2>
              <p>Search a token or run Radar. V4 is stricter: fewer BUY SMALL calls, cleaner watchlist, and less duplicate noise.</p>
            </div>
          ) : items.map(item => (
            <PairCard key={item.id} item={item} selected={selected?.id === item.id} onSelect={setSelected} />
          ))}
        </div>
        <Detail item={selected} />
      </section>
    </main>
  );
}
