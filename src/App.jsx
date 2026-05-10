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
function pct(a,b){ a=n(a); b=n(b); return a>0 ? ((b-a)/a)*100 : 0; }
function tokenOf(r){ return String(r?.token || String(r?.pairLabel||"").split("/")[0] || "").toUpperCase(); }
function binanceUrl(token, quote="USDT"){
  const t=String(token||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  return `https://www.binance.com/en/trade/${t}${quote}?type=spot`;
}
function splitPair(pair){
  const p=String(pair||"").toUpperCase().replace("-","/").split("/");
  return {base:p[0]||"", quote:p[1]||""};
}
function route(r){
  const {base, quote}=splitPair(r?.pairLabel);
  const token=tokenOf(r)||base;
  const stable=["USDT","USDC","FDUSD","BUSD","DAI","USD"].includes(quote);
  const major=["WETH","WBTC","WBNB","ETH","BTC","BNB","SOL","WSOL"].includes(quote);
  if(stable) return {mode:"Binance Direct", pair:`${token}/${quote==="USDC"?"USDC":"USDT"}`, url:binanceUrl(token, quote==="USDC"?"USDC":"USDT"), label:`Open Binance ${token}/${quote==="USDC"?"USDC":"USDT"}`};
  if(major) return {mode:"Binance Mirror", pair:`${token}/USDT`, url:binanceUrl(token), label:`Open Binance ${token}/USDT Mirror`};
  return {mode:"Chart Only", pair:r?.pairLabel||token, url:r?.url||"#", label:"Open Chart"};
}
function bucket(r){
  const t=tokenOf(r);
  const high=new Set(["PEPE","WIF","BONK","FLOKI","SHIB","1000SATS","1000CAT","ACT","PNUT","MEME","TURBO","BOME","MEW","POPCAT","MOG","GOAT","PENGU","DOGS","NOT"]);
  const narr=new Set(["AI","AIXBT","VIRTUAL","GRASS","KAITO","BERA","ZRO","AEVO","EIGEN","ALT","ARKM","CETUS","DEEP"]);
  if(high.has(t)) return "HIGH VOL";
  if(narr.has(t)) return "NARRATIVE";
  if(["BTC","ETH","SOL","SUI","SEI","ARB","OP","DOGE","LINK","AVAX","BNB","XRP","ATOM","UNI","AAVE"].includes(t)) return "CEX SAFE";
  return "WILD CARD";
}
function stillValid(r){
  if(!r || !(r.signalType==="BUY" || r.signalType==="SELL")) return false;
  if(r.hitTP1 || r.hitTP2 || r.hitInvalid || r.hitInvalidation) return false;
  const p=n(r.currentPrice||r.signalPrice), tp1=n(r.tp1), inv=n(r.invalidation);
  if(!p) return false;
  if(r.signalType==="BUY"){
    if(tp1 && p>=tp1) return false;
    if(inv && p<=inv) return false;
  } else {
    if(tp1 && p<=tp1) return false;
    if(inv && p>=inv) return false;
  }
  return true;
}
function action(r, capital=10, mode="EXTREME"){
  const p=n(r.currentPrice||r.signalPrice), tp1=n(r.tp1), tp2=n(r.tp2), inv=n(r.invalidation);
  const sec=n(r.securityScore);
  const toTp2=p&&tp2?((tp2-p)/p)*100:0;
  const risk=p&&inv?Math.abs(((inv-p)/p)*100):99;
  const b=bucket(r);
  if(r.signalType==="SELL") return {label:"SKIP SELL", size:0, score:0};
  if(sec>=95 && r.hitTrigger && toTp2>=4 && risk<=16) return {label:"GRAB NOW", size:capital*0.7, score:95};
  if(mode==="EXTREME" && b==="HIGH VOL" && sec>=65 && toTp2>=6) return {label:"HIGH VOL SCOUT", size:capital*0.25, score:75};
  if(mode==="EXTREME" && b==="NARRATIVE" && sec>=65 && toTp2>=6) return {label:"ATTACK ENTRY", size:capital*0.45, score:76};
  if(sec>=85 && toTp2>=5) return {label:"ENTER SMALL", size:capital*0.4, score:72};
  return {label:"SCOUT ENTRY", size:capital*0.2, score:55};
}
function orderFields(r, size){
  const entry=n(r.currentPrice||r.signalPrice);
  const qty=entry>0?n(size)/entry:0;
  return {
    tp:n(r.tp1),
    slTrig:entry*0.9825,
    slPrice:entry*0.978,
    qty
  };
}

function Header({status, sync}){
  return <header className="hero">
    <div>
      <p className="eyebrow">SNITCH X · React31 Object Patch v10.15.3</p>
      <h1>Stable interface with object-render crash protection</h1>
      <p className="sub">Fixes React error #31 caused by route objects being rendered directly. All route objects are converted to safe text.</p>
    </div>
    <div className="hero-card sync-card">
      <span>Status</span>
      <b>{status}</b>
      <button className="mini-btn sync-now" onClick={sync}>Sync Now</button>
    </div>
  </header>
}

function Scanner({records}){
  const rows=records.filter(stillValid).slice(0,80);
  return <section className="performance-lab">
    <div className="lab-head"><div><p className="eyebrow">Scanner</p><h2>Fresh active records</h2><p className="muted">Only current valid records from tracker-db.json.</p></div></div>
    <div className="table-wrap"><table className="tracker-table"><thead><tr><th>Pair</th><th>Signal</th><th>Bucket</th><th>Current</th><th>TP1/TP2</th><th>Invalid</th><th>Route</th></tr></thead><tbody>
      {rows.length===0?<tr><td colSpan={7} className="empty-cell">No fresh rows. Run GitHub Actions tracker.</td></tr>:rows.map(r=>{const rt=route(r);return <tr key={r.id}>
        <td><a href={r.url} target="_blank" rel="noreferrer">{txt(r.pairLabel)}</a><small>{txt(r.chain)} · {txt(r.dex)}</small></td>
        <td><span className={`signal-pill ${r.signalType==="SELL"?"sell":"buy"}`}>{txt(r.signalType)}</span><small>{txt(r.category)} · {txt(r.securityStatus)} {n(r.securityScore)}</small></td>
        <td><span className="bucket-pill">{bucket(r)}</span></td>
        <td>${price(r.currentPrice||r.signalPrice)}</td>
        <td>${price(r.tp1)} / ${price(r.tp2)}</td>
        <td>${price(r.invalidation)}</td>
        <td><a className="action-link" href={rt.url} target="_blank" rel="noreferrer">{txt(rt.label)}</a><small>{txt(rt.mode)}</small></td>
      </tr>})}
    </tbody></table></div>
  </section>
}

function TradeAction({records, investments, setInvestments}){
  const [capital,setCapital]=useState(10);
  const [mode,setMode]=useState("EXTREME");
  const rows=useMemo(()=>{
    const map=new Map();
    records.filter(stillValid).map(r=>{
      const a=action(r,n(capital),mode);
      const rt=route(r);
      const score=a.score + n(r.securityScore) + (rt.mode==="Binance Direct"?40:rt.mode==="Binance Mirror"?10:-80);
      return {...r,a,rt,score};
    }).filter(x=>x.a.size>0).sort((a,b)=>b.score-a.score).forEach(x=>{
      const key=x.rt.pair||x.pairLabel;
      if(!map.has(key)) map.set(key,x);
    });
    return [...map.values()].slice(0,40);
  },[records,capital,mode]);
  function mark(r){
    const f=orderFields(r,r.a.size);
    const item={diaryId:`${r.id}-${Date.now()}`,id:r.id,pairLabel:r.pairLabel,token:tokenOf(r),url:r.url,entryPrice:n(r.currentPrice||r.signalPrice),investedCapital:n(r.a.size),quantity:f.qty,tp1:n(r.tp1),tp2:n(r.tp2),stopTrigger:f.slTrig,stopLimit:f.slPrice,stopPrice:n(r.invalidation),status:"ACTIVE",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),actionLabel:r.a.label};
    const next=[item,...investments];
    setInvestments(next);
    localStorage.setItem(INVEST_STORE,JSON.stringify(next));
  }
  return <section className="trade-center">
    <div className="lab-head"><div><p className="eyebrow">Trade Action Center</p><h2>Best trade first</h2><p className="muted">Simple stable ranking with Binance TP/SL fields.</p></div><div className="capital-box"><span>Capital</span><div className="capital-input-row"><b>$</b><input type="number" value={capital} onChange={e=>setCapital(e.target.value)}/></div></div></div>
    <div className="lab-filters"><select value={mode} onChange={e=>setMode(e.target.value)}><option value="BALANCED">Balanced</option><option value="AGGRESSIVE">Aggressive</option><option value="EXTREME">Extreme Hunter</option></select></div>
    <div className="table-wrap"><table className="tracker-table action-table"><thead><tr><th>Rank</th><th>Action</th><th>Pair</th><th>Bucket</th><th>TP/SL</th><th>Route</th><th>Diary</th></tr></thead><tbody>
      {rows.length===0?<tr><td colSpan={7} className="empty-cell">No actionable rows.</td></tr>:rows.map((r,i)=>{const f=orderFields(r,r.a.size);return <tr key={r.id}>
        <td><b>{Math.round(r.score)}</b><small>#{i+1}</small></td>
        <td><span className={`aggressive-pill ${r.a.label.includes("GRAB")?"grab":r.a.label.includes("ATTACK")||r.a.label.includes("ENTER")?"enter":"scout"}`}>{txt(r.a.label)}</span><small>Size ${n(r.a.size).toFixed(2)}</small></td>
        <td><a href={r.url} target="_blank" rel="noreferrer">{txt(r.pairLabel)}</a><small>{txt(r.category)} · PASS {n(r.securityScore)}</small></td>
        <td><span className="bucket-pill">{bucket(r)}</span></td>
        <td><div className="binance-fields"><b>TP Limit {price(f.tp)}</b><small>SL Trigger {price(f.slTrig)}</small><small>SL Price {price(f.slPrice)}</small><small>Amount {f.qty.toPrecision(6)} {tokenOf(r)}</small></div></td>
        <td><a className="action-link" href={r.rt.url} target="_blank" rel="noreferrer">{txt(r.rt.label)}</a><small>{txt(r.rt.mode)} → {txt(r.rt.pair)}</small></td>
        <td><button className="mini-btn" onClick={()=>mark(r)}>☆ Mark</button></td>
      </tr>})}
    </tbody></table></div>
  </section>
}

function Plan({records, investments}){
  const [capital,setCapital]=useState(50);
  const [max,setMax]=useState(4);
  const rows=useMemo(()=>records.filter(stillValid).map(r=>{
    const a=action(r,n(capital),"EXTREME"); return {...r,a,rt:route(r),score:a.score+n(r.securityScore)};
  }).filter(x=>x.a.size>0).sort((a,b)=>b.score-a.score).slice(0,n(max)),[records,capital,max]);
  const deploy=rows.reduce((s,r)=>s+n(r.a.size),0);
  return <section className="trade-center">
    <div className="lab-head"><div><p className="eyebrow">Customize Investment Plan</p><h2>Capital attack plan</h2></div><div className="capital-box"><span>Capital</span><div className="capital-input-row"><b>$</b><input type="number" value={capital} onChange={e=>setCapital(e.target.value)}/></div></div></div>
    <div className="lab-filters"><select value={max} onChange={e=>setMax(e.target.value)}><option value="2">Max 2</option><option value="4">Max 4</option><option value="6">Max 6</option></select></div>
    <section className="stats lab-stats"><div><span>Deploy</span><b>${deploy.toFixed(2)}</b></div><div><span>Reserve</span><b>${Math.max(0,n(capital)-deploy).toFixed(2)}</b></div><div><span>Positions</span><b>{rows.length}</b></div><div><span>Diary</span><b>{investments.length}</b></div></section>
    <div className="table-wrap"><table className="tracker-table"><thead><tr><th>#</th><th>Pair</th><th>Action</th><th>Size</th><th>TP/SL</th></tr></thead><tbody>{rows.map((r,i)=>{const f=orderFields(r,r.a.size);return <tr key={r.id}><td>{i+1}</td><td>{txt(r.pairLabel)}</td><td>{txt(r.a.label)}</td><td>${n(r.a.size).toFixed(2)}</td><td>TP {price(f.tp)} / SL {price(f.slTrig)} / {price(f.slPrice)}</td></tr>})}</tbody></table></div>
  </section>
}

function Success({records}){
  const rows=records.filter(r=>r.hitTP1||r.hitTP2||String(r.resultStatus||"").includes("SUCCESS"));
  return <section className="performance-lab"><div className="lab-head"><div><p className="eyebrow">Success Forecast</p><h2>Winners database</h2></div></div><div className="table-wrap"><table className="tracker-table"><tbody>{rows.length===0?<tr><td className="empty-cell">No success records yet.</td></tr>:rows.map(r=><tr key={r.id}><td>{txt(r.pairLabel)}</td><td>{r.resultStatus||r.result}</td><td>${price(r.signalPrice)} → ${price(r.currentPrice)}</td></tr>)}</tbody></table></div></section>
}

function Diary({investments,setInvestments}){
  function remove(id){ const next=investments.filter(x=>x.diaryId!==id); setInvestments(next); localStorage.setItem(INVEST_STORE,JSON.stringify(next));}
  return <section className="performance-lab"><div className="lab-head"><div><p className="eyebrow">Investment Diary</p><h2>Manual holdings</h2></div></div><div className="table-wrap"><table className="tracker-table"><thead><tr><th>Pair</th><th>Entry</th><th>Capital</th><th>Qty</th><th>TP/SL</th><th></th></tr></thead><tbody>{investments.length===0?<tr><td colSpan={6} className="empty-cell">No diary rows.</td></tr>:investments.map(x=><tr key={x.diaryId}><td>{txt(x.pairLabel)}</td><td>{price(x.entryPrice)}</td><td>${n(x.investedCapital).toFixed(2)}</td><td>{n(x.quantity).toPrecision(6)} {txt(x.token)}</td><td>TP {price(x.tp1)} / SL {price(x.stopTrigger)}</td><td><button className="mini-btn" onClick={()=>remove(x.diaryId)}>Remove</button></td></tr>)}</tbody></table></div></section>
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
      const succ=Array.isArray(d.successForecasts)?d.successForecasts.map(x=>({...x,id:`success-${x.id}-${x.successLevel||"TP"}`,hitTP1:true,hitTP2:x.successLevel==="TP2",currentPrice:x.currentPrice||x.tp2||x.tp1,trackedAt:x.completedAt,lastUpdated:x.completedAt})):[];
      setRecords([...rec,...succ]);
      setStatus(`Loaded ${rec.length} active rows · ${new Date().toLocaleTimeString()}`);
    }catch(e){ setStatus(`Sync failed: ${e.message}`); }
  }
  useEffect(()=>{ sync(); try{const raw=localStorage.getItem(INVEST_STORE); if(raw) setInvestments(JSON.parse(raw));}catch{} const t=setInterval(sync,60000); return()=>clearInterval(t); },[]);
  return <main>
    <Header status={status} sync={sync}/>
    <section className="tabbar">
      <button className={tab==="scanner"?"tab active":"tab"} onClick={()=>setTab("scanner")}>Scanner</button>
      <button className={tab==="action"?"tab active":"tab"} onClick={()=>setTab("action")}>Trade Action Center</button>
      <button className={tab==="plan"?"tab active":"tab"} onClick={()=>setTab("plan")}>Customize Investment Plan</button>
      <button className={tab==="success"?"tab active":"tab"} onClick={()=>setTab("success")}>Success Forecast</button>
      <button className={tab==="diary"?"tab active":"tab"} onClick={()=>setTab("diary")}>Investment Diary</button>
    </section>
    {tab==="scanner"&&<Scanner records={records}/>}
    {tab==="action"&&<TradeAction records={records} investments={investments} setInvestments={setInvestments}/>}
    {tab==="plan"&&<Plan records={records} investments={investments}/>}
    {tab==="success"&&<Success records={records}/>}
    {tab==="diary"&&<Diary investments={investments} setInvestments={setInvestments}/>}
  </main>
}