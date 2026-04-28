import { useMemo, useState } from "react";

const RADAR_TOKENS = ["ETH", "SOL", "ARB", "ONDO", "TON", "SUI", "LINK", "DOGE", "PEPE", "WIF", "SEI", "FET", "RNDR", "AVAX", "OP"];

function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}
function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }
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
function scoreClass(value, inverse = false) {
  const x = n(value);
  if (!inverse) return x >= 75 ? "good" : x >= 55 ? "mid" : "bad";
  return x <= 45 ? "good" : x <= 65 ? "mid" : "bad";
}
function decisionClass(decision) {
  const d = String(decision).toUpperCase();
  if (d.includes("BUY")) return "buy";
  if (d.includes("AVOID") || d.includes("CHASE")) return "avoid";
  if (d.includes("HOT")) return "hot";
  return "wait";
}
function firstUrl(pair) { return pair?.url || pair?.pairUrl || "#"; }

function analyzePair(pair) {
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
  const ageMs = Date.now() - n(pair?.pairCreatedAt, Date.now());
  const ageDays = Math.max(0, ageMs / 86400000);
  const buyPressure = txBuys + txSells > 0 ? (txBuys / (txBuys + txSells)) * 100 : 50;

  let validity = 50;
  if (liq >= 1_000_000) validity += 18; else if (liq >= 200_000) validity += 10; else if (liq < 50_000) validity -= 22;
  if (vol24 >= 5_000_000) validity += 16; else if (vol24 >= 500_000) validity += 8; else if (vol24 < 50_000) validity -= 18;
  if (pair?.chainId) validity += 4;
  if (pair?.dexId) validity += 4;
  if (ageDays < 1) validity -= 14;
  if (ageDays > 14) validity += 6;

  let opportunity = 45;
  if (vol24 >= 1_000_000) opportunity += 15;
  if (liq >= 250_000) opportunity += 10;
  if (fdv > 0 && fdv <= 50_000_000) opportunity += 12;
  if (fdv > 500_000_000) opportunity -= 8;
  if (h24 > 3 && h24 < 35) opportunity += 12;
  if (h6 > 1 && h6 < 18) opportunity += 8;
  if (h24 > 80) opportunity -= 18;
  if (h24 < -25) opportunity -= 12;
  if (buyPressure > 55) opportunity += 6;

  let execution = 45;
  if (h1 > -2 && h1 < 6) execution += 8;
  if (h6 > 0 && h6 < 15) execution += 12;
  if (h24 > 0 && h24 < 35) execution += 12;
  if (h1 > 12 || h6 > 30 || h24 > 80) execution -= 25;
  if (liq >= 200_000) execution += 8;
  if (vol6 >= 100_000) execution += 8;
  if (buyPressure >= 52 && buyPressure <= 70) execution += 6;

  let risk = 40;
  if (liq < 100_000) risk += 25;
  if (vol24 < 100_000) risk += 15;
  if (ageDays < 2) risk += 16;
  if (h24 > 80) risk += 20;
  if (h24 < -35) risk += 18;
  if (fdv > 0 && liq > 0 && fdv / liq > 200) risk += 10;

  validity = clamp(validity); opportunity = clamp(opportunity); execution = clamp(execution); risk = clamp(risk);

  const support = p > 0 ? p * (h24 >= 0 ? 0.965 : 0.94) : 0;
  const resistance = p > 0 ? p * (h24 >= 0 ? 1.045 : 1.03) : 0;
  const buyLow = support * 0.995;
  const buyHigh = support * 1.015;
  const breakout = resistance * 1.006;
  const invalidation = support * 0.965;
  const tp1 = p > 0 ? p * 1.055 : 0;
  const tp2 = p > 0 ? p * 1.11 : 0;
  const rr = p > 0 && invalidation > 0 ? Math.abs(tp1 - p) / Math.abs(p - invalidation) : 0;

  const flags = [];
  if (liq < 100_000) flags.push("Liquidity weak");
  if (vol24 < 100_000) flags.push("Volume weak");
  if (ageDays < 2) flags.push("Very new pair");
  if (h24 > 80) flags.push("Already pumped");
  if (h24 < -35) flags.push("Heavy drawdown");
  if (fdv > 0 && liq > 0 && fdv / liq > 200) flags.push("FDV/liquidity imbalance");
  if (buyPressure < 45) flags.push("Sell pressure heavier");
  if (!flags.length) flags.push("No major red flag from public pair data");

  let decision = "WAIT";
  let action = "Wait for support/retest confirmation";
  let size = "0% now";
  if (validity < 45 || risk > 78) { decision = "AVOID"; action = "Avoid. Risk too high versus data quality."; size = "0%"; }
  else if (execution >= 72 && validity >= 65 && risk <= 62 && rr >= 0.75) { decision = "BUY SMALL"; action = "Small entry only after candle confirmation."; size = "0.5% - 1.5% capital"; }
  else if (opportunity >= 70 && validity >= 55) { decision = "WATCH HOT"; action = "Good candidate, but wait for clean trigger."; size = "0.25% - 1% after confirmation"; }
  else if (h24 > 50 || h6 > 25) { decision = "DO NOT CHASE"; action = "Wait pullback. Price is extended."; size = "0% now"; }

  return {
    id: `${pair.chainId}-${pair.pairAddress}`,
    token: pair?.baseToken?.symbol || "UNKNOWN", name: pair?.baseToken?.name || "", quote: pair?.quoteToken?.symbol || "",
    pairLabel: `${pair?.baseToken?.symbol || "?"}/${pair?.quoteToken?.symbol || "?"}`,
    chain: pair?.chainId || "unknown", dex: pair?.dexId || "unknown", url: firstUrl(pair),
    priceUsd: p, liquidityUsd: liq, volume24h: vol24, fdv, marketCap: cap,
    h1, h6, h24, buyPressure, ageDays, validity, opportunity, execution, risk,
    decision, action, size, flags,
    levels: { support, resistance, buyLow, buyHigh, breakout, invalidation, tp1, tp2, rr }
  };
}

function ScorePill({ label, value, inverse = false }) {
  return <div className={`score ${scoreClass(value, inverse)}`}><span>{label}</span><b>{Math.round(n(value))}</b></div>;
}
function PairCard({ item, onSelect, selected }) {
  return <button className={`pair-card ${selected ? "selected" : ""}`} onClick={() => onSelect(item)}>
    <div className="pair-top"><div><h3>{item.token}</h3><p>{item.pairLabel} · {item.chain} · {item.dex}</p></div><span className={`decision ${decisionClass(item.decision)}`}>{item.decision}</span></div>
    <div className="pair-price"><b>${price(item.priceUsd)}</b><span className={item.h24 >= 0 ? "up" : "down"}>24H {pct(item.h24)}</span></div>
    <div className="score-grid"><ScorePill label="Opp" value={item.opportunity} /><ScorePill label="Exec" value={item.execution} /><ScorePill label="Valid" value={item.validity} /><ScorePill label="Risk" value={item.risk} inverse /></div>
    <div className="mini-grid"><div><span>Liquidity</span><b>{money(item.liquidityUsd)}</b></div><div><span>Volume</span><b>{money(item.volume24h)}</b></div><div><span>FDV</span><b>{money(item.fdv)}</b></div><div><span>Buy Flow</span><b>{Math.round(item.buyPressure)}%</b></div></div>
  </button>;
}
function Detail({ item }) {
  if (!item) return <section className="panel sticky-panel"><h2>Action Detail</h2><p className="muted">Search or run Radar, then select a pair.</p></section>;
  const l = item.levels;
  return <section className="panel sticky-panel">
    <div className="detail-head"><div><h2>{item.token} Execution Plan</h2><p>{item.pairLabel} · {item.chain} · {item.dex}</p></div><span className={`decision big ${decisionClass(item.decision)}`}>{item.decision}</span></div>
    <div className="answer-box"><span>Can buy now?</span><b>{item.decision}</b><p>{item.action}</p></div>
    <div className="detail-grid"><div><span>Suggested size</span><b>{item.size}</b></div><div><span>Current price</span><b>${price(item.priceUsd)}</b></div><div><span>Buy zone</span><b>${price(l.buyLow)} – ${price(l.buyHigh)}</b></div><div><span>Breakout</span><b>${price(l.breakout)}</b></div><div><span>Invalidation</span><b>${price(l.invalidation)}</b></div><div><span>TP1 / TP2</span><b>${price(l.tp1)} / ${price(l.tp2)}</b></div><div><span>RR estimate</span><b>1:{l.rr.toFixed(2)}</b></div><div><span>Age</span><b>{item.ageDays.toFixed(1)} days</b></div></div>
    <div className="rule-box"><h4>Trigger Rule</h4><p><b>Buy only if:</b> price reacts near buy zone or breaks out then retests with improving volume.</p><p><b>Cancel if:</b> price loses invalidation or 24H volume fades while price drops.</p><p><b>Do not:</b> chase a vertical candle. This cockpit is a filter, final chart confirmation still matters.</p></div>
    <div className="flags"><h4>Validity / Danger Flags</h4>{item.flags.map((f, idx) => <span key={idx}>{f}</span>)}</div>
    <a className="dex-link" href={item.url} target="_blank" rel="noreferrer">Open live chart on DexScreener</a>
  </section>;
}

export default function App() {
  const [query, setQuery] = useState("ETH");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const [minLiquidity, setMinLiquidity] = useState(50000);

  async function searchToken(q = query) {
    const term = String(q || "").trim();
    if (!term) return;
    setLoading(true); setStatus(`Searching ${term}...`);
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(term)}`);
      if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
      const data = await res.json();
      const analyzed = (data.pairs || []).map(analyzePair).filter(x => x.liquidityUsd >= minLiquidity).sort((a, b) => (b.execution + b.opportunity + b.validity - b.risk) - (a.execution + a.opportunity + a.validity - a.risk)).slice(0, 30);
      setItems(analyzed); setSelected(analyzed[0] || null); setStatus(`Loaded ${analyzed.length} pairs for ${term}`);
    } catch (e) { setStatus(`Failed: ${e.message}`); } finally { setLoading(false); }
  }
  async function radarScan() {
    setLoading(true); setStatus("Radar scanning major watchlist...");
    try {
      const all = [];
      for (const token of RADAR_TOKENS) {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(token)}`);
        if (!res.ok) continue;
        const data = await res.json();
        all.push(...(data.pairs || []).map(analyzePair).filter(x => x.liquidityUsd >= minLiquidity).sort((a, b) => (b.execution + b.opportunity + b.validity - b.risk) - (a.execution + a.opportunity + a.validity - a.risk)).slice(0, 2));
      }
      const uniq = new Map(); all.forEach(x => uniq.set(x.id, x));
      const ranked = [...uniq.values()].sort((a, b) => (b.execution + b.opportunity + b.validity - b.risk) - (a.execution + a.opportunity + a.validity - a.risk)).slice(0, 40);
      setItems(ranked); setSelected(ranked[0] || null); setStatus(`Radar found ${ranked.length} usable pairs`);
    } catch (e) { setStatus(`Radar failed: ${e.message}`); } finally { setLoading(false); }
  }
  const stats = useMemo(() => ({
    buy: items.filter(x => x.decision.includes("BUY")).length,
    hot: items.filter(x => x.decision.includes("HOT")).length,
    avoid: items.filter(x => x.decision.includes("AVOID") || x.decision.includes("CHASE")).length,
    avg: items.length ? Math.round(items.reduce((s, x) => s + x.execution, 0) / items.length) : 0
  }), [items]);

  return <main>
    <header className="hero"><div><p className="eyebrow">SNITCH X · DEX Execution Cockpit</p><h1>Find opportunities faster than raw DexScreener.</h1><p className="sub">Live DEX search with decision scoring, risk flags, buy zone, breakout, invalidation, and suggested sizing.</p></div><div className="hero-card"><span>Status</span><b>{loading ? "Scanning..." : status}</b></div></header>
    <section className="toolbar"><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && searchToken()} placeholder="Search token, pair or contract e.g. ETH, SOL, PEPE" /><select value={minLiquidity} onChange={e => setMinLiquidity(Number(e.target.value))}><option value="0">No liquidity filter</option><option value="50000">Min liquidity $50K</option><option value="200000">Min liquidity $200K</option><option value="1000000">Min liquidity $1M</option></select><button onClick={() => searchToken()} disabled={loading}>Search</button><button className="secondary" onClick={radarScan} disabled={loading}>Run Radar</button></section>
    <section className="stats"><div><span>Pairs</span><b>{items.length}</b></div><div><span>Buy Small</span><b>{stats.buy}</b></div><div><span>Watch Hot</span><b>{stats.hot}</b></div><div><span>Avoid/No Chase</span><b>{stats.avoid}</b></div><div><span>Avg Execution</span><b>{stats.avg}</b></div></section>
    <section className="layout"><div className="list">{items.length === 0 ? <div className="empty"><h2>No pairs loaded yet</h2><p>Search a token or run Radar. This fresh version does not use static JSON or collector.py.</p></div> : items.map(item => <PairCard key={item.id} item={item} selected={selected?.id === item.id} onSelect={setSelected} />)}</div><Detail item={selected} /></section>
  </main>;
}
