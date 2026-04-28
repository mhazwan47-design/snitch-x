import { useMemo, useState } from "react";

const RADAR_TOKENS = [
  "ETH", "SOL", "BTC", "BNB", "XRP", "ARB", "ONDO", "TON", "SUI", "LINK",
  "DOGE", "PEPE", "WIF", "SEI", "FET", "RNDR", "AVAX", "OP", "INJ", "TIA"
];

const BLUE_CHIP_QUOTES = new Set([
  "USDC", "USDT", "WETH", "ETH", "WBTC", "BTC", "SOL", "WSOL", "BNB", "WBNB", "DAI", "USD"
]);

const MAJOR_DEX = new Set([
  "uniswap", "pancakeswap", "raydium", "orca", "meteora", "aerodrome", "camelot",
  "sushiswap", "curve", "balancer", "traderjoe", "quickswap"
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

  if (q === baseAddr || q === quoteAddr || q === pairAddr) return 35;
  if (q === baseSymbol) return 30;
  if (q === quoteSymbol) return 16;
  if (baseName === q) return 22;
  if (baseName.includes(q)) return 14;
  if (baseSymbol.includes(q)) return 10;
  if (quoteName.includes(q)) return 3;
  if (quoteSymbol.includes(q)) return 3;
  return -10;
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
  const minVolume = strictness === "strict" ? 50_000 : strictness === "hunter" ? 2_000 : 10_000;
  const minTx = strictness === "strict" ? 80 : strictness === "hunter" ? 8 : 25;

  if (!pair?.baseToken?.symbol || !pair?.quoteToken?.symbol) return "Missing token symbol";
  if (!pair?.pairAddress) return "Missing pair address";
  if (priceUsd <= 0) return "Invalid price";
  if (liq < minLiquidity) return `Liquidity below filter ${money(minLiquidity)}`;
  if (vol24 < minVolume) return `24H volume too low (${money(vol24)})`;
  if (tx24 < minTx) return `Too few 24H transactions (${tx24})`;

  if (liq >= 100_000_000 && vol24 < 100_000) return "Suspicious: huge liquidity but tiny volume";
  if (liq >= 10_000_000 && vol24 < 10_000) return "Suspicious: high liquidity but dead volume";
  if (liq > 0 && vol24 / liq < 0.00001 && liq > 1_000_000) return "Dead pool: volume/liquidity too low";

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
  const qScore = queryMatchScore(pair, query);
  const rejection = qualityRejectReason(pair, opts);

  let validity = 45 + qScore;
  if (liq >= 5_000_000) validity += 20;
  else if (liq >= 1_000_000) validity += 16;
  else if (liq >= 200_000) validity += 10;
  else if (liq >= 50_000) validity += 3;
  else validity -= 22;

  if (vol24 >= 10_000_000) validity += 18;
  else if (vol24 >= 1_000_000) validity += 13;
  else if (vol24 >= 100_000) validity += 7;
  else validity -= 15;

  if (tx24 >= 500) validity += 10;
  else if (tx24 >= 100) validity += 6;
  else if (tx24 < 25) validity -= 12;

  if (BLUE_CHIP_QUOTES.has(quote)) validity += 7;
  else validity -= 5;

  if (MAJOR_DEX.has(dex)) validity += 5;
  if (ageDays > 14) validity += 6;
  if (ageDays < 1) validity -= 6;

  let opportunity = 42 + qScore * 0.4;
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

  let execution = 44 + qScore * 0.25;
  if (h1 > -2 && h1 < 6) execution += 8;
  if (h6 > 0 && h6 < 15) execution += 12;
  if (h24 > 0 && h24 < 35) execution += 12;
  if (h1 > 12 || h6 > 30 || h24 > 80) execution -= 25;
  if (liq >= 200_000) execution += 8;
  if (vol6 >= 100_000) execution += 8;
  if (buyPressure >= 52 && buyPressure <= 70) execution += 6;
  if (tx24 >= 100) execution += 5;

  let risk = 42;
  if (liq < 100_000) risk += 22;
  if (vol24 < 100_000) risk += 15;
  if (tx24 < 25) risk += 14;
  if (ageDays < 2) risk += 12;
  if (h24 > 80) risk += 20;
  if (h24 < -35) risk += 18;
  if (fdv > 0 && liq > 0 && fdv / liq > 200) risk += 10;
  if (!BLUE_CHIP_QUOTES.has(quote)) risk += 6;
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
  if (rejection) flags.unshift(`Rejected reason if strict: ${rejection}`);

  let decision = "WAIT";
  let action = "Wait for support/retest confirmation.";
  let size = "0% now";

  if (rejection && opts.hideRejected !== false) {
    decision = "FILTERED";
    action = rejection;
    size = "0%";
  } else if (validity < 45 || risk > 78) {
    decision = "AVOID";
    action = "Avoid. Risk too high versus data quality.";
    size = "0%";
  } else if (execution >= 72 && validity >= 65 && risk <= 62 && rr >= 0.75) {
    decision = "BUY SMALL";
    action = "Small entry only after candle confirmation.";
    size = "0.5% - 1.5% capital";
  } else if (opportunity >= 70 && validity >= 55) {
    decision = "WATCH HOT";
    action = "Good candidate, but wait for clean trigger.";
    size = "0.25% - 1% after confirmation";
  } else if (h24 > 50 || h6 > 25) {
    decision = "DO NOT CHASE";
    action = "Wait pullback. Price is extended.";
    size = "0% now";
  }

  return {
    id: `${pair.chainId}-${pair.pairAddress}`,
    token: pair?.baseToken?.symbol || "UNKNOWN",
    name: pair?.baseToken?.name || "",
    quote: pair?.quoteToken?.symbol || "",
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
    levels: { support, resistance, buyLow, buyHigh, breakout, invalidation, tp1, tp2, rr },
    raw: pair
  };
}

function finalRank(x) {
  const decisionBoost =
    x.decision === "BUY SMALL" ? 30 :
    x.decision === "WATCH HOT" ? 18 :
    x.decision === "WAIT" ? 8 :
    x.decision === "DO NOT CHASE" ? -12 :
    x.decision === "AVOID" ? -20 : -35;

  return (
    x.matchScore * 1.8 +
    x.validity * 0.9 +
    x.execution * 1.15 +
    x.opportunity * 0.75 -
    x.risk * 0.85 +
    decisionBoost +
    Math.log10(Math.max(1, x.volume24h)) * 2 +
    Math.log10(Math.max(1, x.liquidityUsd)) * 1.2
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
  if (d.includes("AVOID") || d.includes("CHASE") || d.includes("FILTER")) return "avoid";
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
      </div>

      <div className="rule-box">
        <h4>Universal Filter Logic</h4>
        <p><b>Rejects:</b> dead volume, suspicious liquidity/volume mismatch, bad transaction count, invalid price, extreme pump/dump, weak maturity, FDV/liquidity imbalance.</p>
        <p><b>Buy only if:</b> price reacts near buy zone or breaks out then retests with improving volume.</p>
        <p><b>Cancel if:</b> price loses invalidation or volume fades while price drops.</p>
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
    const analyzed = (pairs || []).map(pair => analyzePair(pair, q, opts));

    const visible = analyzed
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
      const ranked = [...uniq.values()].sort((a, b) => finalRank(b) - finalRank(a)).slice(0, 40);
      setItems(ranked);
      setSelected(ranked[0] || null);
      setStatus(`Radar found ${ranked.length} filtered pairs`);
    } catch (e) {
      setStatus(`Radar failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const buy = items.filter(x => x.decision.includes("BUY")).length;
    const hot = items.filter(x => x.decision.includes("HOT")).length;
    const avoid = items.filter(x => x.decision.includes("AVOID") || x.decision.includes("CHASE") || x.decision.includes("FILTER")).length;
    const avg = items.length ? Math.round(items.reduce((s, x) => s + x.execution, 0) / items.length) : 0;
    return { buy, hot, avoid, avg };
  }, [items]);

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">SNITCH X · Universal DEX Execution Cockpit</p>
          <h1>Filter bad pairs before they waste your time.</h1>
          <p className="sub">
            Universal pair quality engine: liquidity-volume sanity, transaction count, FDV balance,
            trend extension, risk flags, buy zone, breakout, invalidation, and suggested sizing.
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
        <div><span>Avoid/Filtered</span><b>{stats.avoid}</b></div>
        <div><span>Avg Execution</span><b>{stats.avg}</b></div>
      </section>

      <section className="layout">
        <div className="list">
          {items.length === 0 ? (
            <div className="empty">
              <h2>No pairs loaded yet</h2>
              <p>Search a token or run Radar. Universal filters remove dead pools, fake-looking liquidity, weak volume, and low-quality pairs.</p>
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
