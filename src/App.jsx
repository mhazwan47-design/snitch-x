import { useEffect, useMemo, useState } from "react";

const REMOTE = `${import.meta.env.BASE_URL || "/"}tracker-db.json`;
const INVEST_STORE = "snitch_x_v10_6_investment_diary";

const CURATED_LIST_PAIRS = new Set(["CETUS/USDC","VIRTUAL/USDC","AI/USDC","BONK/USDC","DEEP/USDC","CAKE/USDT","JLP/USDC","TRX/USDC","ATOM/USDC","SEI/USDC","OP/USDC","ARB/USDC","ETH/USDT","ETH/USDC","BTC/USDC","USDY/USDC","ALGO/USDC","VIRTUAL/WETH","ONDO/WETH","RENDER/SOL","POPCAT/SOL","MEW/SOL","BONK/SOL","PENDLE/WETH","CRV/WETH","LDO/WETH","ENA/WETH","MOG/WETH","PEPE/WETH","AAVE/WETH","UNI/WETH","PYTH/SOL","JUP/SOL","OP/WETH","ARB/WETH","LINK/WETH"]);
const CURATED_LIST_TOKENS = new Set(["AAVE","AI","ALGO","ARB","ATOM","BONK","BTC","CAKE","CETUS","CRV","DEEP","ENA","ETH","JLP","JUP","LDO","LINK","MEW","MOG","ONDO","OP","PENDLE","PEPE","POPCAT","PYTH","RENDER","SEI","SOL","TRX","UNI","USDC","USDT","USDY","VIRTUAL"]);
const BINANCE_USDC_VALID_TOKENS = new Set(["ALGO","ARB","ATOM","BONK","BTC","CETUS","DEEP","ETH","OP","SEI","TRX","VIRTUAL"]);
const BINANCE_USDC_BLOCK_TOKENS = new Set(["AAVE","AI","CAKE","CRV","ENA","JLP","JUP","LDO","LINK","MEW","MOG","ONDO","PENDLE","PEPE","POPCAT","PYTH","RENDER","UNI","USDY"]);
function binanceTradeUrl(token, quote="USDT", market="SPOT"){
  const t=String(token||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  const q=String(quote||"USDT").toUpperCase().replace(/[^A-Z0-9]/g,"");
  const m=String(market||"SPOT").toUpperCase();
  const symbol=`${t}${q}`;
  if(m.includes("FUTURES") || m.includes("PERP")) return `https://www.binance.com/en/futures/${symbol}`;
  return `https://www.binance.com/en/trade/${t}_${q}?type=spot`;
}
function isCuratedToken(token){
  return CURATED_LIST_TOKENS.has(String(token||"").toUpperCase());
}
function isConfirmedBinanceUsdc(token){
  const t=String(token||"").toUpperCase();
  if(BINANCE_USDC_BLOCK_TOKENS.has(t)) return false;
  return BINANCE_USDC_VALID_TOKENS.has(t);
}


function n(v, f=0){ const x=Number(v); return Number.isFinite(x)?x:f; }
function txt(v){
  if(v == null) return "";
  if(typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if(Array.isArray(v)) return v.map(txt).join(", ");
  if(typeof v === "object"){
    if(v.routeButton) return String(v.routeButton);
    if(v.routeMode || v.routePair) return `${v.routeMode || "Route"} ${v.routePair || ""}`.trim();
    if(v.label) return String(v.label);
    if(v.name) return String(v.name);
    try{return JSON.stringify(v)}catch{return "[object]"}
  }
  return String(v);
}
function price(v){
  const x=n(v);
  if(x>=1000) return x.toFixed(2);
  if(x>=100) return x.toFixed(2);
  if(x>=10) return x.toFixed(3);
  if(x>=1) return x.toFixed(4);
  if(x>=0.1) return x.toFixed(5);
  if(x>=0.01) return x.toFixed(6);
  return x.toFixed(8);
}
function money(v){
  const x=n(v, NaN);
  if(!Number.isFinite(x)) return "$0.00";
  if(Math.abs(x)>=1e9) return `$${(x/1e9).toFixed(2)}B`;
  if(Math.abs(x)>=1e6) return `$${(x/1e6).toFixed(2)}M`;
  if(Math.abs(x)>=1e3) return `$${(x/1e3).toFixed(2)}K`;
  return `$${x.toFixed(2)}`;
}
function pctFrom(a,b){ a=n(a); b=n(b); return a>0 ? ((b-a)/a)*100 : 0; }
function tokenOf(r){ return String(r?.token || String(r?.pairLabel||"").split("/")[0] || "").toUpperCase().replace(/[^A-Z0-9]/g,""); }
function binanceUrl(token, quote="USDT"){ return binanceTradeUrl(token, quote); }
function okxUrl(token){ return `https://www.okx.com/trade-spot/${String(token||"").toLowerCase()}-usdt`; }
function bybitUrl(token){ return `https://www.bybit.com/trade/spot/${String(token||"").toUpperCase()}/USDT`; }
function splitPair(pair){
  const p=String(pair||"").toUpperCase().replace("-","/").split("/");
  return {base:p[0]||"", quote:p[1]||""};
}
function marketLabel(r){
  const m=String(r?.marketType||r?.market||"").toUpperCase();
  if(m.includes("PERP")) return "PERP";
  if(m.includes("FUTURES")) return "FUTURES";
  if(m.includes("MARGIN")) return "MARGIN";
  return "SPOT";
}
function executionLabel(r){
  const side=String(r?.signalType||"").toUpperCase()==="SELL"?"SELL":"BUY";
  return `${side} ${marketLabel(r)}`;
}
function measuredCostPct(r){
  return n(r?.actualCostPct || r?.measuredAudit?.actualCostPct, 999);
}
function hasMeasuredAudit(r){
  return !!(r?.measuredAudit && n(r?.measuredNetProfitUsd, -999) > -999 && n(r?.feeBps, -1) >= 0);
}
function routeInfo(r){
  const {base, quote}=splitPair(r?.pairLabel);
  const token=tokenOf(r)||base;
  const q=String(quote||r?.quoteAsset||"USDT").toUpperCase();
  const m=marketLabel(r);
  const routePair=`${token}/${q||"USDT"}`;
  if(r?.url && String(r?.source||"").includes("binance")){
    return {routeMode:`Binance ${m}`, routePair, routeUrl:r.url, routeButton:`Open Binance ${routePair} ${m}`, routePenalty:0, routeWarning:""};
  }
  if(m==="FUTURES" || m==="PERP"){
    return {routeMode:`Binance ${m}`, routePair:`${token}/${q||"USDT"}`, routeUrl:binanceTradeUrl(token,q||"USDT",m), routeButton:`Open Binance ${token}/${q||"USDT"} ${m}`, routePenalty:0, routeWarning:""};
  }
  if(q==="USDC"){
    if(isConfirmedBinanceUsdc(token)){
      return {routeMode:"Binance SPOT", routePair:`${token}/USDC`, routeUrl:binanceTradeUrl(token,"USDC","SPOT"), routeButton:`Open Binance ${token}/USDC SPOT`, routePenalty:0, routeWarning:""};
    }
    return {routeMode:"Binance SPOT Mirror", routePair:`${token}/USDT`, routeUrl:binanceTradeUrl(token,"USDT","SPOT"), routeButton:`Open Binance ${token}/USDT SPOT`, routePenalty:30, routeWarning:`${token}/USDC not confirmed; using USDT mirror.`};
  }
  if(["USDT","FDUSD","TUSD","DAI","BTC","ETH","BNB","TRY","EUR","BRL"].includes(q)){
    return {routeMode:`Binance ${m}`, routePair:`${token}/${q}`, routeUrl:binanceTradeUrl(token,q,m), routeButton:`Open Binance ${token}/${q} ${m}`, routePenalty:0, routeWarning:""};
  }
  return {routeMode:"Chart Only", routePair:r?.pairLabel||token, routeUrl:r?.url||"#", routeButton:"Open Chart", routePenalty:180, routeWarning:"No safe Binance route"};
}

function bucketOf(r){
  const t=tokenOf(r);
  const high=new Set(["PEPE","WIF","BONK","FLOKI","SHIB","1000SATS","1000CAT","ACT","PNUT","MEME","TURBO","BOME","MEW","POPCAT","MOG","GOAT","PENGU","DOGS","NOT"]);
  const narr=new Set(["AI","AIXBT","VIRTUAL","GRASS","KAITO","BERA","ZRO","AEVO","EIGEN","ALT","ARKM","CETUS","DEEP","FET","RNDR","RENDER","WLD","ONDO"]);
  if(high.has(t)) return "HIGH VOL";
  if(narr.has(t)) return "NARRATIVE";
  if(["BTC","ETH","SOL","SUI","SEI","ARB","OP","DOGE","LINK","AVAX","BNB","XRP","ATOM","UNI","AAVE","INJ","TIA","JUP","PYTH"].includes(t)) return "CEX SAFE";
  return "WILD CARD";
}
function age(iso){
  const t=new Date(iso||0).getTime();
  if(!t) return "n/a";
  const mins=Math.max(0, Math.floor((Date.now()-t)/60000));
  if(mins<60) return `${mins}m`;
  const h=Math.floor(mins/60);
  return h<48?`${h}h`:`${Math.floor(h/24)}d`;
}
function isSuccess(r){ return !!(r?.hitTP1 || r?.hitTP2 || String(r?.resultStatus||"").includes("SUCCESS") || String(r?.result||"").includes("WIN")); }
function isInvalid(r){ return !!(r?.hitInvalid || r?.hitInvalidation || String(r?.result||"").includes("FAILED") || String(r?.status||"").includes("INVALID")); }
function stillValid(r){
  if(!r || !(r.signalType==="BUY" || r.signalType==="SELL")) return false;
  if(isSuccess(r) || isInvalid(r)) return false;
  const p=n(r.currentPrice||r.signalPrice), tp1=n(r.tp1), inv=n(r.invalidation);
  if(!p) return false;
  if(String(r.securityStatus||"").includes("BLOCKED")) return false;
  if(r.signalType==="BUY"){
    if(tp1 && p>=tp1) return false;
    if(inv && p<=inv) return false;
  } else {
    if(tp1 && p<=tp1) return false;
    if(inv && p>=inv) return false;
  }
  return true;
}
function pnlMetrics(r, capital=10){
  const entry=n(r.currentPrice||r.signalPrice);
  const tp1=n(r.tp1), tp2=n(r.tp2), inv=n(r.invalidation);
  const isSell=r.signalType==="SELL";
  const tp1Pct=isSell ? ((entry-tp1)/entry)*100 : ((tp1-entry)/entry)*100;
  const tp2Pct=isSell ? ((entry-tp2)/entry)*100 : ((tp2-entry)/entry)*100;
  const invPct=isSell ? ((entry-inv)/entry)*100 : ((inv-entry)/entry)*100;
  return {
    tp1Pct:n(tp1Pct), tp2Pct:n(tp2Pct), invalidPct:n(invPct),
    tp1Profit:n(capital)*n(tp1Pct)/100,
    tp2Profit:n(capital)*n(tp2Pct)/100,
    invalidLoss:n(capital)*n(invPct)/100
  };
}
function actionFor(r, capital=10, mode="EXTREME"){
  const sec=n(r.securityScore || r.security?.securityScore);
  const m=String(mode||"EXTREME").toUpperCase();
  const b=String(r?.sourceBucket || (Array.isArray(r?.sourceBuckets)?r.sourceBuckets.join(" + "):bucketOf(r)) || bucketOf(r));
  const met=pnlMetrics(r, capital);
  const risk=Math.abs(n(r?.measuredRiskPct || met.invalidPct));
  const reward=n(r?.measuredRewardPct || met.tp1Pct);
  const cost=measuredCostPct(r);
  const label=executionLabel(r);
  const netUsd=n(r?.measuredNetProfitUsd, -999);
  if(isInvalid(r)) return {...met, label:"", size:0, score:0, reason:"Invalidated.", bucket:b};
  if(isSuccess(r)) return {...met, label:"", size:0, score:0, reason:"TP already hit.", bucket:b};
  if(String(r?.source||"").includes("binance") && !hasMeasuredAudit(r)) return {...met, label:"", size:0, score:0, reason:"Hidden: missing measured audit data.", bucket:b};
  if(cost>=999) return {...met, label:"", size:0, score:0, reason:"Hidden: actual cost data missing.", bucket:b};
  if(netUsd < 0.50) return {...met, label:"", size:0, score:0, reason:"Hidden: measured net profit below minimum.", bucket:b};
  if(risk<=0 || reward<=risk) return {...met, label:"", size:0, score:0, reason:"Hidden: SL/TP geometry failed.", bucket:b};
  if(sec<62) return {...met, label:"", size:0, score:0, reason:"Hidden: security/quality gate failed.", bucket:b};
  let score = 50 + sec*0.45 + n(r.execution)*0.40 + n(r.opportunity)*0.35 - n(r.risk)*0.20 + reward*1.4 + netUsd*10 - cost*3.0;
  if(r.hitTrigger) score+=10;
  if(r.hitZone) score+=6;
  if(String(b).includes("HOT")) score+=6;
  if(String(b).includes("TOP_GAINER") || String(b).includes("TOP_LOSER")) score+=7;
  if(String(b).includes("NEW_LISTING")) score+=4;
  if(marketLabel(r)==="SPOT") score+=4;
  if(marketLabel(r)==="PERP"||marketLabel(r)==="FUTURES") score+=3;
  if(m==="BALANCED" && risk>8) score-=12;
  if(m==="AGGRESSIVE") score+=4;
  if(m==="EXTREME") score+=7;
  if(score<105) return {...met, label:"", size:0, score:Math.round(score), reason:"Hidden: not strong enough for execution now.", bucket:b};
  const minTrade=10;
  const cap=n(capital);
  if(cap<minTrade) return {...met, label:"", size:0, score:Math.round(score), reason:"Capital below practical $10 minimum.", bucket:b};
  const sizePct=score>=145?0.70:score>=130?0.50:score>=118?0.35:0.25;
  const size=Math.max(minTrade, Math.min(cap, cap*sizePct));
  return {...met, label, size, score:Math.round(score), reason:`Passed measured-data filter. Net $${netUsd.toFixed(2)} after actual fee/spread/depth.`, bucket:b};
}
function orderFields(r, size){
  const entry=n(r.currentPrice||r.signalPrice);
  const qty=entry>0?n(size)/entry:0;
  const slTrig=n(r.invalidation || r?.measuredAudit?.sl);
  const slPrice=slTrig;
  return {tp:n(r.tp1 || r?.measuredAudit?.tp), tp2:n(r.tp2 || r?.measuredAudit?.tp), slTrig, slPrice, qty};
}
function copy(text){ try{navigator.clipboard.writeText(String(text||""));}catch{} }

function diaryKeys(investments){
  const s=new Set();
  (investments||[]).filter(x=>x.status!=="CLOSED").forEach(x=>{
    const token=String(x.token||String(x.pairLabel||"").split("/")[0]||"").toUpperCase();
    const pair=String(x.pairLabel||"").toUpperCase();
    const routePair=String(x.routePair||"").toUpperCase();
    if(token) s.add(`TOKEN:${token}`);
    if(pair) s.add(`PAIR:${pair}`);
    if(routePair) s.add(`PAIR:${routePair}`);
  });
  return s;
}
function isInDiary(r, investments){
  const keys=diaryKeys(investments);
  const token=tokenOf(r);
  const pair=String(r?.pairLabel||"").toUpperCase();
  const rt=routeInfo(r);
  return keys.has(`TOKEN:${token}`)||keys.has(`PAIR:${pair}`)||keys.has(`PAIR:${String(rt.routePair||"").toUpperCase()}`);
}
function safeUpdated(r){
  return new Date(r?.lastUpdated||r?.trackedAt||r?.completedAt||0).getTime() || 0;
}
function successCoin(r){
  return tokenOf(r)||String(r?.pairLabel||"").split("/")[0]||"UNKNOWN";
}
function successPct(r){
  const entry=n(r.signalPrice||r.entryPrice||0);
  const current=n(r.currentPrice||r.tp2||r.tp1||0);
  if(!entry||!current) return 0;
  return ((current-entry)/entry)*100;
}
function groupSuccess(records){
  const map=new Map();
  records.filter(isSuccess).forEach(r=>{
    const c=successCoin(r);
    const row=map.get(c)||{coin:c,count:0,tp1:0,tp2:0,totalPct:0,bestPct:-999,worstPct:999};
    row.count++;
    if(r.hitTP2||String(r.successLevel||r.resultStatus||"").includes("TP2")) row.tp2++; else row.tp1++;
    const p=successPct(r);
    row.totalPct+=p; row.bestPct=Math.max(row.bestPct,p); row.worstPct=Math.min(row.worstPct,p);
    map.set(c,row);
  });
  return [...map.values()].map(x=>({...x,avgPct:x.count?x.totalPct/x.count:0})).sort((a,b)=>b.count-a.count||b.avgPct-a.avgPct);
}


function Header({status, sync}){
  return <header className="hero">
    <div>
      <p className="eyebrow">SNITCH X · Real Data Execution Radar v10.20.2</p>
      <h1>Real Data Execution Radar live</h1>
      <p className="sub">Scans Binance opportunities with measured-data gates, hides weak setups, and displays only direct BUY/SELL execution actions.</p>
    </div>
    <div className="hero-card sync-card">
      <span>Status</span>
      <b>{txt(status)}</b>
      <button className="mini-btn sync-now" onClick={sync}>Sync Now</button>
    </div>
  </header>
}
function Guides(){
  return <>
    <section className="binance-guide">
      <div><b>Binance TP/SL wording</b><span>Use these exact fields in Binance popup.</span></div>
      <div><b>TP Limit</b><span>Take-profit sell price</span></div>
      <div><b>SL Trigger</b><span>Price that activates stop-loss</span></div>
      <div><b>SL Price</b><span>Sell limit price after trigger</span></div>
      <div><b>Amount</b><span>Coin quantity / Max</span></div>
    </section>
    <section className="binance-guide route-guide">
      <div><b>Route Safety Guide</b><span>All route objects are rendered as text.</span></div>
      <div><b>Binance Direct</b><span>USDT direct or confirmed USDC pair only.</span></div>
      <div><b>Binance Mirror</b><span>USDC not confirmed or DEX pair differs; Binance opens token/USDT.</span></div>
      <div><b>Chart Only</b><span>No safe CEX route.</span></div>
      <div><b>Original Chart</b><span>Source chart remains separate.</span></div>
    </section>
  </>
}
function Stats({records, investments}){
  const active=records.filter(stillValid);
  const succ=records.filter(isSuccess);
  return <section className="stats lab-stats">
    <div><span>Active Valid</span><b>{active.length}</b></div>
    <div><span>Success</span><b>{succ.length}</b></div>
    <div><span>BUY Action</span><b>{active.filter(x=>x.signalType==="BUY").length}</b></div>
    <div><span>SELL Action</span><b>{active.filter(x=>x.signalType==="SELL").length}</b></div>
    <div><span>Diary</span><b>{investments.length}</b></div>
  </section>
}

function Scanner({records}){
  const [bucket,setBucket]=useState("ALL");
  const [route,setRoute]=useState("ALL");
  const rows=useMemo(()=>{
    let a=records.filter(stillValid);
    if(bucket!=="ALL") a=a.filter(r=>bucketOf(r)===bucket);
    if(route!=="ALL") a=a.filter(r=>routeInfo(r).routeMode===route);
    return a.slice(0,100);
  },[records,bucket,route]);
  return <section className="performance-lab">
    <div className="lab-head"><div><p className="eyebrow">Scanner</p><h2>Fresh active records</h2><p className="muted">Only current valid records from tracker-db.json.</p></div></div>
    <div className="lab-filters">
      <select value={bucket} onChange={e=>setBucket(e.target.value)}><option>ALL</option><option>CEX SAFE</option><option>HIGH VOL</option><option>NARRATIVE</option><option>WILD CARD</option></select>
      <select value={route} onChange={e=>setRoute(e.target.value)}><option>ALL</option><option>Binance Direct</option><option>Binance Mirror</option><option>Chart Only</option></select>
    </div>
    <div className="table-wrap"><table className="tracker-table"><thead><tr><th>Pair</th><th>Signal</th><th>Bucket</th><th>Current</th><th>TP1/TP2</th><th>Invalid</th><th>Route</th><th>Age</th></tr></thead><tbody>
      {rows.length===0?<tr><td colSpan={8} className="empty-cell">No fresh rows. Run GitHub Actions tracker.</td></tr>:rows.map(r=>{const rt=routeInfo(r);return <tr key={r.id}>
        <td><a href={r.url} target="_blank" rel="noreferrer">{txt(r.pairLabel)}</a><small>{txt(r.chain)} · {txt(r.dex)}</small></td>
        <td><span className={`signal-pill ${r.signalType==="SELL"?"sell":"buy"}`}>{txt(r.signalType)}</span><small>{txt(r.category)} · {txt(r.securityStatus)} {n(r.securityScore)}</small></td>
        <td><span className="bucket-pill">{txt(bucketOf(r))}</span></td>
        <td>${price(r.currentPrice||r.signalPrice)}</td>
        <td>${price(r.tp1)} / ${price(r.tp2)}</td>
        <td>${price(r.invalidation)}</td>
        <td><a className="action-link" href={rt.routeUrl} target="_blank" rel="noreferrer">{txt(rt.routeButton)}</a><small>{txt(rt.routeMode)} → {txt(rt.routePair)}</small>{rt.routeWarning?<small className="route-warning">{txt(rt.routeWarning)}</small>:null}</td>
        <td>{age(r.lastUpdated||r.trackedAt)}</td>
      </tr>})}
    </tbody></table></div>
  </section>
}

function TradeAction({records, investments, setInvestments}){
  const [capital,setCapital]=useState(10);
  const [mode,setMode]=useState("EXTREME");
  const [filter,setFilter]=useState("BEST");
  const rows=useMemo(()=>{
    const map=new Map();
    records.filter(r=>stillValid(r)&&!isInDiary(r,investments)).map(r=>{
      const a=actionFor(r,n(capital),mode);
      const rt=routeInfo(r);
      const curatedBoost=(CURATED_LIST_PAIRS.has(String(r.pairLabel||"").toUpperCase())||isCuratedToken(tokenOf(r)))?10:0; const binanceBoost=String(rt.routeMode||"").startsWith("Binance")?35:-80; const score=a.score + n(r.securityScore) + curatedBoost + binanceBoost - n(rt.routePenalty||0);
      return {...r,a,rt,score};
    }).filter(x=>x.a.size>0).sort((a,b)=>b.score-a.score).forEach(x=>{
      const key=`${tokenOf(x)}`;
      const old=map.get(key);
      if(!old || x.score>old.score) map.set(key,x);
    });
    let out=[...map.values()];
    if(filter==="BUY") out=out.filter(x=>x.a.label.startsWith("BUY"));
    if(filter==="SELL") out=out.filter(x=>x.a.label.startsWith("SELL"));
    if(filter==="SPOT") out=out.filter(x=>x.a.label.includes("SPOT"));
    if(filter==="MARGIN") out=out.filter(x=>x.a.label.includes("MARGIN"));
    if(filter==="FUTURES") out=out.filter(x=>x.a.label.includes("FUTURES")||x.a.label.includes("PERP"));
    return out.slice(0,50);
  },[records,capital,mode,filter]);
  const totals=rows.reduce((s,r)=>({size:s.size+n(r.a.size),tp1:s.tp1+n(r.a.tp1Profit),tp2:s.tp2+n(r.a.tp2Profit),risk:s.risk+n(r.a.invalidLoss)}),{size:0,tp1:0,tp2:0,risk:0});
  function mark(r){
    const f=orderFields({...r,actionLabel:r.a.label},r.a.size);
    const clickedAt=new Date().toISOString(); const clickedPrice=n(r.currentPrice||r.signalPrice); const item={diaryId:`${r.id}-${Date.now()}`,id:r.id,pairLabel:r.rt.routePair||r.pairLabel,sourcePairLabel:r.pairLabel,token:tokenOf(r),url:r.url,entryPrice:clickedPrice,clickedPrice,investedCapital:n(r.a.size),quantity:f.qty,tp1:n(r.tp1),tp2:n(r.tp2),stopTrigger:f.slTrig,stopLimit:f.slPrice,stopPrice:n(r.invalidation),status:"ACTIVE",createdAt:clickedAt,clickedAt,updatedAt:clickedAt,actionLabel:r.a.label, routeMode:r.rt.routeMode, routePair:r.rt.routePair};
    const next=[item,...investments];
    setInvestments(next);
    localStorage.setItem(INVEST_STORE,JSON.stringify(next));
  }
  function copyRows(){
    const text=rows.map((r,i)=>{const f=orderFields({...r,actionLabel:r.a.label},r.a.size);return `${i+1}. ${r.pairLabel} | ${r.a.label} | $${r.a.size.toFixed(2)}
TP Limit: ${price(f.tp)}
SL Trigger: ${price(f.slTrig)}
SL Price: ${price(f.slPrice)}
Amount: ${f.qty.toPrecision(6)} ${tokenOf(r)}
Route: ${r.rt.routeMode} ${r.rt.routePair}`;}).join("\n\n");
    copy(text);
  }
  return <section className="trade-center">
    <div className="lab-head"><div><p className="eyebrow">SNITCH Execution Now — v10.20.1</p><h2>Tradable only</h2><p className="muted">Measured-data gates hide weak setups. Visible labels are direct: BUY/SELL + market.</p></div><div className="capital-box"><span>Capital</span><div className="capital-input-row"><b>$</b><input type="number" value={capital} onChange={e=>setCapital(e.target.value)}/></div></div></div>
    <Guides/>
    <section className="stats lab-stats"><div><span>Suggested</span><b>{rows.length}</b></div><div><span>Locked Diary</span><b>{investments.filter(x=>x.status!=="CLOSED").length}</b></div><div><span>Total Size</span><b>${totals.size.toFixed(2)}</b></div><div><span>TP1</span><b>${totals.tp1.toFixed(2)}</b></div><div><span>TP2</span><b>${totals.tp2.toFixed(2)}</b></div><div><span>Risk</span><b>${totals.risk.toFixed(2)}</b></div></section>
    <div className="lab-filters"><select value={mode} onChange={e=>setMode(e.target.value)}><option value="BALANCED">Balanced</option><option value="AGGRESSIVE">Aggressive</option><option value="EXTREME">Extreme Hunter</option></select><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="BEST">All Actions</option><option value="BUY">BUY only</option><option value="SELL">SELL only</option><option value="SPOT">SPOT only</option><option value="MARGIN">MARGIN only</option><option value="FUTURES">FUTURES/PERP only</option></select><button className="secondary" onClick={copyRows}>Copy Visible Plans</button></div>
    <div className="table-wrap"><table className="tracker-table action-table"><thead><tr><th>Rank</th><th>Star</th><th>Action</th><th>Pair</th><th>Source</th><th>TP</th><th>Risk</th><th>SL/TP</th><th>Route</th><th>Measured Reason</th></tr></thead><tbody>
      {rows.length===0?<tr><td colSpan={10} className="empty-cell">No actionable rows.</td></tr>:rows.map((r,i)=>{const f=orderFields({...r,actionLabel:r.a.label},r.a.size);return <tr key={r.id}>
        <td><b>{Math.round(r.score)}</b><small>#{i+1}</small></td>
        <td><button className={`star-btn ${isInDiary(r,investments)?"starred":""}`} onClick={()=>mark(r)}>{isInDiary(r,investments)?"★":"☆"}</button><small>{isInDiary(r,investments)?"In diary":"Mark invested"}</small></td>
        <td><span className={`aggressive-pill ${r.a.label.startsWith("SELL")?"sell":r.a.label.includes("FUTURES")||r.a.label.includes("PERP")?"enter":"grab"}`}>{txt(r.a.label)}</span><small>Size ${n(r.a.size).toFixed(2)} · Score {r.a.score}</small></td>
        <td><a href={r.url} target="_blank" rel="noreferrer">{txt(r.pairLabel)}</a><small>{txt(r.category)} · PASS {n(r.securityScore)}</small></td>
        <td><span className="bucket-pill">{txt(r.a.bucket)}</span></td>
        <td className="up">${n(r.a.tp2Profit).toFixed(2)}<small>{n(r.a.tp2Pct).toFixed(2)}%</small></td>
        <td className="down">${n(r.a.invalidLoss).toFixed(2)}<small>{n(r.a.invalidPct).toFixed(2)}%</small></td>
        <td><div className="binance-fields"><b>TP Limit {price(f.tp)}</b><small>SL Trigger {price(f.slTrig)}</small><small>SL Price {price(f.slPrice)}</small><small>Amount {f.qty.toPrecision(6)} {tokenOf(r)}</small></div></td>
        <td><a className="action-link" href={r.rt.routeUrl} target="_blank" rel="noreferrer">{txt(r.rt.routeButton)}</a><small>{txt(r.rt.routeMode)} → {txt(r.rt.routePair)}</small>{r.rt.routeWarning?<small className="route-warning">{txt(r.rt.routeWarning)}</small>:null}<a className="action-link ghost" href={r.url} target="_blank" rel="noreferrer">Original Chart</a></td>
        <td>{txt(r.a.reason)}</td>
      </tr>})}
    </tbody></table></div>
  </section>
}

function Plan({records, investments}){
  const [capital,setCapital]=useState(50);
  const [mode,setMode]=useState("EXTREME");
  const [max,setMax]=useState(4);
  const rows=useMemo(()=>records.filter(stillValid).map(r=>{
    const a=actionFor(r,n(capital),mode), rt=routeInfo(r);
    const curatedBoost=(CURATED_LIST_PAIRS.has(String(r.pairLabel||"").toUpperCase())||isCuratedToken(tokenOf(r)))?35:0; return {...r,a,rt,score:a.score+n(r.securityScore)+curatedBoost+(rt.routeMode==="Binance Direct"?40:rt.routeMode==="Binance Mirror"?10:-80)};
  }).filter(x=>x.a.size>0).sort((a,b)=>b.score-a.score).slice(0,n(max)),[records,capital,max,mode]);
  const deploy=rows.reduce((s,r)=>s+n(r.a.size),0);
  const tp1=rows.reduce((s,r)=>s+n(r.a.tp1Profit),0);
  const tp2=rows.reduce((s,r)=>s+n(r.a.tp2Profit),0);
  const risk=rows.reduce((s,r)=>s+n(r.a.invalidLoss),0);
  function copyPlan(){
    const text=["SNITCH X CAPITAL ATTACK PLAN",`Capital: $${n(capital).toFixed(2)}`,`Mode: ${mode}`,`Deploy: $${deploy.toFixed(2)}`,`Reserve: $${Math.max(0,n(capital)-deploy).toFixed(2)}`,"",...rows.map((r,i)=>{const f=orderFields({...r,actionLabel:r.a.label},r.a.size);return `${i+1}. ${r.pairLabel} — ${r.a.label} — $${r.a.size.toFixed(2)}
Bucket: ${r.a.bucket}
Route: ${r.rt.routeMode} ${r.rt.routePair}
TP Limit: ${price(f.tp)}
SL Trigger: ${price(f.slTrig)}
SL Price: ${price(f.slPrice)}
Amount: ${f.qty.toPrecision(6)} ${tokenOf(r)}`;})].join("\n");
    copy(text);
  }
  return <section className="trade-center">
    <div className="lab-head"><div><p className="eyebrow">Customize Investment Plan</p><h2>Capital attack plan</h2><p className="muted">Deploy capital across the best fresh opportunities.</p></div><div className="capital-box"><span>Capital</span><div className="capital-input-row"><b>$</b><input type="number" value={capital} onChange={e=>setCapital(e.target.value)}/></div></div></div>
    <div className="lab-filters"><select value={mode} onChange={e=>setMode(e.target.value)}><option value="BALANCED">Balanced</option><option value="AGGRESSIVE">Aggressive</option><option value="EXTREME">Extreme Hunter</option></select><select value={max} onChange={e=>setMax(e.target.value)}><option value="2">Max 2</option><option value="4">Max 4</option><option value="6">Max 6</option></select><button className="secondary" onClick={copyPlan}>Copy Plan</button></div>
    <section className="stats lab-stats"><div><span>Deploy</span><b>${deploy.toFixed(2)}</b></div><div><span>Reserve</span><b>${Math.max(0,n(capital)-deploy).toFixed(2)}</b></div><div><span>Positions</span><b>{rows.length}</b></div><div><span>TP1</span><b>${tp1.toFixed(2)}</b></div><div><span>TP2</span><b>${tp2.toFixed(2)}</b></div><div><span>Risk</span><b>${risk.toFixed(2)}</b></div><div><span>Diary</span><b>{investments.length}</b></div></section>
    <div className="table-wrap"><table className="tracker-table"><thead><tr><th>#</th><th>Pair</th><th>Action</th><th>Bucket</th><th>Size</th><th>TP/SL</th><th>Route</th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={7} className="empty-cell">No fresh plan now.</td></tr>:rows.map((r,i)=>{const f=orderFields({...r,actionLabel:r.a.label},r.a.size);return <tr key={r.id}><td>{i+1}</td><td>{txt(r.pairLabel)}</td><td>{txt(r.a.label)}</td><td><span className="bucket-pill">{txt(r.a.bucket)}</span></td><td>${n(r.a.size).toFixed(2)}</td><td>TP {price(f.tp)} / SL {price(f.slTrig)} / {price(f.slPrice)}</td><td>{txt(r.rt.routeMode)} → {txt(r.rt.routePair)}</td></tr>})}</tbody></table></div>
  </section>
}

function PerformanceLab({records}){
  const [filter,setFilter]=useState("ACTIVE");
  const rows=useMemo(()=>{
    if(filter==="SUCCESS") return records.filter(isSuccess);
    if(filter==="ALL") return records.filter(r=>stillValid(r)||isSuccess(r));
    return records.filter(stillValid);
  },[records,filter]);
  return <section className="performance-lab">
    <div className="lab-head"><div><p className="eyebrow">Performance Lab</p><h2>Fresh active + success only</h2><p className="muted">No useless old records. Success records are kept as evidence.</p></div></div>
    <div className="lab-filters"><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="ACTIVE">Active Valid</option><option value="SUCCESS">Success Records</option><option value="ALL">Active + Success</option></select></div>
    <div className="table-wrap"><table className="tracker-table"><thead><tr><th>Pair</th><th>Signal</th><th>Status</th><th>Current</th><th>TP1/TP2</th><th>Result</th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={6} className="empty-cell">No records.</td></tr>:rows.map(r=><tr key={r.id}><td>{txt(r.pairLabel)}</td><td>{txt(r.signalType)}</td><td>{txt(r.status||r.resultStatus||"ACTIVE")}</td><td>${price(r.currentPrice||r.signalPrice)}</td><td>${price(r.tp1)} / ${price(r.tp2)}</td><td>{txt(r.result||r.resultStatus||"TRACKING")}</td></tr>)}</tbody></table></div>
  </section>
}
function Success({records}){
  const rows=records.filter(isSuccess).sort((a,b)=>safeUpdated(b)-safeUpdated(a));
  const grouped=groupSuccess(records);
  const maxCount=Math.max(1,...grouped.map(x=>x.count));
  const maxAvg=Math.max(1,...grouped.map(x=>Math.abs(x.avgPct)));
  const total=rows.length;
  const tp2=rows.filter(r=>r.hitTP2||String(r.successLevel||r.resultStatus||"").includes("TP2")).length;
  const tp1=total-tp2;
  const best=grouped[0];
  return <section className="performance-lab success-intel">
    <div className="lab-head">
      <div><p className="eyebrow">Success Forecast Intelligence</p><h2>Winners database + forecast track record</h2><p className="muted">Automatic database from successForecasts. Shows which coin most often meets forecast and which performs best.</p></div>
    </div>
    <section className="stats lab-stats">
      <div><span>Total Success</span><b>{total}</b></div>
      <div><span>TP1 Hits</span><b>{tp1}</b></div>
      <div><span>TP2 Hits</span><b>{tp2}</b></div>
      <div><span>Best Coin</span><b>{best?best.coin:"-"}</b></div>
      <div><span>Best Count</span><b>{best?best.count:0}</b></div>
    </section>
    <div className="success-grid">
      <section className="success-card">
        <h3>Most Forecast Hits</h3>
        {grouped.length===0?<p className="muted">No success records yet.</p>:grouped.slice(0,10).map(g=><div className="bar-row" key={g.coin}>
          <span>{g.coin}</span>
          <div className="bar-track"><div className="bar-fill" style={{width:`${Math.max(6,(g.count/maxCount)*100)}%`}}></div></div>
          <b>{g.count}</b>
        </div>)}
      </section>
      <section className="success-card">
        <h3>Best Average Move</h3>
        {grouped.length===0?<p className="muted">No success records yet.</p>:grouped.slice().sort((a,b)=>b.avgPct-a.avgPct).slice(0,10).map(g=><div className="bar-row" key={g.coin}>
          <span>{g.coin}</span>
          <div className="bar-track"><div className="bar-fill profit" style={{width:`${Math.max(6,(Math.abs(g.avgPct)/maxAvg)*100)}%`}}></div></div>
          <b>{g.avgPct.toFixed(2)}%</b>
        </div>)}
      </section>
    </div>
    <div className="table-wrap"><table className="tracker-table"><thead><tr><th>Coin</th><th>Forecast Hits</th><th>TP1</th><th>TP2</th><th>Avg Move</th><th>Best</th><th>Worst</th></tr></thead><tbody>{grouped.length===0?<tr><td colSpan={7} className="empty-cell">No success records yet. Worker will continue building this database automatically.</td></tr>:grouped.map(g=><tr key={g.coin}><td><b>{g.coin}</b></td><td>{g.count}</td><td>{g.tp1}</td><td>{g.tp2}</td><td className="up">{g.avgPct.toFixed(2)}%</td><td className="up">{g.bestPct.toFixed(2)}%</td><td>{g.worstPct.toFixed(2)}%</td></tr>)}</tbody></table></div>
    <div className="table-wrap"><table className="tracker-table"><thead><tr><th>Pair</th><th>Level</th><th>Signal</th><th>Price</th><th>Completed</th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={5} className="empty-cell">No success records yet.</td></tr>:rows.map(r=><tr key={r.id}><td>{txt(r.pairLabel)}</td><td>{txt(r.successLevel||r.resultStatus||r.result)}</td><td>{txt(r.signalType)}</td><td>${price(r.signalPrice)} → ${price(r.currentPrice)}</td><td>{age(r.completedAt||r.lastUpdated)}</td></tr>)}</tbody></table></div>
  </section>
}

function Diary({investments,setInvestments}){
  const [form,setForm]=useState({pairLabel:"ETH/USDT",token:"ETH",entryPrice:"",investedCapital:"10",quantity:"",tp1:"",tp2:"",stopTrigger:"",stopLimit:""});
  function save(next){ setInvestments(next); localStorage.setItem(INVEST_STORE,JSON.stringify(next));}
  function addManual(){
    const entry=n(form.entryPrice), capital=n(form.investedCapital,10), qty=n(form.quantity, entry?capital/entry:0);
    const item={diaryId:`manual-${Date.now()}`,id:`manual-${Date.now()}`,pairLabel:String(form.pairLabel).toUpperCase(),token:String(form.token).toUpperCase(),entryPrice:entry,investedCapital:capital,quantity:qty,tp1:n(form.tp1),tp2:n(form.tp2),stopTrigger:n(form.stopTrigger),stopLimit:n(form.stopLimit),status:"ACTIVE",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),actionLabel:"MANUAL"};
    save([item,...investments]);
  }
  function remove(id){ save(investments.filter(x=>x.diaryId!==id));}
  function close(id){ save(investments.map(x=>x.diaryId===id?{...x,status:"CLOSED",closedAt:new Date().toISOString()}:x));}
  return <section className="performance-lab"><div className="lab-head"><div><p className="eyebrow">Investment Diary</p><h2>Manual holdings</h2><p className="muted">User-controlled history. This is where executed trades stay.</p></div></div>
    <section className="manual-invest-card"><h3>Manual Add</h3><div className="manual-grid">{["pairLabel","token","entryPrice","investedCapital","quantity","tp1","tp2","stopTrigger","stopLimit"].map(k=><label key={k}>{k}<input value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}</div><button className="secondary" onClick={addManual}>Add to Diary</button></section>
    <div className="table-wrap"><table className="tracker-table"><thead><tr><th>Pair</th><th>Status</th><th>Entry</th><th>Capital</th><th>Qty</th><th>TP/SL</th><th>Action</th></tr></thead><tbody>{investments.length===0?<tr><td colSpan={7} className="empty-cell">No diary rows.</td></tr>:investments.map(x=><tr key={x.diaryId}><td>{txt(x.pairLabel)}</td><td>{txt(x.status)}</td><td>{price(x.entryPrice)}</td><td>${n(x.investedCapital).toFixed(2)}</td><td>{n(x.quantity).toPrecision(6)} {txt(x.token)}</td><td>TP {price(x.tp1)} / SL {price(x.stopTrigger)} / {price(x.stopLimit)}</td><td><button className="mini-btn" onClick={()=>close(x.diaryId)}>Close</button><button className="mini-btn" onClick={()=>remove(x.diaryId)}>Remove</button></td></tr>)}</tbody></table></div></section>
}


// v10.20.3 client-side live fallback: if GitHub tracker-db has 0 active rows,
// Sync Now pulls actual Binance public market data directly in the browser.
// It uses actual bid/ask, depth, candles, 24h stats, and measured swing levels.
const LIVE_NOTIONAL_USD = 10;
const LIVE_MIN_NET_USD = 0.25;
const LIVE_SPOT_FEE_BPS = 10;
const LIVE_PERP_FEE_BPS = 5;
const LIVE_QUOTES = new Set(["USDT","USDC","FDUSD"]);
const LIVE_STABLE_BASES = new Set(["USDT","USDC","FDUSD","TUSD","DAI","BUSD"]);
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function liveJson(url){
  const r = await fetch(url,{cache:"no-store"});
  if(!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
function median(vals){
  const a=(vals||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length) return 0;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function avgFillFromBook(levels, neededQty){
  let rem=neededQty, cost=0, qty=0;
  for(const lv of levels||[]){
    const px=n(lv[0]), q=n(lv[1]);
    if(!(px>0&&q>0)) continue;
    const take=Math.min(rem,q);
    cost += take*px; qty += take; rem -= take;
    if(rem<=0) break;
  }
  if(qty<=0 || rem>0) return null;
  return cost/qty;
}
function liveDepthMetrics(depth, side){
  const bid=n(depth?.bids?.[0]?.[0]), ask=n(depth?.asks?.[0]?.[0]);
  if(!(bid>0&&ask>0&&ask>=bid)) return null;
  const mid=(bid+ask)/2;
  const spreadPct=((ask-bid)/mid)*100;
  const entry = side==="BUY" ? ask : bid;
  const qty=LIVE_NOTIONAL_USD/entry;
  const entryAvg = avgFillFromBook(side==="BUY" ? depth.asks : depth.bids, qty);
  const exitAvg = avgFillFromBook(side==="BUY" ? depth.bids : depth.asks, qty);
  if(!(entryAvg>0&&exitAvg>0)) return null;
  const entrySlipPct = side==="BUY" ? Math.max(0,((entryAvg-entry)/entry)*100) : Math.max(0,((entry-entryAvg)/entry)*100);
  const exitSlipPct = side==="BUY" ? Math.max(0,((entry-exitAvg)/entry)*100) : Math.max(0,((exitAvg-entry)/entry)*100);
  return {bid,ask,mid,spreadPct,entry,entryAvg,exitAvg,entrySlipPct,exitSlipPct};
}
function liveKlineStats(klines){
  const rows=(klines||[]).map(k=>({high:n(k[2]), low:n(k[3]), close:n(k[4]), volume:n(k[5])})).filter(x=>x.high>0&&x.low>0&&x.close>0);
  if(rows.length<20) return null;
  const recent=rows.slice(-32);
  const prior=rows.slice(-64,-32);
  const swingHigh=Math.max(...recent.map(x=>x.high));
  const swingLow=Math.min(...recent.map(x=>x.low));
  const widerHigh=Math.max(...rows.slice(-96).map(x=>x.high));
  const widerLow=Math.min(...rows.slice(-96).map(x=>x.low));
  const last=rows[rows.length-1];
  const prev=rows[rows.length-2];
  const noisePct=median(recent.map(x=>((x.high-x.low)/x.close)*100));
  const recentVol=recent.reduce((a,b)=>a+b.volume,0);
  const priorVol=prior.reduce((a,b)=>a+b.volume,0);
  const volExpansion=priorVol>0?recentVol/priorVol:1;
  return {swingHigh,swingLow,widerHigh,widerLow,lastClose:last.close,lastHigh:last.high,lastLow:last.low,prevClose:prev.close,noisePct,volExpansion};
}
function liveFeasible({side, depth, kstats, feeBps}){
  const ob=liveDepthMetrics(depth, side);
  if(!ob||!kstats) return null;
  const entry=ob.entry;
  const isBuy=side==="BUY";
  const tp=isBuy ? kstats.widerHigh : kstats.widerLow;
  const sl=isBuy ? kstats.swingLow : kstats.swingHigh;
  if(!(entry>0&&tp>0&&sl>0)) return null;
  const rewardPct=isBuy?((tp-entry)/entry)*100:((entry-tp)/entry)*100;
  const riskPct=isBuy?((entry-sl)/entry)*100:((sl-entry)/entry)*100;
  if(!(rewardPct>0&&riskPct>0)) return null;
  const measuredFrictionPct=ob.spreadPct+ob.entrySlipPct+ob.exitSlipPct;
  if(riskPct <= Math.max(measuredFrictionPct,kstats.noisePct)) return null;
  if(rewardPct <= riskPct) return null;
  const feeUsd=LIVE_NOTIONAL_USD*(feeBps/10000)*2;
  const entrySlipUsd=LIVE_NOTIONAL_USD*(ob.entrySlipPct/100);
  const exitSlipUsd=LIVE_NOTIONAL_USD*(ob.exitSlipPct/100);
  const grossProfitUsd=LIVE_NOTIONAL_USD*(rewardPct/100);
  const netProfitUsd=grossProfitUsd-feeUsd-entrySlipUsd-exitSlipUsd;
  if(netProfitUsd < LIVE_MIN_NET_USD) return null;
  return {entry,tp,sl,rewardPct,riskPct,rr:rewardPct/riskPct,ob,feeUsd,entrySlipUsd,exitSlipUsd,grossProfitUsd,netProfitUsd,measuredFrictionPct};
}
function liveRecord({symbol, base, quote, side, marketType, ticker, feas, buckets}){
  const m=marketType;
  const feeBps = m==="SPOT" ? LIVE_SPOT_FEE_BPS : LIVE_PERP_FEE_BPS;
  return {id:`client-live-${m.toLowerCase()}-${symbol}-${side}`,pairKey:`binance-${symbol}`,token:base,pairLabel:`${base}/${quote}`,chain:"binance",dex:m.toLowerCase(),url:binanceTradeUrl(base,quote,m),source:"binance-v10.20.3-client-live-measured",version:"v10.20.3-client-live",marketType:m,binanceSymbol:symbol,quoteAsset:quote,baseAsset:base,signalType:side,category:buckets.join(" + ") || "BINANCE LIVE",sourceBuckets:buckets,sourceBucket:buckets.join(" + "),securityScore:Math.round(Math.max(60,Math.min(98,78 + Math.min(12,n(ticker?.count)/20000) - feas.measuredFrictionPct*4))),securityStatus:"PASS",securityFlags:["Client live Binance ticker","Client live order book","Client live candles"],signal:`${side} ${m}`,actionLabel:`${side} ${m}`,trackedAt:new Date().toISOString(),firstSeenAt:new Date().toISOString(),lastUpdated:new Date().toISOString(),signalPrice:feas.entry,currentPrice:feas.entry,maxHigh:feas.entry,maxLow:feas.entry,zoneLow:feas.entry,zoneHigh:feas.entry,trigger:feas.entry,invalidation:feas.sl,tp1:feas.tp,tp2:feas.tp,rr:feas.rr,opportunity:Math.round(Math.max(60,Math.min(99,70 + Math.min(20,feas.rewardPct) + (buckets.includes("TOP_GAINER")||buckets.includes("TOP_LOSER")?5:0)))),execution:Math.round(Math.max(55,Math.min(99,75 + feas.rr*4 - feas.measuredFrictionPct*5))),validity:Math.round(Math.max(55,Math.min(99,75 + Math.min(15,n(ticker?.quoteVolume)/1e8)))),risk:Math.round(Math.max(1,Math.min(45,feas.riskPct))),bearScore:side==="SELL"?75:0,liquidityUsd:n(ticker?.quoteVolume),volume24h:n(ticker?.quoteVolume),tx24:n(ticker?.count),spreadPct:feas.ob.spreadPct,actualCostPct:feas.measuredFrictionPct+(feeBps/100),feeBps,entrySlipPct:feas.ob.entrySlipPct,exitSlipPct:feas.ob.exitSlipPct,measuredRewardPct:feas.rewardPct,measuredRiskPct:feas.riskPct,measuredNetProfitUsd:feas.netProfitUsd,measuredGrossProfitUsd:feas.grossProfitUsd,measuredFeeUsd:feas.feeUsd,decisionSource:"client-live-measured-structure",measuredAudit:{entry:feas.entry,tp:feas.tp,sl:feas.sl,side,marketType:m,bestBid:feas.ob.bid,bestAsk:feas.ob.ask,spreadPct:feas.ob.spreadPct,entrySlipPct:feas.ob.entrySlipPct,exitSlipPct:feas.ob.exitSlipPct,rewardPct:feas.rewardPct,riskPct:feas.riskPct,rr:feas.rr,netProfitUsd:feas.netProfitUsd,sourceBuckets:buckets},hitZone:true,hitTrigger:true,hitTP1:false,hitTP2:false,hitInvalid:false,alertsSent:{},currentMovePct:0,forecastGoodPct:0,adverseMovePct:0,status:"ACTIVE",result:"EXECUTION NOW",updateCount:1};
}
async function clientLiveBinanceFallback(){
  const records=[];
  const spotTickers=await liveJson("https://api.binance.com/api/v3/ticker/24hr");
  const spotInfo=await liveJson("https://api.binance.com/api/v3/exchangeInfo");
  const spotInfoMap=new Map((spotInfo.symbols||[]).map(s=>[s.symbol,s]));
  const spotPool=(spotTickers||[]).filter(t=>{const s=spotInfoMap.get(t.symbol); if(!s||s.status!=="TRADING") return false; if(!LIVE_QUOTES.has(s.quoteAsset)||LIVE_STABLE_BASES.has(s.baseAsset)) return false; return n(t.lastPrice)>0&&n(t.quoteVolume)>500000&&n(t.count)>3000;}).sort((a,b)=>(Math.abs(n(b.priceChangePercent))*n(b.quoteVolume))-(Math.abs(n(a.priceChangePercent))*n(a.quoteVolume))).slice(0,18);
  for(const t of spotPool){
    const s=spotInfoMap.get(t.symbol); const buckets=[]; if(n(t.priceChangePercent)>8) buckets.push("TOP_GAINER"); if(n(t.quoteVolume)>50000000) buckets.push("HOT_PROXY");
    try{const [depth,klines]=await Promise.all([liveJson(`https://api.binance.com/api/v3/depth?symbol=${t.symbol}&limit=100`),liveJson(`https://api.binance.com/api/v3/klines?symbol=${t.symbol}&interval=15m&limit=96`)]); const ks=liveKlineStats(klines); const feas=liveFeasible({side:"BUY",depth,kstats:ks,feeBps:LIVE_SPOT_FEE_BPS}); if(feas) records.push(liveRecord({symbol:t.symbol,base:s.baseAsset,quote:s.quoteAsset,side:"BUY",marketType:"SPOT",ticker:t,feas,buckets:buckets.length?buckets:["ALL_SYMBOLS"]}));}catch{}
    await sleep(40);
  }
  try{
    const futTickers=await liveJson("https://fapi.binance.com/fapi/v1/ticker/24hr");
    const futInfo=await liveJson("https://fapi.binance.com/fapi/v1/exchangeInfo");
    const futInfoMap=new Map((futInfo.symbols||[]).map(s=>[s.symbol,s]));
    const futPool=(futTickers||[]).filter(t=>{const s=futInfoMap.get(t.symbol); if(!s||s.status!=="TRADING"||s.contractType!=="PERPETUAL") return false; if(!LIVE_QUOTES.has(s.quoteAsset)||LIVE_STABLE_BASES.has(s.baseAsset)) return false; return n(t.lastPrice)>0&&n(t.quoteVolume)>1000000&&n(t.count)>3000;}).sort((a,b)=>(Math.abs(n(b.priceChangePercent))*n(b.quoteVolume))-(Math.abs(n(a.priceChangePercent))*n(a.quoteVolume))).slice(0,18);
    for(const t of futPool){
      const s=futInfoMap.get(t.symbol); const ch=n(t.priceChangePercent); const side=ch>=0?"SELL":"BUY"; const buckets=[ch>=0?"TOP_GAINER":"TOP_LOSER","FUTURES_MOVERS"];
      try{const [depth,klines]=await Promise.all([liveJson(`https://fapi.binance.com/fapi/v1/depth?symbol=${t.symbol}&limit=100`),liveJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${t.symbol}&interval=15m&limit=96`)]); const ks=liveKlineStats(klines); const feas=liveFeasible({side,depth,kstats:ks,feeBps:LIVE_PERP_FEE_BPS}); if(feas) records.push(liveRecord({symbol:t.symbol,base:s.baseAsset,quote:s.quoteAsset,side,marketType:"PERP",ticker:t,feas,buckets}));}catch{}
      await sleep(40);
    }
  }catch{}
  return records.sort((a,b)=>(n(b.measuredNetProfitUsd)*20+n(b.opportunity)+n(b.execution))-(n(a.measuredNetProfitUsd)*20+n(a.opportunity)+n(a.execution))).slice(0,30);
}

export default function App(){
  const [records,setRecords]=useState([]);
  const [investments,setInvestments]=useState([]);
  const [tab,setTab]=useState("scanner");
  const [status,setStatus]=useState("Loading...");
  async function sync(){
    setStatus("Syncing...");
    try{
      const r=await fetch(`${REMOTE}?t=${Date.now()}`,{cache:"no-store"});
      const d=await r.json();
      let rec=Array.isArray(d.records)?d.records:[];
      const succ=Array.isArray(d.successForecasts)?d.successForecasts.map(x=>({...x,id:`success-${x.id}-${x.successLevel||"TP"}`,hitTP1:true,hitTP2:x.successLevel==="TP2",currentPrice:x.currentPrice||x.tp2||x.tp1,trackedAt:x.completedAt,lastUpdated:x.completedAt,resultStatus:x.successLevel==="TP2"?"SUCCESS_TP2":"SUCCESS_TP1"})) : [];
      let sourceLabel="tracker-db";
      if(rec.length===0){
        setStatus(`Tracker empty. Pulling live Binance measured data...`);
        try{
          const liveRows=await clientLiveBinanceFallback();
          if(liveRows.length>0){ rec=liveRows; sourceLabel="client live Binance"; }
        }catch(liveErr){
          console.warn("Client live Binance fallback failed", liveErr);
        }
      }
      setRecords([...rec,...succ]);
      setStatus(`Loaded ${rec.length} active rows · ${sourceLabel} · ${new Date().toLocaleTimeString()}`);
    }catch(e){ setStatus(`Sync failed: ${e.message}`); }
  }
  useEffect(()=>{ sync(); try{const raw=localStorage.getItem(INVEST_STORE); if(raw) setInvestments(JSON.parse(raw));}catch{} const t=setInterval(sync,60000); return()=>clearInterval(t); },[]);
  return <main>
    <Header status={status} sync={sync}/>
    <section className="tabbar">
      <button className={tab==="scanner"?"tab active":"tab"} onClick={()=>setTab("scanner")}>Scanner</button>
      <button className={tab==="lab"?"tab active":"tab"} onClick={()=>setTab("lab")}>Performance Lab</button>
      <button className={tab==="success"?"tab active":"tab"} onClick={()=>setTab("success")}>Success Forecast</button>
      <button className={tab==="action"?"tab active":"tab"} onClick={()=>setTab("action")}>Execution Now</button>
      <button className={tab==="plan"?"tab active":"tab"} onClick={()=>setTab("plan")}>Customize Investment Plan</button>
      <button className={tab==="diary"?"tab active":"tab"} onClick={()=>setTab("diary")}>Investment Diary</button>
    </section>
    <Stats records={records} investments={investments}/>
    {tab==="scanner"&&<Scanner records={records}/>}
    {tab==="lab"&&<PerformanceLab records={records}/>}
    {tab==="success"&&<Success records={records}/>}
    {tab==="action"&&<TradeAction records={records} investments={investments} setInvestments={setInvestments}/>}
    {tab==="plan"&&<Plan records={records} investments={investments}/>}
    {tab==="diary"&&<Diary investments={investments} setInvestments={setInvestments}/>}
  </main>
}
