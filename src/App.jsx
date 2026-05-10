import { useEffect, useMemo, useState } from "react";

const REMOTE = `${import.meta.env.BASE_URL || "/"}tracker-db.json`;
const INVEST_STORE = "snitch_x_v10_6_investment_diary";

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
function binanceUrl(token, quote="USDT"){
  const t=String(token||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  return `https://www.binance.com/en/trade/${t}${quote}?type=spot`;
}
function okxUrl(token){ return `https://www.okx.com/trade-spot/${String(token||"").toLowerCase()}-usdt`; }
function bybitUrl(token){ return `https://www.bybit.com/trade/spot/${String(token||"").toUpperCase()}/USDT`; }
function splitPair(pair){
  const p=String(pair||"").toUpperCase().replace("-","/").split("/");
  return {base:p[0]||"", quote:p[1]||""};
}
function routeInfo(r){
  const {base, quote}=splitPair(r?.pairLabel);
  const token=tokenOf(r)||base;
  const stable=["USDT","USDC","FDUSD","BUSD","DAI","USD"].includes(quote);
  const major=["WETH","WBTC","WBNB","ETH","BTC","BNB","SOL","WSOL"].includes(quote);
  if(stable) return {routeMode:"Binance Direct", routePair:`${token}/${quote==="USDC"?"USDC":"USDT"}`, routeUrl:binanceUrl(token, quote==="USDC"?"USDC":"USDT"), routeButton:`Open Binance ${token}/${quote==="USDC"?"USDC":"USDT"}`, routePenalty:0, routeWarning:""};
  if(major) return {routeMode:"Binance Mirror", routePair:`${token}/USDT`, routeUrl:binanceUrl(token), routeButton:`Open Binance ${token}/USDT Mirror`, routePenalty:80, routeWarning:`Mirror of ${r?.pairLabel}`};
  return {routeMode:"Chart Only", routePair:r?.pairLabel||token, routeUrl:r?.url||"#", routeButton:"Open Chart", routePenalty:180, routeWarning:"No safe CEX route"};
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
  const p=n(r.currentPrice||r.signalPrice), tp1=n(r.tp1), tp2=n(r.tp2), inv=n(r.invalidation);
  const sec=n(r.securityScore || r.security?.securityScore);
  const m=String(mode||"EXTREME").toUpperCase();
  const b=bucketOf(r);
  const met=pnlMetrics(r, capital);
  const risk=Math.abs(n(met.invalidPct));
  if(r.signalType==="SELL") return {...met, label:"SKIP SELL", size:0, score:0, reason:"SELL watch; no spot buy.", bucket:b};
  if(isInvalid(r)) return {...met, label:"KILL / INVALID", size:0, score:0, reason:"Invalidation already hit.", bucket:b};
  if(isSuccess(r)) return {...met, label:"TAKE PROFIT / TOO LATE", size:0, score:0, reason:"TP already hit.", bucket:b};
  let label="SCOUT ENTRY", score=50, reason="Valid fresh candidate. Scout size only.";
  if(sec>=95 && r.hitTrigger && met.tp2Pct>=4 && risk<=16){ label="GRAB NOW"; score=95; reason="Trigger confirmed, strong security, enough TP2 room."; }
  else if(sec>=85 && (r.hitZone || r.hitTrigger) && met.tp2Pct>=5 && risk<=22){ label="ENTER SMALL"; score=78; reason="Fresh opportunity with zone/trigger support."; }
  else if(sec>=70 && met.tp2Pct>=7){ label="SCOUT ENTRY"; score=62; reason="Upside exists, but confirmation weaker."; }
  if(m==="EXTREME"){
    if(b==="HIGH VOL" && sec>=65 && met.tp2Pct>=6){ label="HIGH VOL SCOUT"; score=Math.max(score,74); reason="High volatility candidate. Small fast scout."; }
    if(b==="NARRATIVE" && sec>=65 && met.tp2Pct>=6){ label="ATTACK ENTRY"; score=Math.max(score,76); reason="Narrative/momentum attack candidate."; }
    if(b==="WILD CARD" && sec>=75 && met.tp2Pct>=9){ label="NEW PAIR HUNTER"; score=Math.max(score,66); reason="Wildcard hunter. Very small risk only."; }
  }
  const sizePct=label.includes("GRAB")?0.70:label.includes("ATTACK")?0.45:label.includes("HIGH VOL")?0.25:label.includes("ENTER")?0.40:label.includes("NEW PAIR")?0.15:0.20;
  const size=Math.max(0, Math.min(n(capital), n(capital)*sizePct));
  return {...met, label, size, score, reason, bucket:b};
}
function orderFields(r, size){
  const entry=n(r.currentPrice||r.signalPrice);
  const qty=entry>0?n(size)/entry:0;
  const label=String(r?.actionLabel||"");
  const stopPct=label.includes("GRAB")?0.0125:label.includes("HIGH VOL")?0.025:0.0175;
  return {tp:n(r.tp1), tp2:n(r.tp2), slTrig:entry*(1-stopPct), slPrice:entry*(1-stopPct-0.0045), qty};
}
function copy(text){ try{navigator.clipboard.writeText(String(text||""));}catch{} }

function Header({status, sync}){
  return <header className="hero">
    <div>
      <p className="eyebrow">SNITCH X · Full Feature Restore v10.16</p>
      <h1>Extreme Hunter cockpit restored</h1>
      <p className="sub">Stable bulletproof UI with restored Scanner, Performance Lab, Success Forecast, Trade Action Center, Customize Investment Plan and Investment Diary.</p>
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
      <div><b>Binance Direct</b><span>Scanner pair is USDT/USDC.</span></div>
      <div><b>Binance Mirror</b><span>DEX pair differs; Binance opens token/USDT.</span></div>
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
    <div><span>BUY</span><b>{active.filter(x=>x.signalType==="BUY").length}</b></div>
    <div><span>SELL</span><b>{active.filter(x=>x.signalType==="SELL").length}</b></div>
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
        <td><a className="action-link" href={rt.routeUrl} target="_blank" rel="noreferrer">{txt(rt.routeButton)}</a><small>{txt(rt.routeMode)} → {txt(rt.routePair)}</small></td>
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
    records.filter(stillValid).map(r=>{
      const a=actionFor(r,n(capital),mode);
      const rt=routeInfo(r);
      const score=a.score + n(r.securityScore) + (rt.routeMode==="Binance Direct"?40:rt.routeMode==="Binance Mirror"?10:-80) - n(rt.routePenalty||0);
      return {...r,a,rt,score};
    }).filter(x=>x.a.size>0).sort((a,b)=>b.score-a.score).forEach(x=>{
      const key=x.rt.routePair||x.pairLabel;
      const old=map.get(key);
      if(!old || x.score>old.score) map.set(key,x);
    });
    let out=[...map.values()];
    if(filter==="GRAB") out=out.filter(x=>x.a.label.includes("GRAB"));
    if(filter==="ENTER") out=out.filter(x=>x.a.label.includes("ENTER")||x.a.label.includes("ATTACK"));
    if(filter==="SCOUT") out=out.filter(x=>x.a.label.includes("SCOUT")||x.a.label.includes("HUNTER"));
    return out.slice(0,50);
  },[records,capital,mode,filter]);
  const totals=rows.reduce((s,r)=>({size:s.size+n(r.a.size),tp1:s.tp1+n(r.a.tp1Profit),tp2:s.tp2+n(r.a.tp2Profit),risk:s.risk+n(r.a.invalidLoss)}),{size:0,tp1:0,tp2:0,risk:0});
  function mark(r){
    const f=orderFields({...r,actionLabel:r.a.label},r.a.size);
    const item={diaryId:`${r.id}-${Date.now()}`,id:r.id,pairLabel:r.pairLabel,token:tokenOf(r),url:r.url,entryPrice:n(r.currentPrice||r.signalPrice),investedCapital:n(r.a.size),quantity:f.qty,tp1:n(r.tp1),tp2:n(r.tp2),stopTrigger:f.slTrig,stopLimit:f.slPrice,stopPrice:n(r.invalidation),status:"ACTIVE",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),actionLabel:r.a.label, routeMode:r.rt.routeMode, routePair:r.rt.routePair};
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
    <div className="lab-head"><div><p className="eyebrow">Trade Action Center</p><h2>Best trade first</h2><p className="muted">Ranks fresh setups and shows Binance-ready order fields.</p></div><div className="capital-box"><span>Capital</span><div className="capital-input-row"><b>$</b><input type="number" value={capital} onChange={e=>setCapital(e.target.value)}/></div></div></div>
    <Guides/>
    <section className="stats lab-stats"><div><span>Suggested</span><b>{rows.length}</b></div><div><span>Total Size</span><b>${totals.size.toFixed(2)}</b></div><div><span>TP1</span><b>${totals.tp1.toFixed(2)}</b></div><div><span>TP2</span><b>${totals.tp2.toFixed(2)}</b></div><div><span>Risk</span><b>${totals.risk.toFixed(2)}</b></div></section>
    <div className="lab-filters"><select value={mode} onChange={e=>setMode(e.target.value)}><option value="BALANCED">Balanced</option><option value="AGGRESSIVE">Aggressive</option><option value="EXTREME">Extreme Hunter</option></select><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="BEST">Suggested List</option><option value="GRAB">GRAB NOW</option><option value="ENTER">ENTER / ATTACK</option><option value="SCOUT">SCOUT / HUNTER</option></select><button className="secondary" onClick={copyRows}>Copy Visible Plans</button></div>
    <div className="table-wrap"><table className="tracker-table action-table"><thead><tr><th>Rank</th><th>Star</th><th>Action</th><th>Pair</th><th>Bucket</th><th>TP2</th><th>Risk</th><th>TP/SL</th><th>Route</th><th>Reason</th></tr></thead><tbody>
      {rows.length===0?<tr><td colSpan={10} className="empty-cell">No actionable rows.</td></tr>:rows.map((r,i)=>{const f=orderFields({...r,actionLabel:r.a.label},r.a.size);return <tr key={r.id}>
        <td><b>{Math.round(r.score)}</b><small>#{i+1}</small></td>
        <td><button className="star-btn" onClick={()=>mark(r)}>☆</button><small>Mark invested</small></td>
        <td><span className={`aggressive-pill ${r.a.label.includes("GRAB")?"grab":r.a.label.includes("ATTACK")||r.a.label.includes("ENTER")?"enter":"scout"}`}>{txt(r.a.label)}</span><small>Size ${n(r.a.size).toFixed(2)} · Score {r.a.score}</small></td>
        <td><a href={r.url} target="_blank" rel="noreferrer">{txt(r.pairLabel)}</a><small>{txt(r.category)} · PASS {n(r.securityScore)}</small></td>
        <td><span className="bucket-pill">{txt(r.a.bucket)}</span></td>
        <td className="up">${n(r.a.tp2Profit).toFixed(2)}<small>{n(r.a.tp2Pct).toFixed(2)}%</small></td>
        <td className="down">${n(r.a.invalidLoss).toFixed(2)}<small>{n(r.a.invalidPct).toFixed(2)}%</small></td>
        <td><div className="binance-fields"><b>TP Limit {price(f.tp)}</b><small>SL Trigger {price(f.slTrig)}</small><small>SL Price {price(f.slPrice)}</small><small>Amount {f.qty.toPrecision(6)} {tokenOf(r)}</small></div></td>
        <td><a className="action-link" href={r.rt.routeUrl} target="_blank" rel="noreferrer">{txt(r.rt.routeButton)}</a><small>{txt(r.rt.routeMode)} → {txt(r.rt.routePair)}</small><a className="action-link ghost" href={r.url} target="_blank" rel="noreferrer">Original Chart</a></td>
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
    return {...r,a,rt,score:a.score+n(r.securityScore)+(rt.routeMode==="Binance Direct"?40:rt.routeMode==="Binance Mirror"?10:-80)};
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
  const rows=records.filter(isSuccess);
  return <section className="performance-lab"><div className="lab-head"><div><p className="eyebrow">Success Forecast</p><h2>Winners database</h2><p className="muted">Evidence database for hit TP1/TP2 records.</p></div></div><div className="table-wrap"><table className="tracker-table"><thead><tr><th>Pair</th><th>Level</th><th>Signal</th><th>Price</th><th>Completed</th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={5} className="empty-cell">No success records yet.</td></tr>:rows.map(r=><tr key={r.id}><td>{txt(r.pairLabel)}</td><td>{txt(r.successLevel||r.resultStatus||r.result)}</td><td>{txt(r.signalType)}</td><td>${price(r.signalPrice)} → ${price(r.currentPrice)}</td><td>{age(r.completedAt||r.lastUpdated)}</td></tr>)}</tbody></table></div></section>
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
      const rec=Array.isArray(d.records)?d.records:[];
      const succ=Array.isArray(d.successForecasts)?d.successForecasts.map(x=>({...x,id:`success-${x.id}-${x.successLevel||"TP"}`,hitTP1:true,hitTP2:x.successLevel==="TP2",currentPrice:x.currentPrice||x.tp2||x.tp1,trackedAt:x.completedAt,lastUpdated:x.completedAt,resultStatus:x.successLevel==="TP2"?"SUCCESS_TP2":"SUCCESS_TP1"})):[];
      setRecords([...rec,...succ]);
      setStatus(`Loaded ${rec.length} active rows · ${new Date().toLocaleTimeString()}`);
    }catch(e){ setStatus(`Sync failed: ${e.message}`); }
  }
  useEffect(()=>{ sync(); try{const raw=localStorage.getItem(INVEST_STORE); if(raw) setInvestments(JSON.parse(raw));}catch{} const t=setInterval(sync,60000); return()=>clearInterval(t); },[]);
  return <main>
    <Header status={status} sync={sync}/>
    <section className="tabbar">
      <button className={tab==="scanner"?"tab active":"tab"} onClick={()=>setTab("scanner")}>Scanner</button>
      <button className={tab==="lab"?"tab active":"tab"} onClick={()=>setTab("lab")}>Performance Lab</button>
      <button className={tab==="success"?"tab active":"tab"} onClick={()=>setTab("success")}>Success Forecast</button>
      <button className={tab==="action"?"tab active":"tab"} onClick={()=>setTab("action")}>Trade Action Center</button>
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
