import { useEffect, useMemo, useRef, useState } from "react";

const RADAR = ["ETH","SOL","BTC","BNB","XRP","ARB","ONDO","TON","SUI","LINK","DOGE","PEPE","WIF","SEI","FET","RNDR","AVAX","OP","INJ","TIA"];
const STORE = "snitch_x_v6_buy_sell_lab";
const REMOTE = `${import.meta.env.BASE_URL || "/"}tracker-db.json`;
const MAJOR_QUOTES = new Set(["USDC","USDT","WETH","ETH","WBTC","BTC","SOL","WSOL","BNB","WBNB","DAI","USD"]);
const STABLE_QUOTES = new Set(["USDC","USDT","DAI","USD"]);
const MAJOR_DEX = new Set(["uniswap","pancakeswap","raydium","orca","meteora","aerodrome","camelot","sushiswap","curve","balancer","traderjoe","quickswap","ekubo","cetus","velodrome","osmosis"]);

function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,v))}
function norm(v){return String(v||"").trim().toLowerCase()}
function money(v){const x=n(v,NaN);if(!Number.isFinite(x))return"N/A";if(Math.abs(x)>=1e9)return`$${(x/1e9).toFixed(2)}B`;if(Math.abs(x)>=1e6)return`$${(x/1e6).toFixed(2)}M`;if(Math.abs(x)>=1e3)return`$${(x/1e3).toFixed(2)}K`;return`$${x.toFixed(2)}`}
function price(v){const x=n(v,NaN);if(!Number.isFinite(x))return"N/A";if(Math.abs(x)>=100)return x.toFixed(2);if(Math.abs(x)>=1)return x.toFixed(4);if(Math.abs(x)>=0.01)return x.toFixed(6);return x.toPrecision(5)}
function pmove(a,b){a=n(a);b=n(b);return a>0&&b>0?((b-a)/a)*100:0}
function qt(q){q=String(q||"").toUpperCase();if(STABLE_QUOTES.has(q))return 3;if(["WETH","ETH","WBTC","BTC","SOL","WSOL","BNB","WBNB"].includes(q))return 2;return MAJOR_QUOTES.has(q)?1:0}
function matchScore(p,q){q=norm(q);if(!q)return 0;const bs=norm(p?.baseToken?.symbol),bn=norm(p?.baseToken?.name),ba=norm(p?.baseToken?.address),qa=norm(p?.quoteToken?.address),pa=norm(p?.pairAddress);if([ba,qa,pa].includes(q))return 40;if(q===bs)return 35;if(bn===q)return 25;if(bn.includes(q)||bs.includes(q))return 12;return -10}

function analyze(pair, query, opts){
  const px=n(pair?.priceUsd), liq=n(pair?.liquidity?.usd), vol=n(pair?.volume?.h24), vol6=n(pair?.volume?.h6);
  const h1=n(pair?.priceChange?.h1), h6=n(pair?.priceChange?.h6), h24=n(pair?.priceChange?.h24);
  const buys=n(pair?.txns?.h24?.buys), sells=n(pair?.txns?.h24?.sells), tx=buys+sells;
  const buyFlow=tx?buys/tx*100:50, sellFlow=100-buyFlow;
  const quote=String(pair?.quoteToken?.symbol||"").toUpperCase(), dex=norm(pair?.dexId), qTier=qt(quote);
  const ms=matchScore(pair,query);
  const reject = !pair?.pairAddress || !px || liq<n(opts.minLiquidity) || vol<10000 || tx<25 || (qTier<2 && vol<250000);
  let valid=42+ms + (liq>=1e6?16:liq>=2e5?10:0) + (vol>=1e6?13:vol>=1e5?7:-10) + (tx>=500?10:tx>=100?6:-8) + (qTier>=2?8:-10) + (MAJOR_DEX.has(dex)?5:0);
  let exec=42 + (h1>-2&&h1<6?8:0) + (h6>0&&h6<15?12:0) + (h24>0&&h24<35?12:0) + (liq>=2e5?8:0) + (vol6>=1e5?8:0) + (buyFlow>=52&&buyFlow<=70?6:0) + (tx>=100?5:0) - ((h1>12||h6>30||h24>80)?25:0);
  let opp=40+ms*.4 + (vol>=1e6?14:0) + (liq>=250000?8:0) + (h24>2&&h24<35?12:0) + (h6>1&&h6<18?8:0) + (buyFlow>55?6:0) - (h24>80?18:0);
  let risk=42 + (liq<100000?22:0) + (vol<100000?18:0) + (tx<25?14:0) + (h24>80||h24<-35?18:0) + (qTier<2?12:0) + (reject?20:0);
  valid=clamp(valid);exec=clamp(exec);opp=clamp(opp);risk=clamp(risk);
  const bull = !reject && qTier>=2 && vol>=250000 && tx>=150 && valid>=78 && exec>=76 && risk<=62 && buyFlow>=45;
  const prime = !reject && qTier>=2 && vol>=100000 && tx>=80 && valid>=72 && exec>=72 && risk<=64 && buyFlow>=40;
  const bearScore=(sellFlow>=58?22:sellFlow>=54?14:sellFlow>=50?6:0)+(h1<-1?10:0)+(h6<-2?10:0)+(h24<-3?10:0)+(vol>=250000?8:0)+(tx>=150?6:0)-(buyFlow>=56?12:0)-(h24>8?10:0);
  const bear = !reject && qTier>=2 && vol>=150000 && tx>=100 && valid>=65 && bearScore>=34;
  let signal="NONE", decision="WAIT", action="No clean signal yet.";
  if(bear && !bull){signal="SELL"; decision="SELL WATCH"; action="Bearish pressure. If holding, protect capital / avoid fresh buy."}
  else if(bull){signal="BUY"; decision="BUY WATCH"; action="Bullish watch. Wait buy zone bounce or breakout retest."}
  else if(prime){signal="BUY"; decision="PRIME WATCH"; action="Valid bullish candidate. Lower confidence than BUY WATCH, but worth tracking."}
  else if(reject){decision="FILTERED"; action="Filtered by quality/liquidity/volume rule."}

  const levels = levelsFor(px,h24,signal);
  return {
    id:`${pair.chainId}-${pair.pairAddress}-${signal==="SELL"?"SELL":"BUY"}`, pairKey:`${pair.chainId}-${pair.pairAddress}`,
    token:pair?.baseToken?.symbol||"UNKNOWN", pairLabel:`${pair?.baseToken?.symbol||"?"}/${pair?.quoteToken?.symbol||"?"}`,
    chain:pair?.chainId||"unknown", dex:pair?.dexId||"unknown", quote, url:pair?.url||"#", priceUsd:px,
    liquidityUsd:liq, volume24h:vol, h1,h6,h24, tx24:tx, buyPressure:buyFlow, sellPressure:sellFlow,
    validity:valid, execution:exec, opportunity:opp, risk, bearScore, signalType:signal, category:null, decision, action, levels, raw:pair
  }
}
function levelsFor(p,h24,signal){
  if(signal==="SELL"){
    const zone=p*(h24<=0?1.035:1.055), zoneLow=zone*.985, zoneHigh=zone*1.005, trigger=p*(h24<=0?.965:.94), invalidation=zone*1.035, tp1=p*.945, tp2=p*.89;
    return{zoneLow,zoneHigh,trigger,invalidation,tp1,tp2,rr:p&&invalidation?Math.abs(p-tp1)/Math.abs(invalidation-p):0}
  }
  const support=p*(h24>=0?.965:.94), zoneLow=support*.995, zoneHigh=support*1.015, trigger=p*(h24>=0?1.045:1.03)*1.006, invalidation=support*.965, tp1=p*1.055, tp2=p*1.11;
  return{zoneLow,zoneHigh,trigger,invalidation,tp1,tp2,rr:p&&invalidation?Math.abs(tp1-p)/Math.abs(p-invalidation):0}
}
function assessSecurity(item, mode="balanced"){
  const flags=[]; const liq=n(item.liquidityUsd), vol=n(item.volume24h), tx=n(item.tx24);
  const q=String(item.quote||item.raw?.quoteToken?.symbol||"").toUpperCase(); const dex=norm(item.dex);
  const priceOk=n(item.priceUsd)>0; const volLiq=liq>0?vol/liq:0; const buyFlow=n(item.buyPressure,50), sellFlow=n(item.sellPressure,50);
  const h24=n(item.h24); const qTier=qt(q); let score=100; let blocked=false;
  if(!priceOk){score-=100; flags.push("Invalid price"); blocked=true;}
  if(liq<25000){score-=45; flags.push("Very low liquidity"); if(mode!=="loose") blocked=true;} else if(liq<100000){score-=22; flags.push("Low liquidity");}
  if(vol<10000){score-=22; flags.push("Weak volume");}
  if(tx<25){score-=18; flags.push("Low transaction count");}
  if(liq>1000000 && volLiq<0.01){score-=25; flags.push("Dead pool risk");} else if(volLiq<0.05){score-=10; flags.push("Low turnover");}
  if(qTier===0){score-=18; flags.push("Non-major quote");} else if(qTier===1){score-=8; flags.push("Medium quote asset");}
  if(sellFlow>=75){score-=16; flags.push("Heavy sell pressure");}
  if(buyFlow>=85){score-=12; flags.push("One-sided buy flow");}
  if(h24>120){score-=35; flags.push("Extreme pump risk"); if(mode==="strict") blocked=true;} else if(h24>70){score-=18; flags.push("Already pumped");}
  if(h24<-60){score-=28; flags.push("Severe dump risk"); if(mode==="strict") blocked=true;}
  if(!MAJOR_DEX.has(dex)){score-=8; flags.push("Less common DEX");}
  score=clamp(score); if(score<35 && mode!=="loose") blocked=true; if(score<25) blocked=true;
  let status="PASS"; if(blocked) status="BLOCKED"; else if(score<65) status="HIGH RISK"; else if(score<88) status="CAUTION";
  if(!flags.length) flags.push("No major public-data security warning");
  return {securityScore:Math.round(score), securityStatus:status, securityFlags:flags.slice(0,5)};
}
function securityAllowsTracking(item, mode){
  if(!item.security) return true; if(item.security.securityStatus==="BLOCKED") return false; if(mode==="strict" && item.security.securityStatus==="HIGH RISK") return false; return true;
}

function getCategory(item){
  const created = n(item.raw?.pairCreatedAt);
  const ageDays = created ? (Date.now() - created) / 86400000 : 999;
  const volLiq = item.liquidityUsd > 0 ? item.volume24h / item.liquidityUsd : 0;
  const absMove = Math.abs(n(item.h24));

  const golden =
    item.signalType === "BUY" &&
    item.liquidityUsd >= 100000 &&
    item.liquidityUsd <= 10000000 &&
    item.volume24h >= 250000 &&
    item.tx24 >= 150 &&
    item.buyPressure >= 50 &&
    item.buyPressure <= 70 &&
    item.risk <= 62 &&
    absMove >= 1 &&
    absMove <= 65 &&
    volLiq >= 0.15;

  const newPair =
    ageDays <= 1 &&
    item.liquidityUsd >= 50000 &&
    item.volume24h >= 25000 &&
    item.tx24 >= 30;

  if (golden) return "GOLDEN WATCH";
  if (newPair) return "NEW PAIR";
  if (item.signalType === "SELL") return "SELL WATCH";
  if (item.decision === "PRIME WATCH") return "PRIME WATCH";
  if (item.signalType === "BUY") return "BUY WATCH";
  return "WAIT";
}

function rank(x){return x.validity*.85+x.execution*1.05+x.opportunity*.55-x.risk*.6+n(x.bearScore)*(x.signalType==="SELL"?1.1:.1)+(x.signalType==="BUY"?34:x.signalType==="SELL"?30:0)+Math.log10(Math.max(1,x.volume24h))*3}
function dclass(x){return x.signalType==="SELL"?"sell":x.signalType==="BUY"?"hot":x.decision==="FILTERED"?"avoid":"wait"}

function recFrom(item,source="frontend"){
  const t=new Date().toISOString(), l=item.levels||{};
  return {id:item.id,pairKey:item.pairKey,token:item.token,pairLabel:item.pairLabel,chain:item.chain,dex:item.dex,url:item.url,source,version:"v6-mixed-buy-sell",
    signalType:item.signalType,category:item.category,security:item.security,securityScore:item.security?.securityScore||0,securityStatus:item.security?.securityStatus||"UNKNOWN",securityFlags:item.security?.securityFlags||[],signal:item.decision,trackedAt:t,firstSeenAt:t,lastUpdated:t,signalPrice:item.priceUsd,currentPrice:item.priceUsd,maxHigh:item.priceUsd,maxLow:item.priceUsd,
    zoneLow:l.zoneLow,zoneHigh:l.zoneHigh,trigger:l.trigger,invalidation:l.invalidation,tp1:l.tp1,tp2:l.tp2,rr:l.rr,
    opportunity:item.opportunity,execution:item.execution,validity:item.validity,risk:item.risk,bearScore:item.bearScore,liquidityUsd:item.liquidityUsd,volume24h:item.volume24h,tx24:item.tx24,buyPressure:item.buyPressure,sellPressure:item.sellPressure,
    hitZone:false,hitTrigger:false,hitTP1:false,hitTP2:false,hitInvalidation:false,currentMovePct:0,forecastGoodPct:0,adverseMovePct:0,status:"ACTIVE",result:"TRACKING",updateCount:1}
}
function updateRec(r,item){
  const p=n(item.priceUsd,r.currentPrice), high=Math.max(n(r.maxHigh,p),p), low=r.maxLow?Math.min(n(r.maxLow,p),p):p, isSell=r.signalType==="SELL";
  const hitZone=!!(r.hitZone||(p>=n(r.zoneLow)&&p<=n(r.zoneHigh))||(low<=n(r.zoneHigh)&&high>=n(r.zoneLow)));
  const hitTrigger=!!(r.hitTrigger||(isSell?low<=n(r.trigger):high>=n(r.trigger)));
  const hitTP1=!!(r.hitTP1||(isSell?low<=n(r.tp1):high>=n(r.tp1)));
  const hitTP2=!!(r.hitTP2||(isSell?low<=n(r.tp2):high>=n(r.tp2)));
  const hitInvalidation=!!(r.hitInvalidation||(isSell?high>=n(r.invalidation):low<=n(r.invalidation)));
  const cur=pmove(r.signalPrice,p), up=pmove(r.signalPrice,high), dn=pmove(r.signalPrice,low);
  const forecastGoodPct=isSell?Math.abs(Math.min(0,dn)):Math.max(0,up), adverseMovePct=isSell?Math.max(0,up):Math.abs(Math.min(0,dn));
  let status="MID RANGE", result="NO TRIGGER";
  if(hitTP2){status=isSell?"HIT DOWN TP2":"HIT TP2";result="WIN TP2"}
  else if(hitTP1){status=isSell?"HIT DOWN TP1":"HIT TP1";result="WIN TP1"}
  else if(hitInvalidation){status="INVALIDATED";result="FAILED"}
  else if(hitTrigger){status=isSell?"HIT BREAKDOWN":"HIT BREAKOUT";result=isSell?"BEAR TRIGGER":"BULL TRIGGER"}
  else if(hitZone){status=isSell?"HIT SELL ZONE":"HIT BUY ZONE";result=isSell?"REJECTION WATCH":"BOUNCE WATCH"}
  return {...r,category:item.category||r.category,security:item.security||r.security,securityScore:item.security?.securityScore||r.securityScore||0,securityStatus:item.security?.securityStatus||r.securityStatus||"UNKNOWN",securityFlags:item.security?.securityFlags||r.securityFlags||[],lastUpdated:new Date().toISOString(),currentPrice:p,maxHigh:high,maxLow:low,liquidityUsd:item.liquidityUsd,volume24h:item.volume24h,tx24:item.tx24,buyPressure:item.buyPressure,sellPressure:item.sellPressure,opportunity:item.opportunity,execution:item.execution,validity:item.validity,risk:item.risk,bearScore:item.bearScore,hitZone,hitTrigger,hitTP1,hitTP2,hitInvalidation,currentMovePct:cur,forecastGoodPct,adverseMovePct,status,result,updateCount:n(r.updateCount)+1}
}
function merge(local,remote){const m=new Map();[...(remote||[]),...(local||[])].forEach(r=>{if(!r?.id)return;const e=m.get(r.id);if(!e)m.set(r.id,r);else m.set(r.id,new Date(r.lastUpdated||0)>=new Date(e.lastUpdated||0)?{...e,...r}:{...r,...e})});return[...m.values()].sort((a,b)=>new Date(b.lastUpdated||0)-new Date(a.lastUpdated||0))}
function age(iso){const mins=Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/60000));if(mins<60)return`${mins}m`;const h=Math.floor(mins/60);return h<48?`${h}h`:`${Math.floor(h/24)}d`}

function Score({label,value,inverse=false}){const x=n(value);const cls=!inverse?(x>=75?"good":x>=55?"mid":"bad"):(x<=45?"good":x<=65?"mid":"bad");return <div className={`score ${cls}`}><span>{label}</span><b>{Math.round(x)}</b></div>}
function Card({item,selected,onSelect}){return <button className={`pair-card ${selected?"selected":""}`} onClick={()=>onSelect(item)}><div className="pair-top"><div><h3>{item.token}</h3><p>{item.pairLabel} · {item.chain} · {item.dex}</p></div><span className={`decision ${dclass(item)}`}>{item.decision}</span></div><div className="pair-price"><b>${price(item.priceUsd)}</b><span className={item.h24>=0?"up":"down"}>24H {item.h24.toFixed(2)}%</span></div><div className="score-grid"><Score label="Opp" value={item.opportunity}/><Score label="Exec" value={item.execution}/><Score label="Valid" value={item.validity}/><Score label="Risk" value={item.risk} inverse/></div><div className="mini-grid"><div><span>Liquidity</span><b>{money(item.liquidityUsd)}</b></div><div><span>Volume</span><b>{money(item.volume24h)}</b></div><div><span>Signal</span><b>{item.signalType}</b></div><div><span>Category</span><b>{item.category}</b></div><div><span>Security</span><b>{item.security?.securityStatus} {item.security?.securityScore}</b></div></div></button>}
function Detail({item}){if(!item)return <section className="panel sticky-panel"><h2>Action Detail</h2><p className="muted">Run radar or search token.</p></section>;const l=item.levels, sell=item.signalType==="SELL";return <section className="panel sticky-panel"><div className="detail-head"><div><h2>{item.token} Execution Plan</h2><p>{item.pairLabel} · {item.chain} · {item.dex}</p></div><span className={`decision big ${dclass(item)}`}>{item.decision}</span></div><div className="answer-box"><span>Signal</span><b>{item.signalType} · {item.category}</b><p>{item.action}</p></div><div className="detail-grid"><div><span>Mode</span><b>{sell?"Exit / Sell Watch":"Buy Watch"}</b></div><div><span>Current</span><b>${price(item.priceUsd)}</b></div><div><span>{sell?"Sell Zone":"Buy Zone"}</span><b>${price(l.zoneLow)} – ${price(l.zoneHigh)}</b></div><div><span>{sell?"Breakdown":"Breakout"}</span><b>${price(l.trigger)}</b></div><div><span>Invalidation</span><b>${price(l.invalidation)}</b></div><div><span>{sell?"Down TP1 / TP2":"TP1 / TP2"}</span><b>${price(l.tp1)} / ${price(l.tp2)}</b></div><div><span>RR</span><b>1:{n(l.rr).toFixed(2)}</b></div><div><span>Bear Score</span><b>{Math.round(n(item.bearScore))}</b></div><div><span>Security</span><b>{item.security?.securityStatus} · {item.security?.securityScore}</b></div></div><div className="rule-box"><h4>Forecast Plan</h4><p><b>{item.decision}:</b> {sell?"Bearish pressure detected. If holding, protect capital; if not holding, avoid fresh buy.":"Bullish candidate. No market buy unless buy-zone bounce or breakout retest."}</p><p><b>Performance Lab:</b> Tracks forecast direction, trigger hit, TP hit, invalidation, adverse move and actual follow-through.</p></div><div className="rule-box"><h4>Soft Security Gate</h4><p><b>{item.security?.securityStatus} · {item.security?.securityScore}/100</b></p><p>{(item.security?.securityFlags||[]).join(" · ")}</p></div><a className="dex-link" href={item.url} target="_blank" rel="noreferrer">Open live chart on DexScreener</a></section>}

function Lab({records,remoteLoaded,onExport,onImport,onClear,onSync}){
  const [f,setF]=useState("ALL"),[cat,setCat]=useState("ALL"),[sec,setSec]=useState("ALL"),[sort,setSort]=useState("lastUpdated"),[dir,setDir]=useState("desc");
  function click(k){if(sort===k)setDir(dir==="asc"?"desc":"asc");else{setSort(k);setDir("desc")}}
  const filtered=useMemo(()=>{let a=f==="ALL"?records:records.filter(r=>r.signalType===f); a=cat==="ALL"?a:a.filter(r=>(r.category||"").toUpperCase()===cat); a=sec==="ALL"?a:a.filter(r=>(r.securityStatus||"").toUpperCase()===sec); return[...a].sort((x,y)=>{let av=x[sort],bv=y[sort];if(String(sort).toLowerCase().includes("updated")||String(sort).toLowerCase().includes("at")){av=new Date(av||0).getTime();bv=new Date(bv||0).getTime()}else{av=n(av,av);bv=n(bv,bv)}return dir==="asc"?(av>bv?1:av<bv?-1:0):(av<bv?1:av>bv?-1:0)})},[records,f,cat,sec,sort,dir]);
  const sum=useMemo(()=>{const t=records.length;return{t,b:records.filter(r=>r.signalType==="BUY").length,s:records.filter(r=>r.signalType==="SELL").length,p:records.filter(r=>r.category==="PRIME WATCH").length,g:records.filter(r=>r.category==="GOLDEN WATCH").length,np:records.filter(r=>r.category==="NEW PAIR").length,sec:t?records.reduce((a,r)=>a+n(r.securityScore),0)/t:0,z:records.filter(r=>r.hitZone).length,tr:records.filter(r=>r.hitTrigger).length,tp:records.filter(r=>r.hitTP1).length,iv:records.filter(r=>r.hitInvalidation).length,fg:t?records.reduce((a,r)=>a+n(r.forecastGoodPct),0)/t:0,ad:t?records.reduce((a,r)=>a+n(r.adverseMovePct),0)/t:0}},[records]);
  const TH=({k,children})=><th className="sortable" onClick={()=>click(k)}>{children} {sort===k?(dir==="asc"?"↑":"↓"):""}</th>;
  return <section className="performance-lab"><div className="lab-head"><div><p className="eyebrow">Performance Lab · Mixed Buy/Sell</p><h2>Forecast vs actual database</h2><p className="muted">One table. Category + soft security gate track opportunity while flagging scam-like public-data risks.</p></div><div className="lab-actions"><button className="secondary" onClick={onSync}>Sync Remote DB</button><button className="secondary" onClick={onExport}>Export JSON</button><label className="import-btn">Import JSON<input type="file" accept="application/json" onChange={onImport}/></label><button className="danger-btn" onClick={onClear}>Clear Local</button></div></div><div className="lab-note"><b>Remote loaded:</b> {remoteLoaded?"YES":"NO"} · Click table headers to sort highest/lowest.</div><section className="stats lab-stats"><div><span>Total</span><b>{sum.t}</b></div><div><span>Buy</span><b>{sum.b}</b></div><div><span>Sell</span><b>{sum.s}</b></div><div><span>Prime</span><b>{sum.p}</b></div><div><span>Golden</span><b>{sum.g}</b></div><div><span>New Pair</span><b>{sum.np}</b></div><div><span>Avg Security</span><b>{sum.sec.toFixed(0)}</b></div><div><span>Zone Hit</span><b>{sum.z}</b></div><div><span>Trigger</span><b>{sum.tr}</b></div><div><span>TP1</span><b>{sum.tp}</b></div><div><span>Invalid</span><b>{sum.iv}</b></div><div><span>Forecast Move</span><b>{sum.fg.toFixed(2)}%</b></div><div><span>Adverse</span><b>{sum.ad.toFixed(2)}%</b></div></section><div className="lab-filters"><select value={f} onChange={e=>setF(e.target.value)}><option value="ALL">All Signals</option><option value="BUY">Buy Signals</option><option value="SELL">Sell Signals</option></select><select value={cat} onChange={e=>setCat(e.target.value)}><option value="ALL">All Categories</option><option value="BUY WATCH">Buy Watch</option><option value="PRIME WATCH">Prime Watch</option><option value="SELL WATCH">Sell Watch</option><option value="GOLDEN WATCH">Golden Watch</option><option value="NEW PAIR">New Pair</option></select><select value={sec} onChange={e=>setSec(e.target.value)}><option value="ALL">All Security</option><option value="PASS">Pass</option><option value="CAUTION">Caution</option><option value="HIGH RISK">High Risk</option><option value="BLOCKED">Blocked</option></select><select value={dir} onChange={e=>setDir(e.target.value)}><option value="desc">Highest / Latest first</option><option value="asc">Lowest / Oldest first</option></select></div><div className="table-wrap"><table className="tracker-table"><thead><tr><TH k="trackedAt">Age</TH><TH k="signalType">Signal</TH><TH k="category">Category</TH><TH k="securityScore">Security</TH><th>Pair</th><TH k="status">Status</TH><TH k="signalPrice">Signal Price</TH><TH k="currentPrice">Current</TH><TH k="currentMovePct">Move</TH><TH k="forecastGoodPct">Forecast</TH><TH k="adverseMovePct">Adverse</TH><TH k="zoneLow">Zone</TH><TH k="trigger">Trigger</TH><TH k="tp1">TP1/TP2</TH><TH k="invalidation">Invalid</TH><th>Hits</th><TH k="lastUpdated">Updated</TH></tr></thead><tbody>{filtered.length===0?<tr><td colSpan="17" className="empty-cell">No records.</td></tr>:filtered.map(r=><tr key={r.id}><td>{age(r.trackedAt)}</td><td><span className={`signal-pill ${r.signalType==="SELL"?"sell":"buy"}`}>{r.signalType}</span></td><td><span className={`category-pill ${String(r.category).includes("GOLDEN")?"golden":String(r.category).includes("PRIME")?"prime":String(r.category).includes("NEW")?"newpair":r.signalType==="SELL"?"sell":"buy"}`}>{r.category||r.signal}</span></td><td><span className={`security-pill ${String(r.securityStatus).includes("PASS")?"pass":String(r.securityStatus).includes("CAUTION")?"caution":String(r.securityStatus).includes("BLOCKED")?"blocked":"risk"}`}>{r.securityStatus||"UNKNOWN"} {n(r.securityScore).toFixed(0)}</span></td><td><a href={r.url} target="_blank" rel="noreferrer">{r.pairLabel}</a><small>{r.chain} · {r.dex}</small></td><td><span className={`status-pill ${String(r.result).includes("WIN")?"win":String(r.result).includes("FAILED")?"fail":"active"}`}>{r.status}</span></td><td>${price(r.signalPrice)}</td><td>${price(r.currentPrice)}</td><td className={n(r.currentMovePct)>=0?"up":"down"}>{n(r.currentMovePct).toFixed(2)}%</td><td className="up">{n(r.forecastGoodPct).toFixed(2)}%</td><td className="down">{n(r.adverseMovePct).toFixed(2)}%</td><td>${price(r.zoneLow)}–${price(r.zoneHigh)}</td><td>${price(r.trigger)}</td><td>${price(r.tp1)} / ${price(r.tp2)}</td><td>${price(r.invalidation)}</td><td><div className="hit-grid"><span className={r.hitZone?"hit yes":"hit"}>ZN</span><span className={r.hitTrigger?"hit yes":"hit"}>TR</span><span className={r.hitTP1?"hit yes":"hit"}>T1</span><span className={r.hitTP2?"hit yes":"hit"}>T2</span><span className={r.hitInvalidation?"hit bad":"hit"}>INV</span></div></td><td>{new Date(r.lastUpdated||r.trackedAt).toLocaleString()}</td></tr>)}</tbody></table></div></section>
}

export default function App(){
  const [query,setQuery]=useState(""),[items,setItems]=useState([]),[selected,setSelected]=useState(null),[status,setStatus]=useState("Ready"),[loading,setLoading]=useState(false),[tab,setTab]=useState("scanner"),[records,setRecords]=useState([]),[remote,setRemote]=useState(false),[minLiquidity,setMinLiquidity]=useState(200000),[strictness,setStrictness]=useState("balanced"),[securityMode,setSecurityMode]=useState("balanced"),[showRejected,setShowRejected]=useState(false);
  const ref=useRef([]); const opts={minLiquidity,strictness,securityMode,hideRejected:!showRejected};
  useEffect(()=>{try{const raw=localStorage.getItem(STORE);const arr=raw?JSON.parse(raw):[];if(Array.isArray(arr)){ref.current=arr;setRecords(arr)}}catch{};syncRemote()},[]);
  function persist(next){const s=[...next].sort((a,b)=>new Date(b.lastUpdated||0)-new Date(a.lastUpdated||0));ref.current=s;setRecords(s);localStorage.setItem(STORE,JSON.stringify(s))}
  async function syncRemote(){try{const r=await fetch(`${REMOTE}?t=${Date.now()}`);if(!r.ok)throw Error();const d=await r.json();const arr=Array.isArray(d.records)?d.records:Array.isArray(d)?d:[];persist(merge(ref.current,arr));setRemote(true)}catch{setRemote(false)}}
  function track(list,source){const m=new Map(ref.current.map(r=>[r.id,r]));list.filter(x=>x.signalType==="BUY"||x.signalType==="SELL").forEach(x=>{const e=m.get(x.id);m.set(x.id,e?updateRec(e,x):recFrom(x,source))});list.forEach(x=>{const e=m.get(x.id);if(e)m.set(x.id,updateRec(e,x))});persist([...m.values()])}
  function process(pairs,q){const a=(pairs||[]).map(p=>{const x=analyze(p,q,opts); x.security=assessSecurity(x,opts.securityMode); x.category=getCategory(x); return x}).filter(x=>showRejected?true:(x.decision!=="FILTERED" && securityAllowsTracking(x,opts.securityMode)));const m=new Map();a.forEach(x=>{const key=`${String(x.token).toUpperCase()}-${x.signalType}`;const e=m.get(key);if(!e||rank(x)>rank(e))m.set(key,x)});return[...m.values()].sort((a,b)=>rank(b)-rank(a)).slice(0,50)}
  async function search(q=query){q=String(q||"").trim();if(!q)return;setLoading(true);setStatus(`Searching ${q}...`);try{const r=await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`);const d=await r.json();const ranked=process(d.pairs,q);setItems(ranked);setSelected(ranked[0]||null);track(ranked,"search");setStatus(`Loaded ${ranked.length} mixed signals for ${q}`)}catch(e){setStatus(`Failed: ${e.message}`)}finally{setLoading(false)}}
  async function radar(){setLoading(true);setStatus("Radar scanning mixed buy/sell...");try{let all=[];for(const t of RADAR){const r=await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(t)}`);if(!r.ok)continue;const d=await r.json();all.push(...process(d.pairs,t).slice(0,2))}const m=new Map();all.forEach(x=>{const key=`${String(x.token).toUpperCase()}-${x.signalType}`;const e=m.get(key);if(!e||rank(x)>rank(e))m.set(key,x)});const ranked=[...m.values()].sort((a,b)=>rank(b)-rank(a)).slice(0,50);setItems(ranked);setSelected(ranked[0]||null);track(ranked,"radar");setStatus(`Radar found ${ranked.length} mixed buy/sell signals`)}catch(e){setStatus(`Radar failed: ${e.message}`)}finally{setLoading(false)}}
  function exp(){const blob=new Blob([JSON.stringify({version:"v6",exportedAt:new Date().toISOString(),records:ref.current},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="snitch-x-v6-mixed-tracker.json";a.click();URL.revokeObjectURL(url)}
  function imp(e){const file=e.target.files?.[0];if(!file)return;const rd=new FileReader();rd.onload=()=>{try{const d=JSON.parse(String(rd.result||"[]"));persist(merge(ref.current,Array.isArray(d.records)?d.records:d))}catch{alert("Invalid JSON")}};rd.readAsText(file);e.target.value=""}
  function clr(){if(confirm("Clear local tracker?"))persist([])}
  const stats=useMemo(()=>({buy:items.filter(x=>x.signalType==="BUY").length,sell:items.filter(x=>x.signalType==="SELL").length,avg:items.length?Math.round(items.reduce((s,x)=>s+x.execution,0)/items.length):0}),[items]);
  return <main><header className="hero"><div><p className="eyebrow">SNITCH X · Soft Security Gate v8</p><h1>Track opportunity with a soft security layer.</h1><p className="sub">V8 adds PASS / CAUTION / HIGH RISK / BLOCKED scoring without killing early opportunities.</p></div><div className="hero-card"><span>Status</span><b>{loading?"Scanning...":status}</b></div></header><section className="tabbar"><button className={tab==="scanner"?"tab active":"tab"} onClick={()=>setTab("scanner")}>Scanner</button><button className={tab==="lab"?"tab active":"tab"} onClick={()=>setTab("lab")}>Performance Lab</button></section>{tab==="scanner"?<><section className="toolbar"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} placeholder="Search token e.g. ETH, PEPE"/><select value={minLiquidity} onChange={e=>setMinLiquidity(Number(e.target.value))}><option value="0">No liquidity filter</option><option value="50000">Min liquidity $50K</option><option value="200000">Min liquidity $200K</option><option value="1000000">Min liquidity $1M</option></select><select value={strictness} onChange={e=>setStrictness(e.target.value)}><option value="hunter">hunter</option><option value="balanced">balanced</option><option value="strict">strict</option></select><select value={securityMode} onChange={e=>setSecurityMode(e.target.value)}><option value="loose">security loose</option><option value="balanced">security balanced</option><option value="strict">security strict</option></select><button onClick={()=>search()} disabled={loading}>Search</button><button className="secondary" onClick={radar} disabled={loading}>Run Radar</button></section><section className="toggle-row"><label><input type="checkbox" checked={showRejected} onChange={e=>setShowRejected(e.target.checked)}/>Show rejected / bad-data pairs</label></section><section className="stats"><div><span>Pairs</span><b>{items.length}</b></div><div><span>Buy Watch</span><b>{stats.buy}</b></div><div><span>Sell Watch</span><b>{stats.sell}</b></div><div><span>Tracked DB</span><b>{records.length}</b></div><div><span>Avg Execution</span><b>{stats.avg}</b></div></section><section className="layout"><div className="list">{items.length===0?<div className="empty"><h2>No signals loaded yet</h2><p>Run Radar to collect mixed BUY WATCH and SELL WATCH records.</p></div>:items.map(it=><Card key={it.id} item={it} selected={selected?.id===it.id} onSelect={setSelected}/>)}</div><Detail item={selected}/></section></>:<Lab records={records} remoteLoaded={remote} onExport={exp} onImport={imp} onClear={clr} onSync={syncRemote}/>}</main>
}
