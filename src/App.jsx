import { useEffect, useMemo, useRef, useState } from "react";

const RADAR = ["ETH","SOL","BTC","BNB","XRP","ARB","ONDO","TON","SUI","LINK","DOGE","PEPE","WIF","SEI","FET","RNDR","AVAX","OP","INJ","TIA"];
const STORE = "snitch_x_v6_buy_sell_lab";
const INVEST_STORE = "snitch_x_v10_6_investment_diary";
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

function itemFromRecord(r){
  const current = n(r.currentPrice ?? r.signalPrice);
  const signalPrice = n(r.signalPrice ?? current);
  const levels = {
    zoneLow: n(r.zoneLow),
    zoneHigh: n(r.zoneHigh),
    trigger: n(r.trigger),
    invalidation: n(r.invalidation),
    tp1: n(r.tp1),
    tp2: n(r.tp2),
    rr: n(r.rr)
  };
  const security = r.security || {
    securityScore: n(r.securityScore, 0),
    securityStatus: r.securityStatus || "UNKNOWN",
    securityFlags: r.securityFlags || []
  };
  let decision = r.signal || r.decision || (r.signalType === "SELL" ? "AVOID / SELL WATCH" : "WAIT");
  let action = r.action || "";
  if(r.hitInvalidation || r.hitInvalid){ decision = "CUT LOSS / EXIT"; action = "Invalidation hit. Do not enter."; }
  else if(r.hitTP2){ decision = "TAKE PROFIT NOW"; action = "TP2 hit. Do not chase."; }
  else if(r.hitTP1){ decision = "TAKE PROFIT NOW"; action = "TP1 hit. Do not chase."; }
  else if(r.signalType === "SELL"){ decision = "AVOID THIS COIN"; action = "Sell watch. Do not buy spot."; }
  else if(r.hitTrigger){ decision = "BUY SMALL / CAUTION"; action = "Trigger confirmed. Check remaining upside and set stop-loss."; }
  else if(r.hitZone){ decision = "WAIT, GOOD SETUP"; action = "In zone, but trigger not confirmed."; }

  return {
    ...r,
    id: r.id || `${r.pairLabel}-${r.signalType}`,
    token: r.token || String(r.pairLabel||"").split("/")[0],
    pairLabel: r.pairLabel || "UNKNOWN",
    chain: r.chain || "",
    dex: r.dex || "",
    url: r.url || "",
    priceUsd: current,
    signalPrice,
    maxHigh: n(r.maxHigh, current),
    maxLow: n(r.maxLow, current),
    h24: n(r.h24 ?? r.priceChange24h ?? r.movePct ?? 0),
    signalType: r.signalType || "BUY",
    category: r.category || "WAIT",
    decision,
    action,
    levels,
    security,
    opportunity: n(r.opportunity, 0),
    execution: n(r.execution, 0),
    validity: n(r.validity, 0),
    risk: n(r.risk, 50),
    liquidityUsd: n(r.liquidityUsd, 0),
    volume24h: n(r.volume24h, 0),
    tx24: n(r.tx24, 0),
    buyPressure: n(r.buyPressure, 0),
    sellPressure: n(r.sellPressure, 0),
    ageLabel: age(r.lastUpdated || r.trackedAt || new Date().toISOString())
  };
}

function scannerItemsFromRecords(records){
  return [...(records||[])]
    .filter(r => r && (r.signalType === "BUY" || r.signalType === "SELL"))
    .sort((a,b) => {
      const aw = (a.hitTrigger?50:0) + (a.hitZone?20:0) + (String(a.category||"").includes("GOLDEN")?10:0) + n(a.securityScore,0)/10;
      const bw = (b.hitTrigger?50:0) + (b.hitZone?20:0) + (String(b.category||"").includes("GOLDEN")?10:0) + n(b.securityScore,0)/10;
      if(bw !== aw) return bw - aw;
      return new Date(b.lastUpdated||b.trackedAt||0) - new Date(a.lastUpdated||a.trackedAt||0);
    })
    .map(itemFromRecord)
    .slice(0,50);
}

function merge(local,remote){const m=new Map();[...(remote||[]),...(local||[])].forEach(r=>{if(!r?.id)return;const e=m.get(r.id);if(!e)m.set(r.id,r);else m.set(r.id,new Date(r.lastUpdated||0)>=new Date(e.lastUpdated||0)?{...e,...r}:{...r,...e})});return[...m.values()].sort((a,b)=>new Date(b.lastUpdated||0)-new Date(a.lastUpdated||0))}
function age(iso){const mins=Math.max(0,Math.floor((Date.now()-new Date(iso).getTime())/60000));if(mins<60)return`${mins}m`;const h=Math.floor(mins/60);return h<48?`${h}h`:`${Math.floor(h/24)}d`}

function Score({label,value,inverse=false}){const x=n(value);const cls=!inverse?(x>=75?"good":x>=55?"mid":"bad"):(x<=45?"good":x<=65?"mid":"bad");return <div className={`score ${cls}`}><span>{label}</span><b>{Math.round(x)}</b></div>}
function Card({item,selected,onSelect}){return <button className={`pair-card ${selected?"selected":""}`} onClick={()=>onSelect(item)}><div className="pair-top"><div><h3>{item.token}</h3><p>{item.pairLabel} · {item.chain} · {item.dex}</p></div><span className={`decision ${dclass(item)}`}>{item.decision}</span></div><div className="pair-price"><b>${price(item.priceUsd)}</b><span className={item.h24>=0?"up":"down"}>24H {item.h24.toFixed(2)}%</span></div><div className="score-grid"><Score label="Opp" value={item.opportunity}/><Score label="Exec" value={item.execution}/><Score label="Valid" value={item.validity}/><Score label="Risk" value={item.risk} inverse/></div><div className="mini-grid"><div><span>Liquidity</span><b>{money(item.liquidityUsd)}</b></div><div><span>Volume</span><b>{money(item.volume24h)}</b></div><div><span>Signal</span><b>{item.signalType}</b></div><div><span>Category</span><b>{item.category}</b></div><div><span>Security</span><b>{item.security?.securityStatus} {item.security?.securityScore}</b></div></div></button>}
function Detail({item}){if(!item)return <section className="panel sticky-panel"><h2>Action Detail</h2><p className="muted">Run radar or search token.</p></section>;const l=item.levels, sell=item.signalType==="SELL";return <section className="panel sticky-panel"><div className="detail-head"><div><h2>{item.token} Execution Plan</h2><p>{item.pairLabel} · {item.chain} · {item.dex}</p></div><span className={`decision big ${dclass(item)}`}>{item.decision}</span></div><div className="answer-box"><span>Signal</span><b>{item.signalType} · {item.category}</b><p>{item.action}</p></div><div className="detail-grid"><div><span>Mode</span><b>{sell?"Exit / Sell Watch":"Buy Watch"}</b></div><div><span>Current</span><b>${price(item.priceUsd)}</b></div><div><span>{sell?"Sell Zone":"Buy Zone"}</span><b>${price(l.zoneLow)} – ${price(l.zoneHigh)}</b></div><div><span>{sell?"Breakdown":"Breakout"}</span><b>${price(l.trigger)}</b></div><div><span>Invalidation</span><b>${price(l.invalidation)}</b></div><div><span>{sell?"Down TP1 / TP2":"TP1 / TP2"}</span><b>${price(l.tp1)} / ${price(l.tp2)}</b></div><div><span>RR</span><b>1:{n(l.rr).toFixed(2)}</b></div><div><span>Bear Score</span><b>{Math.round(n(item.bearScore))}</b></div><div><span>Security</span><b>{item.security?.securityStatus} · {item.security?.securityScore}</b></div></div><div className="rule-box"><h4>Forecast Plan</h4><p><b>{item.decision}:</b> {sell?"Bearish pressure detected. If holding, protect capital; if not holding, avoid fresh buy.":"Bullish candidate. No market buy unless buy-zone bounce or breakout retest."}</p><p><b>Performance Lab:</b> Tracks forecast direction, trigger hit, TP hit, invalidation, adverse move and actual follow-through.</p></div><div className="rule-box"><h4>Soft Security Gate</h4><p><b>{item.security?.securityStatus} · {item.security?.securityScore}/100</b></p><p>{(item.security?.securityFlags||[]).join(" · ")}</p></div><a className="dex-link" href={item.url} target="_blank" rel="noreferrer">Open live chart on DexScreener</a></section>}


const CEX_TOKEN_SET = new Set([
  "BTC","ETH","SOL","DOGE","PEPE","ARB","OP","SEI","LINK","AVAX","BNB","XRP","SUI","TON","INJ","TIA","ONDO","FET","RNDR","RENDER","WIF",
  "MATIC","POL","ADA","DOT","LTC","BCH","TRX","NEAR","APT","FIL","ETC","ATOM","AAVE","UNI","SAND","GALA","FLOKI","SHIB"
]);

const CEX_DIRECT_TRADE_SET = new Set([
  "BTC","ETH","SOL","DOGE","PEPE","ARB","OP","SEI","LINK","AVAX","BNB","XRP","SUI","TON","INJ","TIA","ONDO","FET","RNDR","RENDER","WIF",
  "ADA","DOT","LTC","BCH","TRX","NEAR","APT","FIL","ETC","ATOM","AAVE","UNI","SAND","GALA","FLOKI","SHIB"
]);

function normalizeTicker(token){
  const t = String(token || "").toUpperCase().trim();
  if(t === "RENDER") return "RENDER";
  if(t === "RNDR") return "RNDR";
  if(t === "WETH") return "ETH";
  if(t === "WBTC") return "BTC";
  if(t === "WBNB") return "BNB";
  if(t === "WSOL") return "SOL";
  return t.replace(/[^A-Z0-9]/g, "");
}

function platformTradeUrl(platform, token){
  const t = normalizeTicker(token);
  if(platform === "Binance") return `https://www.binance.com/en/trade/${t}_USDT?type=spot`;
  if(platform === "OKX") return `https://www.okx.com/trade-spot/${t.toLowerCase()}-usdt`;
  if(platform === "Bybit") return `https://www.bybit.com/trade/spot/${t}/USDT`;
  if(platform === "Kraken") return `https://pro.kraken.com/app/trade/${t.toLowerCase()}-usd`;
  return "#";
}

function platformMarketUrl(platform, token){
  const t = normalizeTicker(token);
  if(platform === "Binance") return `https://www.binance.com/en/markets/overview?search=${t}`;
  if(platform === "OKX") return `https://www.okx.com/markets/prices?search=${t}`;
  if(platform === "Bybit") return `https://www.bybit.com/en/markets/overview?search=${t}`;
  if(platform === "CoinMarketCap") return `https://coinmarketcap.com/search/?q=${t}`;
  return "#";
}

function chainFeeProfile(chain){
  const c = norm(chain);
  if(c === "ethereum") return { feeTier:"HIGH GAS", feeScore:25, note:"Ethereum DEX gas can destroy small capital." };
  if(["bsc","base","arbitrum","optimism","polygon","solana","sui","osmosis","seiv2","tron"].includes(c)) {
    return { feeTier:"LOW/MED FEE", feeScore:80, note:"Usually more practical for small capital than Ethereum mainnet." };
  }
  return { feeTier:"UNKNOWN FEE", feeScore:50, note:"Check network fee before action." };
}

function pnlFor(record, capital){
  const cap = n(capital);
  const entry = n(record.currentPrice || record.signalPrice);
  const tp1 = n(record.tp1);
  const tp2 = n(record.tp2);
  const inv = n(record.invalidation);
  const isSell = record.signalType === "SELL";

  if(!cap || !entry) return { tp1Profit:0, tp2Profit:0, invalidLoss:0, tp1Pct:0, tp2Pct:0, invalidPct:0 };

  const tp1Pct = isSell ? ((entry - tp1) / entry) * 100 : ((tp1 - entry) / entry) * 100;
  const tp2Pct = isSell ? ((entry - tp2) / entry) * 100 : ((tp2 - entry) / entry) * 100;
  const invalidPct = isSell ? ((entry - inv) / entry) * 100 : ((inv - entry) / entry) * 100;

  return {
    tp1Pct,
    tp2Pct,
    invalidPct,
    tp1Profit: cap * tp1Pct / 100,
    tp2Profit: cap * tp2Pct / 100,
    invalidLoss: cap * invalidPct / 100
  };
}


function beginnerLabelForRecord(record){
  const isSell = record.signalType === "SELL";
  const current = n(record.currentPrice || record.signalPrice);
  const tp1 = n(record.tp1);
  const tp2 = n(record.tp2);
  const invalid = n(record.invalidation);
  const toTP1 = isSell ? ((current - tp1) / current) * 100 : ((tp1 - current) / current) * 100;
  const toTP2 = isSell ? ((current - tp2) / current) * 100 : ((tp2 - current) / current) * 100;
  const toStop = Math.abs(((invalid - current) / current) * 100);
  let beginnerAction = "WAIT";
  let beginnerWhy = "Setup is still developing.";
  if(isSell){ beginnerAction = "AVOID THIS COIN"; beginnerWhy = "Sell pressure detected. Not a spot-buy signal."; }
  else if(record.hitInvalid){ beginnerAction = "CUT LOSS / EXIT"; beginnerWhy = "Invalidation hit."; }
  else if(record.hitTP2){ beginnerAction = "TAKE PROFIT NOW"; beginnerWhy = "TP2 already hit. Do not chase."; }
  else if(record.hitTP1){ beginnerAction = "TAKE PROFIT NOW"; beginnerWhy = "TP1 already hit. Do not chase."; }
  else if(record.hitTrigger){
    if(toTP1 <= 0) { beginnerAction = "TOO LATE, DON’T BUY"; beginnerWhy = "Already beyond Target 1."; }
    else if(toTP1 < 1.2) { beginnerAction = "WAIT PULLBACK"; beginnerWhy = "Too close to Target 1."; }
    else if(toTP2 >= 4 && toStop <= 5) { beginnerAction = "BUY NOW SMALL"; beginnerWhy = "Trigger confirmed with room to Target 2."; }
    else { beginnerAction = "BUY SMALL / CAUTION"; beginnerWhy = "Trigger confirmed but risk/reward is not perfect."; }
  } else if(record.hitZone){ beginnerAction = "WAIT, GOOD SETUP"; beginnerWhy = "In zone, but trigger not confirmed."; }
  else if(String(record.category||"").includes("GOLDEN") || String(record.category||"").includes("BUY")){ beginnerAction = "WAIT"; beginnerWhy = "Candidate found, but no zone/trigger confirmation."; }
  return { beginnerAction, beginnerWhy, toTP1, toTP2, toStop };
}


function aggressivePriorityForRecord(record, capital=10){
  const isSell = record.signalType === "SELL";
  const current = n(record.currentPrice || record.signalPrice);
  const tp1 = n(record.tp1);
  const tp2 = n(record.tp2);
  const invalid = n(record.invalidation);
  const sec = n(record.securityScore);
  const cat = String(record.category || "");
  const pair = String(record.pairLabel || "");
  const cexLike = /USDT|USDC|WETH|WBTC|WBNB|SOL|ETH/i.test(pair);
  const tp1Pct = current && tp1 ? ((tp1-current)/current)*100 : 0;
  const tp2Pct = current && tp2 ? ((tp2-current)/current)*100 : 0;
  const riskPct = current && invalid ? Math.abs(((invalid-current)/current)*100) : 99;

  if(isSell) return {agLabel:"SKIP / AVOID", agSize:0, agScore:0, agReason:"Sell watch. Do not buy spot.", agTP1:tp1Pct, agTP2:tp2Pct, agRisk:riskPct};
  if(record.hitInvalid || record.hitInvalidation) return {agLabel:"SKIP / INVALID", agSize:0, agScore:0, agReason:"Invalidation already hit.", agTP1:tp1Pct, agTP2:tp2Pct, agRisk:riskPct};
  if(record.hitTP2) return {agLabel:"TAKE PROFIT / TOO LATE", agSize:0, agScore:0, agReason:"TP2 already hit. Do not chase.", agTP1:tp1Pct, agTP2:tp2Pct, agRisk:riskPct};
  if(record.hitTP1) return {agLabel:"TOO LATE / PROFIT HIT", agSize:0, agScore:0, agReason:"TP1 already hit. Do not chase fresh entry.", agTP1:tp1Pct, agTP2:tp2Pct, agRisk:riskPct};

  let score = 0;
  score += sec >= 100 ? 25 : sec >= 90 ? 18 : sec >= 75 ? 8 : -20;
  score += cat.includes("GOLDEN") ? 25 : cat.includes("PRIME") ? 18 : cat.includes("BUY") ? 12 : 0;
  score += record.hitTrigger ? 25 : 0;
  score += record.hitZone ? 18 : 0;
  score += tp2Pct >= 10 ? 18 : tp2Pct >= 7 ? 14 : tp2Pct >= 4 ? 8 : 0;
  score += riskPct <= 3 ? 12 : riskPct <= 6 ? 8 : riskPct <= 10 ? 3 : -10;
  score += cexLike ? 8 : 0;

  let label="WATCH ONLY", size=0, reason="Opportunity exists but not strong enough for aggressive entry.";
  if(record.hitTrigger && sec >= 90 && tp2Pct >= 4){
    label="GRAB NOW"; size=Math.min(20, capital); reason="Trigger confirmed, security strong, remaining TP2 still attractive.";
  } else if((record.hitZone || cat.includes("GOLDEN")) && sec >= 90 && tp2Pct >= 7){
    label="ENTER SMALL"; size=Math.min(10, capital); reason="Early/aggressive opportunity: strong category and enough upside.";
  } else if(sec >= 90 && tp2Pct >= 8 && riskPct <= 10){
    label="SCOUT ENTRY"; size=Math.min(5, capital); reason="Candidate has upside, but no trigger/zone confirmation yet.";
  }
  return {agLabel:label, agSize:size, agScore:Math.round(score), agReason:reason, agTP1:tp1Pct, agTP2:tp2Pct, agRisk:riskPct};
}

function routeAdvisor(record, capital){
  const token = String(record.token || "").toUpperCase();
  const chain = norm(record.chain);
  const isSell = record.signalType === "SELL";
  const secStatus = String(record.securityStatus || record.security?.securityStatus || "UNKNOWN").toUpperCase();
  const category = String(record.category || "");
  const isWait = category === "WAIT";
  const isLegacySecurity = n(record.securityScore) <= 0 || !record.securityStatus;
  const cap = n(capital);
  const listedStyle = CEX_TOKEN_SET.has(token);
  const fee = chainFeeProfile(record.chain);
  const pnl = pnlFor(record, cap);

  let route = "Chart Only";
  let platform = "DexScreener";
  let actionLabel = "Open Chart";
  let routeUrl = record.url || "#";
  let viability = "WATCH ONLY";
  let reason = "No direct route selected yet.";

  if(isLegacySecurity){
    return { ...pnl, route:"Chart Only", platform:"DexScreener", actionLabel:"Open Chart", routeUrl:record.url || "#", viability:"WATCH ONLY", reason:"Legacy record missing security score. Run scanner/sync again before action.", feeTier:fee.feeTier };
  }

  if(isWait){
    return { ...pnl, route:"Chart Only", platform:"DexScreener", actionLabel:"Open Chart", routeUrl:record.url || "#", viability:"WATCH ONLY", reason:"Category is WAIT. Keep monitoring; not suitable for action button yet.", feeTier:fee.feeTier };
  }


  if(secStatus === "BLOCKED" || secStatus === "HIGH RISK"){
    route = "Avoid";
    platform = "DexScreener";
    actionLabel = "Open Chart Only";
    viability = "AVOID";
    reason = "Security status is not suitable for beginner action.";
  } else if(isSell){
    route = "Exit / Avoid Buy";
    platform = "DexScreener";
    actionLabel = "Open Chart";
    viability = "AVOID FRESH BUY";
    reason = "SELL WATCH detected. This is for protection/exit monitoring, not fresh buy.";
  } else if(listedStyle && (cap <= 50 || chain === "ethereum")) {
    route = "CEX Preferred";
    platform = "Binance";
    actionLabel = CEX_DIRECT_TRADE_SET.has(token) ? `Open Binance ${normalizeTicker(token)}/USDT` : "Open Binance Market";
    routeUrl = CEX_DIRECT_TRADE_SET.has(token) ? platformTradeUrl("Binance", token) : platformMarketUrl("Binance", token);
    viability = cap < 10 ? "PAPER TRADE ONLY" : "SMALL TEST OK";
    reason = "Major token style. For small capital, CEX spot is usually cleaner than DEX gas.";
  } else if(fee.feeScore >= 70) {
    route = "Low-Fee DEX";
    platform = "DexScreener";
    actionLabel = "Open DEX Chart";
    routeUrl = record.url || "#";
    viability = pnl.tp1Profit < 0.20 && cap <= 20 ? "PAPER TRADE ONLY" : "SMALL TEST OK";
    reason = fee.note;
  } else {
    route = "CEX Search + Chart";
    platform = listedStyle ? "Binance" : "DexScreener";
    actionLabel = listedStyle ? (CEX_DIRECT_TRADE_SET.has(token) ? `Open Binance ${normalizeTicker(token)}/USDT` : "Open Binance Market") : "Open Chart";
    routeUrl = listedStyle ? (CEX_DIRECT_TRADE_SET.has(token) ? platformTradeUrl("Binance", token) : platformMarketUrl("Binance", token)) : (record.url || "#");
    viability = "WATCH ONLY";
    reason = "Route fee/chain suitability is unclear; verify before action.";
  }

  if(category.includes("GOLDEN") && secStatus === "PASS" && pnl.tp2Profit > Math.max(0.5, cap * 0.03)) {
    viability = isSell ? viability : "BEST WATCH";
  }
  if(pnl.tp1Profit > 0 && pnl.tp1Profit < 0.10 && cap <= 10) {
    viability = "NOT WORTH FEES";
    reason = "Expected TP1 profit is too small for real execution cost.";
  }

  return { ...pnl, ...beginnerLabelForRecord(record), ...aggressivePriorityForRecord(record, capital), route, platform, actionLabel, routeUrl, viability, reason, feeTier:fee.feeTier };
}

function shareSetupText(record, capital){
  const adv = routeAdvisor(record, capital);
  return [
    "SNITCH X Trade Setup",
    "",
    `Pair: ${record.pairLabel}`,
    `Signal: ${record.signalType}`,
    `Category: ${record.category}`,
    `Security: ${record.securityStatus || record.security?.securityStatus || "UNKNOWN"} ${n(record.securityScore).toFixed(0)}`,
    `Capital: $${n(capital).toFixed(2)}`,
    `Current: $${price(record.currentPrice || record.signalPrice)}`,
    `TP1: $${price(record.tp1)} | Est: $${adv.tp1Profit.toFixed(2)} (${adv.tp1Pct.toFixed(2)}%)`,
    `TP2: $${price(record.tp2)} | Est: $${adv.tp2Profit.toFixed(2)} (${adv.tp2Pct.toFixed(2)}%)`,
    `Invalidation: $${price(record.invalidation)} | Risk: $${adv.invalidLoss.toFixed(2)} (${adv.invalidPct.toFixed(2)}%)`,
    `Best Route: ${adv.route} via ${adv.platform}`,
    `Viability: ${adv.viability}`,
    `Reason: ${adv.reason}`,
    "",
    "Not financial advice. Verify final price, fee, slippage and chain before action."
  ].join("\n");
}

function copyText(text){
  if(navigator.clipboard?.writeText){
    navigator.clipboard.writeText(text);
  } else {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    document.body.removeChild(t);
  }
}


function successLevel(record){
  if(record.hitTP2) return "TP2";
  if(record.hitTP1) return "TP1";
  return record.successLevel || "";
}

function movePctFromSignal(record){
  const entry = n(record.signalPrice);
  const hi = n(record.maxHigh || record.currentPrice);
  const lo = n(record.maxLow || record.currentPrice);
  const isSell = record.signalType === "SELL";
  if(!entry) return 0;
  return isSell ? ((entry - lo) / entry) * 100 : ((hi - entry) / entry) * 100;
}

function SuccessForecast({ records }){
  const [filter,setFilter]=useState("ALL");
  const [sort,setSort]=useState("completedAt");
  const [dir,setDir]=useState("desc");

  function sortClick(k){
    if(sort===k) setDir(dir==="asc"?"desc":"asc");
    else { setSort(k); setDir("desc"); }
  }

  const rows = useMemo(()=>{
    let a = (records||[]).filter(r => r.hitTP1 || r.hitTP2 || String(r.resultStatus||"").includes("SUCCESS"));
    if(filter==="TP1") a = a.filter(r=>r.hitTP1 && !r.hitTP2);
    if(filter==="TP2") a = a.filter(r=>r.hitTP2);
    if(filter==="GOLDEN") a = a.filter(r=>String(r.category||"").includes("GOLDEN"));
    if(filter==="BUY") a = a.filter(r=>r.signalType==="BUY");
    if(filter==="SELL") a = a.filter(r=>r.signalType==="SELL");

    return [...a].sort((x,y)=>{
      const av = sort==="movePct" ? movePctFromSignal(x) : (x[sort] ?? x.lastUpdated ?? "");
      const bv = sort==="movePct" ? movePctFromSignal(y) : (y[sort] ?? y.lastUpdated ?? "");
      const ax = typeof av === "string" ? av : n(av);
      const bx = typeof bv === "string" ? bv : n(bv);
      if(typeof ax === "string") return dir==="asc" ? ax.localeCompare(bx) : bx.localeCompare(ax);
      return dir==="asc" ? ax-bx : bx-ax;
    });
  },[records,filter,sort,dir]);

  const tp1 = rows.filter(r=>r.hitTP1).length;
  const tp2 = rows.filter(r=>r.hitTP2).length;
  const golden = rows.filter(r=>String(r.category||"").includes("GOLDEN")).length;
  const avgMove = rows.length ? rows.reduce((s,r)=>s+movePctFromSignal(r),0)/rows.length : 0;

  const TH=({k,children})=><th className="sortable" onClick={()=>sortClick(k)}>{children} {sort===k?(dir==="asc"?"↑":"↓"):""}</th>;

  return (
    <section className="success-forecast">
      <div className="lab-head">
        <div>
          <p className="eyebrow">Success Forecast · Proven Track Record</p>
          <h2>Completed forecasts database</h2>
          <p className="muted">Pairs that reached TP1 or TP2 are accumulated here as proof records. This separates completed missions from active opportunities.</p>
        </div>
      </div>

      <section className="stats lab-stats">
        <div><span>Success Rows</span><b>{rows.length}</b></div>
        <div><span>TP1 Hit</span><b>{tp1}</b></div>
        <div><span>TP2 Hit</span><b>{tp2}</b></div>
        <div><span>Golden Success</span><b>{golden}</b></div>
        <div><span>Avg Best Move</span><b>{avgMove.toFixed(2)}%</b></div>
      </section>

      <div className="lab-filters">
        <select value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="ALL">All Success</option>
          <option value="TP1">TP1 Only</option>
          <option value="TP2">TP2</option>
          <option value="GOLDEN">Golden</option>
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
        </select>
        <select value={dir} onChange={e=>setDir(e.target.value)}>
          <option value="desc">Highest / Latest first</option>
          <option value="asc">Lowest / Oldest first</option>
        </select>
      </div>

      <div className="table-wrap">
        <table className="tracker-table success-table">
          <thead>
            <tr>
              <TH k="completedAt">Completed</TH>
              <TH k="signalType">Signal</TH>
              <TH k="category">Category</TH>
              <TH k="securityScore">Security</TH>
              <th>Pair</th>
              <TH k="signalPrice">Signal Price</TH>
              <TH k="currentPrice">Current</TH>
              <TH k="movePct">Best Move</TH>
              <TH k="hitTP1">TP Level</TH>
              <th>TP1 / TP2</th>
              <th>Hits</th>
              <th>Alert</th>
            </tr>
          </thead>
          <tbody>
            {rows.length===0 ? (
              <tr><td colSpan="12" className="empty-cell">No completed forecasts yet. TP1/TP2 hits will appear here automatically.</td></tr>
            ) : rows.map(r=>(
              <tr key={`${r.id}-success`}>
                <td>{new Date(r.completedAt || r.lastUpdated || r.trackedAt).toLocaleString()}</td>
                <td><span className={`signal-pill ${r.signalType==="SELL"?"sell":"buy"}`}>{r.signalType}</span></td>
                <td><span className={`category-pill ${String(r.category).includes("GOLDEN")?"golden":String(r.category).includes("PRIME")?"prime":r.signalType==="SELL"?"sell":"buy"}`}>{r.category}</span></td>
                <td><span className={`security-pill ${String(r.securityStatus).includes("PASS")?"pass":String(r.securityStatus).includes("CAUTION")?"caution":"risk"}`}>{r.securityStatus||"LEGACY"} {n(r.securityScore).toFixed(0)}</span></td>
                <td><a href={r.url} target="_blank" rel="noreferrer">{r.pairLabel}</a><small>{r.chain} · {r.dex}</small></td>
                <td>${price(r.signalPrice)}</td>
                <td>${price(r.currentPrice)}</td>
                <td className="up">{movePctFromSignal(r).toFixed(2)}%</td>
                <td><span className={`success-pill ${successLevel(r)==="TP2"?"tp2":"tp1"}`}>{successLevel(r)}</span></td>
                <td>${price(r.tp1)} / ${price(r.tp2)}</td>
                <td><div className="hit-grid"><span className={`hit ${r.hitZone?"yes":""}`}>ZN</span><span className={`hit ${r.hitTrigger?"yes":""}`}>TR</span><span className={`hit ${r.hitTP1?"yes":""}`}>T1</span><span className={`hit ${r.hitTP2?"yes":""}`}>T2</span><span className={`hit ${r.hitInvalid?"yes":""}`}>INV</span></div></td>
                <td><small>{r.alertsSent ? Object.keys(r.alertsSent).filter(k=>r.alertsSent[k]).join(", ") : "—"}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}



function priorityWeight(label){
  label = String(label||"");
  if(label.includes("GRAB")) return 500;
  if(label.includes("ENTER")) return 400;
  if(label.includes("SCOUT")) return 300;
  if(label.includes("WATCH")) return 150;
  if(label.includes("PROFIT") || label.includes("TOO LATE")) return 50;
  if(label.includes("SKIP")) return -100;
  return 0;
}
function capitalFitScore(advisory, capital){
  const cap = n(capital);
  const size = n(advisory?.agSize);
  if(size <= 0) return 0;
  if(cap >= size) return 100;
  if(cap >= size*0.5) return 55;
  return -50;
}
function tradePriorityScore(record, advisory, capital){
  const a = advisory || {};
  let s = priorityWeight(a.agLabel);
  s += n(a.agScore);
  s += capitalFitScore(a, capital);
  s += Math.max(-50, Math.min(80, n(a.tp2Pct)*5));
  s -= Math.max(0, n(a.invalidPct)-5)*4;
  s += String(record.category||"").includes("GOLDEN") ? 25 : 0;
  s += String(record.category||"").includes("PRIME") ? 15 : 0;
  s += n(record.securityScore) >= 100 ? 20 : n(record.securityScore) >= 90 ? 10 : 0;
  if(record.hitTP1 || record.hitTP2 || record.hitInvalidation || record.hitInvalid) s -= 400;
  if(record.signalType === "SELL") s -= 250;
  return Math.round(s);
}
function investmentFromRecord(record, advisory, capital){
  const entry = n(record.currentPrice || record.signalPrice);
  const cap = Math.min(n(capital, 10), n(advisory?.agSize, n(capital, 10)) || n(capital, 10));
  const qty = entry > 0 ? cap / entry : 0;
  const now = new Date().toISOString();
  return {
    id: record.id,
    diaryId: `${record.id}-${Date.now()}`,
    pairLabel: record.pairLabel,
    token: record.token,
    chain: record.chain,
    dex: record.dex,
    url: record.url,
    signalType: record.signalType,
    category: record.category,
    securityStatus: record.securityStatus,
    securityScore: record.securityScore,
    actionLabel: advisory?.agLabel || "MANUAL",
    priorityScore: advisory?.priorityScore || 0,
    suggestedSize: advisory?.agSize || cap,
    investedCapital: cap,
    entryPrice: entry,
    quantity: qty,
    stopPrice: n(record.invalidation),
    tp1: n(record.tp1),
    tp2: n(record.tp2),
    createdAt: now,
    updatedAt: now,
    status: "ACTIVE",
    notes: "Manually executed in Binance. SNITCH X diary tracking only."
  };
}
function investmentSignal(inv, live){
  const px = n(live?.currentPrice, n(inv.entryPrice));
  const move = inv.entryPrice ? ((px - n(inv.entryPrice))/n(inv.entryPrice))*100 : 0;
  const pnl = n(inv.quantity) * (px - n(inv.entryPrice));
  let label = "HOLD / MONITOR";
  let cls = "watch";
  let reason = "Still active. Monitor route and stop.";
  if(live?.hitInvalidation || live?.hitInvalid || (n(inv.stopPrice)>0 && px <= n(inv.stopPrice))){
    label = "CUT LOSS / EXIT"; cls = "skip"; reason = "Invalidation or stop zone reached.";
  } else if(live?.hitTP2 || (n(inv.tp2)>0 && px >= n(inv.tp2))){
    label = "TAKE PROFIT TP2"; cls = "profit"; reason = "TP2 reached. Secure mission.";
  } else if(live?.hitTP1 || (n(inv.tp1)>0 && px >= n(inv.tp1))){
    label = "TAKE PROFIT TP1"; cls = "profit"; reason = "TP1 reached. Secure profit or sell partial.";
  } else if(move >= 3){
    label = "GREEN / TRAIL STOP"; cls = "enter"; reason = "In profit. Consider trailing stop.";
  } else if(move <= -3){
    label = "RED / WATCH STOP"; cls = "skip"; reason = "Drawdown active. Respect stop.";
  }
  return {label, cls, reason, currentPrice:px, movePct:move, pnl};
}

function TradeActionCenter({ records, investments, onMarkInvestment }){
  const [capital, setCapital] = useState(10);
  const [filter, setFilter] = useState("BEST");
  const [sort, setSort] = useState("priorityScore");
  const [dir, setDir] = useState("desc");
  const [copied, setCopied] = useState("");

  function sortClick(k){
    if(sort === k) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(k); setDir("desc"); }
  }

  const rows = useMemo(() => {
    const base = (records || []).map(r => {
      const advisory = routeAdvisor(r, capital);
      advisory.priorityScore = tradePriorityScore(r, advisory, capital);
      return { ...r, advisory };
    });
    let filtered = base;
    if(filter === "BEST") filtered = base.filter(r => r.advisory.priorityScore > 250 && n(r.advisory.agSize) > 0);
    if(filter === "GRAB") filtered = base.filter(r => String(r.advisory.agLabel).includes("GRAB"));
    if(filter === "ENTER") filtered = base.filter(r => String(r.advisory.agLabel).includes("ENTER") || String(r.advisory.agLabel).includes("SCOUT"));
    if(filter === "ACTIONABLE") filtered = base.filter(r => n(r.advisory.agSize) > 0 && !String(r.advisory.agLabel).includes("SKIP") && !String(r.advisory.agLabel).includes("TOO LATE"));
    if(filter === "ALL") filtered = base;
    if(filter === "BUY") filtered = base.filter(r => r.signalType === "BUY");
    if(filter === "GOLDEN") filtered = base.filter(r => String(r.category).includes("GOLDEN"));
    if(filter === "PASS") filtered = base.filter(r => String(r.securityStatus).includes("PASS"));

    return filtered.sort((a,b) => {
      const av = a.advisory?.[sort] ?? a[sort] ?? 0;
      const bv = b.advisory?.[sort] ?? b[sort] ?? 0;
      const ax = typeof av === "string" ? av : n(av);
      const bx = typeof bv === "string" ? bv : n(bv);
      if(typeof ax === "string") return dir === "asc" ? ax.localeCompare(bx) : bx.localeCompare(ax);
      return dir === "asc" ? ax - bx : bx - ax;
    });
  }, [records, capital, filter, sort, dir]);

  const top = rows[0];
  const totalSuggested = rows.reduce((s,r)=>s+n(r.advisory.agSize),0);
  const totalTP1 = rows.reduce((s,r)=>s+n(r.advisory.tp1Profit),0);
  const totalTP2 = rows.reduce((s,r)=>s+n(r.advisory.tp2Profit),0);
  const totalRisk = rows.reduce((s,r)=>s+n(r.advisory.invalidLoss),0);

  const TH = ({k, children}) => (
    <th className="sortable" onClick={() => sortClick(k)}>{children} {sort === k ? (dir === "asc" ? "↑" : "↓") : ""}</th>
  );

  return (
    <section className="trade-center">
      <div className="lab-head">
        <div>
          <p className="eyebrow">Trade Action Center · v10.6 Priority Ranking</p>
          <h2>Best trade first, based on your capital</h2>
          <p className="muted">
            Input modal once. SNITCH X ranks the best available setups first. Empty list means no strong trade window.
          </p>
        </div>
        <div className="capital-box">
          <span>Capital / modal sanggup invest</span>
          <div className="capital-input-row">
            <b>$</b>
            <input type="number" min="1" step="1" value={capital} onChange={e=>setCapital(e.target.value)} />
          </div>
        </div>
      </div>

      <section className="decision-card">
        {top ? (
          <>
            <div>
              <p className="eyebrow">TOP PRIORITY NOW</p>
              <h2>{top.pairLabel}</h2>
              <p>{top.advisory.agReason}</p>
            </div>
            <div className="decision-metrics">
              <span className={`aggressive-pill ${String(top.advisory.agLabel).includes("GRAB")?"grab":String(top.advisory.agLabel).includes("ENTER")?"enter":String(top.advisory.agLabel).includes("SCOUT")?"scout":"watch"}`}>{top.advisory.agLabel}</span>
              <b>Size: ${top.advisory.agSize}</b>
              <b>Rank: {top.advisory.priorityScore}</b>
              <a className="action-link" href={top.advisory.routeUrl} target="_blank" rel="noreferrer">Open Trade</a>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="eyebrow">NO STRONG TRADE WINDOW</p>
              <h2>No suggested list now</h2>
              <p>System did not find a high-priority setup for this capital/filter. Wait for next sync.</p>
            </div>
          </>
        )}
      </section>

      <section className="stats lab-stats">
        <div><span>Suggested Rows</span><b>{rows.length}</b></div>
        <div><span>Capital Input</span><b>${n(capital).toFixed(0)}</b></div>
        <div><span>Total Suggested</span><b>${totalSuggested.toFixed(0)}</b></div>
        <div><span>Total TP1</span><b>${totalTP1.toFixed(2)}</b></div>
        <div><span>Total TP2</span><b>${totalTP2.toFixed(2)}</b></div>
        <div><span>Total Risk</span><b>${totalRisk.toFixed(2)}</b></div>
        <div><span>Diary</span><b>{investments.length}</b></div>
      </section>

      <div className="lab-filters">
        <select value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="BEST">Suggested List Only</option>
          <option value="GRAB">GRAB NOW Only</option>
          <option value="ENTER">ENTER / SCOUT</option>
          <option value="ACTIONABLE">All Actionable</option>
          <option value="ALL">All Records</option>
          <option value="BUY">Buy Signals</option>
          <option value="GOLDEN">Golden Watch</option>
          <option value="PASS">Security PASS</option>
        </select>
        <select value={dir} onChange={e=>setDir(e.target.value)}>
          <option value="desc">Best first</option>
          <option value="asc">Lowest first</option>
        </select>
        <button className="secondary" onClick={() => {
          const all = rows.map(r => shareSetupText(r, capital)).join("\n\n----------------------\n\n");
          copyText(all);
          setCopied("Copied all visible trade plans");
          setTimeout(()=>setCopied(""),2000);
        }}>Copy Visible Plans</button>
        {copied && <span className="copy-toast">{copied}</span>}
      </div>

      <div className="table-wrap">
        <table className="tracker-table action-table">
          <thead>
            <tr>
              <TH k="priorityScore">Rank</TH>
              <th>Star</th>
              <th>Aggressive Action</th>
              <th>Pair</th>
              <TH k="tp2Profit">TP2 Profit</TH>
              <TH k="tp1Profit">TP1 Profit</TH>
              <TH k="invalidLoss">Invalid Risk</TH>
              <th>Route</th>
              <th>Action</th>
              <th>Share</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="11" className="empty-cell">No suggested trade list for this modal/filter.</td></tr>
            ) : rows.map((r) => {
              const a = r.advisory;
              const already = investments.some(x => x.id === r.id && x.status !== "CLOSED");
              return (
                <tr key={`${r.id}-action`}>
                  <td><b>{a.priorityScore}</b></td>
                  <td>
                    <button className={already ? "star-btn active" : "star-btn"} onClick={() => onMarkInvestment(r, a, capital)}>
                      {already ? "★" : "☆"}
                    </button>
                    <small>{already ? "In diary" : "Mark invested"}</small>
                  </td>
                  <td><span className={`aggressive-pill ${String(a.agLabel).includes("GRAB")?"grab":String(a.agLabel).includes("ENTER")?"enter":String(a.agLabel).includes("SCOUT")?"scout":String(a.agLabel).includes("PROFIT")||String(a.agLabel).includes("TOO LATE")?"profit":String(a.agLabel).includes("SKIP")?"skip":"watch"}`}>{a.agLabel}</span><small>Size {a.agSize ? "$"+a.agSize : "$0"} · Score {a.agScore}/100<br/>{a.agReason}</small></td>
                  <td>
                    <a href={r.url} target="_blank" rel="noreferrer">{r.pairLabel}</a>
                    <small>{r.signalType} · {r.category} · {r.securityStatus} {n(r.securityScore).toFixed(0)}</small>
                  </td>
                  <td className={a.tp2Profit >= 0 ? "up" : "down"}>${a.tp2Profit.toFixed(2)} <small>{a.tp2Pct.toFixed(2)}%</small></td>
                  <td className={a.tp1Profit >= 0 ? "up" : "down"}>${a.tp1Profit.toFixed(2)} <small>{a.tp1Pct.toFixed(2)}%</small></td>
                  <td className="down">${a.invalidLoss.toFixed(2)} <small>{a.invalidPct.toFixed(2)}%</small></td>
                  <td><b>{a.route}</b><small>{a.platform} · {a.feeTier}</small></td>
                  <td>
                    <a className="action-link" href={a.routeUrl} target="_blank" rel="noreferrer">{a.actionLabel}</a>
                    {a.platform === "Binance" && <a className="action-link ghost" href={platformTradeUrl("OKX", r.token)} target="_blank" rel="noreferrer">OKX</a>}
                    {a.platform === "Binance" && <a className="action-link ghost" href={platformTradeUrl("Bybit", r.token)} target="_blank" rel="noreferrer">Bybit</a>}
                    <a className="action-link ghost" href={r.url} target="_blank" rel="noreferrer">Chart</a>
                  </td>
                  <td>
                    <button className="mini-btn" onClick={() => {
                      copyText(shareSetupText(r, capital));
                      setCopied(`Copied ${r.pairLabel}`);
                      setTimeout(()=>setCopied(""),2000);
                    }}>Copy</button>
                  </td>
                  <td className="reason-cell">{a.reason}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function InvestmentDiary({ investments, records, onCloseInvestment, onRemoveInvestment }){
  const liveMap = useMemo(()=>new Map((records||[]).map(r=>[r.id,r])),[records]);
  const rows = useMemo(()=> investments.map(inv => {
    const live = liveMap.get(inv.id);
    const sig = investmentSignal(inv, live);
    return { ...inv, live, sig };
  }).sort((a,b)=>{
    const aw = a.status === "ACTIVE" ? 1 : 0;
    const bw = b.status === "ACTIVE" ? 1 : 0;
    if(aw !== bw) return bw-aw;
    return new Date(b.createdAt||0)-new Date(a.createdAt||0);
  }),[investments,liveMap]);

  const active = rows.filter(r=>r.status!=="CLOSED");
  const totalCapital = active.reduce((s,r)=>s+n(r.investedCapital),0);
  const totalPnl = active.reduce((s,r)=>s+n(r.sig.pnl),0);

  return <section className="investment-diary">
    <div className="lab-head">
      <div>
        <p className="eyebrow">Investment Diary · Personal Portfolio Tracker</p>
        <h2>Coins you already executed in Binance</h2>
        <p className="muted">Star from Trade Action Center after you manually buy in Binance. This tab tracks your own active investments and shows special signals.</p>
      </div>
    </div>
    <section className="stats lab-stats">
      <div><span>Active</span><b>{active.length}</b></div>
      <div><span>Total Capital</span><b>${totalCapital.toFixed(2)}</b></div>
      <div><span>Live PnL</span><b className={totalPnl>=0?"up":"down"}>${totalPnl.toFixed(2)}</b></div>
      <div><span>Total Diary</span><b>{rows.length}</b></div>
    </section>
    <div className="table-wrap">
      <table className="tracker-table investment-table">
        <thead>
          <tr>
            <th>Special Signal</th>
            <th>Pair</th>
            <th>Entry</th>
            <th>Current</th>
            <th>Capital</th>
            <th>PnL</th>
            <th>TP1 / TP2</th>
            <th>Stop</th>
            <th>Route</th>
            <th>Diary Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length===0 ? <tr><td colSpan="10" className="empty-cell">No investment diary yet. Mark ★ from Trade Action Center after you manually execute in Binance.</td></tr> : rows.map(inv => (
            <tr key={inv.diaryId}>
              <td><span className={`aggressive-pill ${inv.sig.cls}`}>{inv.sig.label}</span><small>{inv.sig.reason}</small></td>
              <td><a href={inv.url} target="_blank" rel="noreferrer">{inv.pairLabel}</a><small>{inv.actionLabel} · Rank {inv.priorityScore}</small></td>
              <td>${price(inv.entryPrice)}<small>{new Date(inv.createdAt).toLocaleString()}</small></td>
              <td>${price(inv.sig.currentPrice)}<small>{inv.sig.movePct.toFixed(2)}%</small></td>
              <td>${n(inv.investedCapital).toFixed(2)}<small>Qty est. {n(inv.quantity).toPrecision(5)}</small></td>
              <td className={inv.sig.pnl>=0?"up":"down"}>${inv.sig.pnl.toFixed(2)}</td>
              <td>${price(inv.tp1)} / ${price(inv.tp2)}</td>
              <td>${price(inv.stopPrice)}</td>
              <td><a className="action-link" href={platformTradeUrl("Binance", inv.token)} target="_blank" rel="noreferrer">Binance</a><a className="action-link ghost" href={inv.url} target="_blank" rel="noreferrer">Chart</a></td>
              <td>
                {inv.status==="CLOSED" ? <span className="status-pill fail">CLOSED</span> : <button className="mini-btn" onClick={()=>onCloseInvestment(inv.diaryId)}>Mark Closed</button>}
                <button className="mini-btn danger-mini" onClick={()=>onRemoveInvestment(inv.diaryId)}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
}

function Lab({records,remoteLoaded,onExport,onImport,onClear,onSync}){
  const [f,setF]=useState("ALL"),[cat,setCat]=useState("ALL"),[sec,setSec]=useState("ALL"),[sort,setSort]=useState("lastUpdated"),[dir,setDir]=useState("desc");
  function click(k){if(sort===k)setDir(dir==="asc"?"desc":"asc");else{setSort(k);setDir("desc")}}
  const filtered=useMemo(()=>{let a=f==="ALL"?records:records.filter(r=>r.signalType===f); a=cat==="ALL"?a:a.filter(r=>(r.category||"").toUpperCase()===cat); a=sec==="ALL"?a:a.filter(r=>(r.securityStatus||"").toUpperCase()===sec); return[...a].sort((x,y)=>{let av=x[sort],bv=y[sort];if(String(sort).toLowerCase().includes("updated")||String(sort).toLowerCase().includes("at")){av=new Date(av||0).getTime();bv=new Date(bv||0).getTime()}else{av=n(av,av);bv=n(bv,bv)}return dir==="asc"?(av>bv?1:av<bv?-1:0):(av<bv?1:av>bv?-1:0)})},[records,f,cat,sec,sort,dir]);
  const sum=useMemo(()=>{const t=records.length;return{t,b:records.filter(r=>r.signalType==="BUY").length,s:records.filter(r=>r.signalType==="SELL").length,p:records.filter(r=>r.category==="PRIME WATCH").length,g:records.filter(r=>r.category==="GOLDEN WATCH").length,np:records.filter(r=>r.category==="NEW PAIR").length,sec:t?records.reduce((a,r)=>a+n(r.securityScore),0)/t:0,z:records.filter(r=>r.hitZone).length,tr:records.filter(r=>r.hitTrigger).length,tp:records.filter(r=>r.hitTP1).length,iv:records.filter(r=>r.hitInvalidation).length,fg:t?records.reduce((a,r)=>a+n(r.forecastGoodPct),0)/t:0,ad:t?records.reduce((a,r)=>a+n(r.adverseMovePct),0)/t:0}},[records]);
  const TH=({k,children})=><th className="sortable" onClick={()=>click(k)}>{children} {sort===k?(dir==="asc"?"↑":"↓"):""}</th>;
  return <section className="performance-lab"><div className="lab-head"><div><p className="eyebrow">Performance Lab · Mixed Buy/Sell</p><h2>Forecast vs actual database</h2><p className="muted">One table. Category + soft security gate track opportunity while flagging scam-like public-data risks.</p></div><div className="lab-actions"><button className="secondary" onClick={onSync}>Sync Remote DB</button><button className="secondary" onClick={onExport}>Export JSON</button><label className="import-btn">Import JSON<input type="file" accept="application/json" onChange={onImport}/></label><button className="danger-btn" onClick={onClear}>Clear Local</button></div></div><div className="lab-note"><b>Remote loaded:</b> {remoteLoaded?"YES":"NO"} · Click table headers to sort highest/lowest.</div><section className="stats lab-stats"><div><span>Total</span><b>{sum.t}</b></div><div><span>Buy</span><b>{sum.b}</b></div><div><span>Sell</span><b>{sum.s}</b></div><div><span>Prime</span><b>{sum.p}</b></div><div><span>Golden</span><b>{sum.g}</b></div><div><span>New Pair</span><b>{sum.np}</b></div><div><span>Avg Security</span><b>{sum.sec.toFixed(0)}</b></div><div><span>Zone Hit</span><b>{sum.z}</b></div><div><span>Trigger</span><b>{sum.tr}</b></div><div><span>TP1</span><b>{sum.tp}</b></div><div><span>Invalid</span><b>{sum.iv}</b></div><div><span>Forecast Move</span><b>{sum.fg.toFixed(2)}%</b></div><div><span>Adverse</span><b>{sum.ad.toFixed(2)}%</b></div></section><div className="lab-filters"><select value={f} onChange={e=>setF(e.target.value)}><option value="ALL">All Signals</option><option value="BUY">Buy Signals</option><option value="SELL">Sell Signals</option></select><select value={cat} onChange={e=>setCat(e.target.value)}><option value="ALL">All Categories</option><option value="BUY WATCH">Buy Watch</option><option value="PRIME WATCH">Prime Watch</option><option value="SELL WATCH">Sell Watch</option><option value="GOLDEN WATCH">Golden Watch</option><option value="NEW PAIR">New Pair</option></select><select value={sec} onChange={e=>setSec(e.target.value)}><option value="ALL">All Security</option><option value="PASS">Pass</option><option value="CAUTION">Caution</option><option value="HIGH RISK">High Risk</option><option value="BLOCKED">Blocked</option></select><select value={dir} onChange={e=>setDir(e.target.value)}><option value="desc">Highest / Latest first</option><option value="asc">Lowest / Oldest first</option></select></div><div className="table-wrap"><table className="tracker-table"><thead><tr><TH k="trackedAt">Age</TH><TH k="signalType">Signal</TH><TH k="category">Category</TH><TH k="securityScore">Security</TH><th>Pair</th><TH k="status">Status</TH><TH k="signalPrice">Signal Price</TH><TH k="currentPrice">Current</TH><TH k="currentMovePct">Move</TH><TH k="forecastGoodPct">Forecast</TH><TH k="adverseMovePct">Adverse</TH><TH k="zoneLow">Zone</TH><TH k="trigger">Trigger</TH><TH k="tp1">TP1/TP2</TH><TH k="invalidation">Invalid</TH><th>Hits</th><TH k="lastUpdated">Updated</TH></tr></thead><tbody>{filtered.length===0?<tr><td colSpan="17" className="empty-cell">No records.</td></tr>:filtered.map(r=><tr key={r.id}><td>{age(r.trackedAt)}</td><td><span className={`signal-pill ${r.signalType==="SELL"?"sell":"buy"}`}>{r.signalType}</span></td><td><span className={`category-pill ${String(r.category).includes("GOLDEN")?"golden":String(r.category).includes("PRIME")?"prime":String(r.category).includes("NEW")?"newpair":r.signalType==="SELL"?"sell":"buy"}`}>{r.category||r.signal}</span></td><td><span className={`security-pill ${String(r.securityStatus).includes("PASS")?"pass":String(r.securityStatus).includes("CAUTION")?"caution":String(r.securityStatus).includes("BLOCKED")?"blocked":"risk"}`}>{r.securityStatus||"UNKNOWN"} {n(r.securityScore).toFixed(0)}</span></td><td><a href={r.url} target="_blank" rel="noreferrer">{r.pairLabel}</a><small>{r.chain} · {r.dex}</small></td><td><span className={`status-pill ${String(r.result).includes("WIN")?"win":String(r.result).includes("FAILED")?"fail":"active"}`}>{r.status}</span></td><td>${price(r.signalPrice)}</td><td>${price(r.currentPrice)}</td><td className={n(r.currentMovePct)>=0?"up":"down"}>{n(r.currentMovePct).toFixed(2)}%</td><td className="up">{n(r.forecastGoodPct).toFixed(2)}%</td><td className="down">{n(r.adverseMovePct).toFixed(2)}%</td><td>${price(r.zoneLow)}–${price(r.zoneHigh)}</td><td>${price(r.trigger)}</td><td>${price(r.tp1)} / ${price(r.tp2)}</td><td>${price(r.invalidation)}</td><td><div className="hit-grid"><span className={r.hitZone?"hit yes":"hit"}>ZN</span><span className={r.hitTrigger?"hit yes":"hit"}>TR</span><span className={r.hitTP1?"hit yes":"hit"}>T1</span><span className={r.hitTP2?"hit yes":"hit"}>T2</span><span className={r.hitInvalidation?"hit bad":"hit"}>INV</span></div></td><td>{new Date(r.lastUpdated||r.trackedAt).toLocaleString()}</td></tr>)}</tbody></table></div></section>
}

export default function App(){
  const [query,setQuery]=useState(""),[items,setItems]=useState([]),[selected,setSelected]=useState(null),[status,setStatus]=useState("Ready"),[loading,setLoading]=useState(false),[tab,setTab]=useState("scanner"),[records,setRecords]=useState([]),[investments,setInvestments]=useState([]),[remote,setRemote]=useState(false),[syncing,setSyncing]=useState(false),[lastSynced,setLastSynced]=useState(null),[syncError,setSyncError]=useState(""),[minLiquidity,setMinLiquidity]=useState(200000),[strictness,setStrictness]=useState("balanced"),[securityMode,setSecurityMode]=useState("balanced"),[showRejected,setShowRejected]=useState(false);
  const ref=useRef([]); const opts={minLiquidity,strictness,securityMode,hideRejected:!showRejected};
  useEffect(()=>{
    try{
      const raw=localStorage.getItem(STORE);
      const arr=raw?JSON.parse(raw):[];
      if(Array.isArray(arr)){
        ref.current=arr;
        setRecords(arr);
        const scanner=scannerItemsFromRecords(arr);
        setItems(scanner);
        setSelected(scanner[0]||null);
      }
    }catch{}
    try{
      const rawInv = localStorage.getItem(INVEST_STORE);
      const arrInv = rawInv ? JSON.parse(rawInv) : [];
      if(Array.isArray(arrInv)) setInvestments(arrInv);
    }catch{}
    syncRemote({updateScanner:true});
    const timer=setInterval(()=>syncRemote({updateScanner:true,silent:true}),60000);
    return ()=>clearInterval(timer);
  },[]);
  function persist(next){
    const s=[...next].sort((a,b)=>new Date(b.lastUpdated||0)-new Date(a.lastUpdated||0));
    ref.current=s;
    setRecords(s);
    localStorage.setItem(STORE,JSON.stringify(s));
    return s;
  }
  async function syncRemote({updateScanner=false,silent=false}={}){
    if(!silent) setSyncing(true);
    try{
      const r=await fetch(`${REMOTE}?t=${Date.now()}`,{cache:"no-store"});
      if(!r.ok)throw Error(`HTTP ${r.status}`);
      const d=await r.json();
      const arr=Array.isArray(d.records)?d.records:Array.isArray(d)?d:[];
      const merged=persist(merge(ref.current,arr));
      if(updateScanner){
        const scanner=scannerItemsFromRecords(merged);
        setItems(scanner);
        setSelected(prev => scanner.find(x=>x.id===prev?.id) || scanner[0] || null);
        setStatus(`Auto synced ${scanner.length} scanner rows · ${new Date().toLocaleTimeString()}`);
      }
      setRemote(true);
      setLastSynced(new Date().toISOString());
      setSyncError("");
    }catch(e){
      setRemote(false);
      setSyncError(e?.message || "sync failed");
      if(!silent) setStatus(`Auto sync failed: ${e?.message || "unknown error"}`);
    }finally{
      if(!silent) setSyncing(false);
    }
  }
  function saveInvestments(next){
    const s=[...next].sort((a,b)=>new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0));
    setInvestments(s);
    localStorage.setItem(INVEST_STORE,JSON.stringify(s));
    return s;
  }
  function markInvestment(record, advisory, capital){
    const item = investmentFromRecord(record, advisory, capital);
    saveInvestments([item, ...investments]);
    setStatus(`Marked ${record.pairLabel} in Investment Diary`);
    setTab("investment");
  }
  function closeInvestment(diaryId){
    saveInvestments(investments.map(x=>x.diaryId===diaryId?{...x,status:"CLOSED",closedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}:x));
  }
  function removeInvestment(diaryId){
    if(confirm("Remove this diary row?")) saveInvestments(investments.filter(x=>x.diaryId!==diaryId));
  }

  function track(list,source){const m=new Map(ref.current.map(r=>[r.id,r]));list.filter(x=>x.signalType==="BUY"||x.signalType==="SELL").forEach(x=>{const e=m.get(x.id);m.set(x.id,e?updateRec(e,x):recFrom(x,source))});list.forEach(x=>{const e=m.get(x.id);if(e)m.set(x.id,updateRec(e,x))});persist([...m.values()])}
  function process(pairs,q){const a=(pairs||[]).map(p=>{const x=analyze(p,q,opts); x.security=assessSecurity(x,opts.securityMode); x.category=getCategory(x); return x}).filter(x=>showRejected?true:(x.decision!=="FILTERED" && securityAllowsTracking(x,opts.securityMode)));const m=new Map();a.forEach(x=>{const key=`${String(x.token).toUpperCase()}-${x.signalType}`;const e=m.get(key);if(!e||rank(x)>rank(e))m.set(key,x)});return[...m.values()].sort((a,b)=>rank(b)-rank(a)).slice(0,50)}
  async function search(q=query){q=String(q||"").trim();if(!q)return;setLoading(true);setStatus(`Searching ${q}...`);try{const r=await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`);const d=await r.json();const ranked=process(d.pairs,q);setItems(ranked);setSelected(ranked[0]||null);track(ranked,"search");setStatus(`Loaded ${ranked.length} mixed signals for ${q}`);setLastSynced(new Date().toISOString())}catch(e){setStatus(`Failed: ${e.message}`)}finally{setLoading(false)}}
  async function radar(){setLoading(true);setStatus("Radar scanning mixed buy/sell...");try{let all=[];for(const t of RADAR){const r=await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(t)}`);if(!r.ok)continue;const d=await r.json();all.push(...process(d.pairs,t).slice(0,2))}const m=new Map();all.forEach(x=>{const key=`${String(x.token).toUpperCase()}-${x.signalType}`;const e=m.get(key);if(!e||rank(x)>rank(e))m.set(key,x)});const ranked=[...m.values()].sort((a,b)=>rank(b)-rank(a)).slice(0,50);setItems(ranked);setSelected(ranked[0]||null);track(ranked,"radar");setStatus(`Radar found ${ranked.length} mixed buy/sell signals`);setLastSynced(new Date().toISOString())}catch(e){setStatus(`Radar failed: ${e.message}`)}finally{setLoading(false)}}
  function exp(){const blob=new Blob([JSON.stringify({version:"v10.6-priority-investment-diary",exportedAt:new Date().toISOString(),records:ref.current},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="snitch-x-v10-6-priority-investment-diary.json";a.click();URL.revokeObjectURL(url)}
  function imp(e){const file=e.target.files?.[0];if(!file)return;const rd=new FileReader();rd.onload=()=>{try{const d=JSON.parse(String(rd.result||"[]"));persist(merge(ref.current,Array.isArray(d.records)?d.records:d))}catch{alert("Invalid JSON")}};rd.readAsText(file);e.target.value=""}
  function clr(){if(confirm("Clear local tracker?"))persist([])}
  const stats=useMemo(()=>({buy:items.filter(x=>x.signalType==="BUY").length,sell:items.filter(x=>x.signalType==="SELL").length,avg:items.length?Math.round(items.reduce((s,x)=>s+x.execution,0)/items.length):0}),[items]);
  return <main><header className="hero"><div><p className="eyebrow">SNITCH X · Priority + Investment Diary v10.6</p><h1>Best trade ranking + personal investment diary.</h1><p className="sub">V10.6 ranks best setups by your capital and tracks your executed investments.</p></div><div className="hero-card sync-card">
      <span>Status</span>
      <b>{loading?"Scanning...":status}</b>
      <small className={remote?"sync-ok":"sync-bad"}>Remote: {remote?"YES":"NO"} · Auto Sync: ON · {syncing?"Syncing...":lastSynced?`Last ${new Date(lastSynced).toLocaleTimeString()}`:"Waiting"}{syncError?` · ${syncError}`:""}</small>
      <button className="mini-btn sync-now" onClick={()=>syncRemote({updateScanner:true})} disabled={syncing}>{syncing?"Syncing":"Sync Now"}</button>
    </div></header><section className="tabbar"><button className={tab==="scanner"?"tab active":"tab"} onClick={()=>setTab("scanner")}>Scanner</button><button className={tab==="lab"?"tab active":"tab"} onClick={()=>setTab("lab")}>Performance Lab</button><button className={tab==="success"?"tab active":"tab"} onClick={()=>setTab("success")}>Success Forecast</button><button className={tab==="action"?"tab active":"tab"} onClick={()=>setTab("action")}>Trade Action Center</button><button className={tab==="investment"?"tab active":"tab"} onClick={()=>setTab("investment")}>Investment Diary</button></section>{tab==="scanner"?<><section className="auto-sync-banner"><b>Scanner Auto Update: ON</b><span>Pulls latest remote DB every 60s. All tabs use the same live records.</span></section><section className="toolbar"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} placeholder="Search token e.g. ETH, PEPE"/><select value={minLiquidity} onChange={e=>setMinLiquidity(Number(e.target.value))}><option value="0">No liquidity filter</option><option value="50000">Min liquidity $50K</option><option value="200000">Min liquidity $200K</option><option value="1000000">Min liquidity $1M</option></select><select value={strictness} onChange={e=>setStrictness(e.target.value)}><option value="hunter">hunter</option><option value="balanced">balanced</option><option value="strict">strict</option></select><select value={securityMode} onChange={e=>setSecurityMode(e.target.value)}><option value="loose">security loose</option><option value="balanced">security balanced</option><option value="strict">security strict</option></select><button onClick={()=>search()} disabled={loading}>Search</button><button className="secondary" onClick={radar} disabled={loading}>Run Radar</button></section><section className="toggle-row"><label><input type="checkbox" checked={showRejected} onChange={e=>setShowRejected(e.target.checked)}/>Show rejected / bad-data pairs</label></section><section className="stats"><div><span>Pairs</span><b>{items.length}</b></div><div><span>Buy Watch</span><b>{stats.buy}</b></div><div><span>Sell Watch</span><b>{stats.sell}</b></div><div><span>Tracked DB</span><b>{records.length}</b></div><div><span>Avg Execution</span><b>{stats.avg}</b></div></section><section className="layout"><div className="list">{items.length===0?<div className="empty"><h2>No signals loaded yet</h2><p>Run Radar to collect mixed BUY WATCH and SELL WATCH records.</p></div>:items.map(it=><Card key={it.id} item={it} selected={selected?.id===it.id} onSelect={setSelected}/>)}</div><Detail item={selected}/></section></>:tab==="lab"?<Lab records={records} remoteLoaded={remote} onExport={exp} onImport={imp} onClear={clr} onSync={syncRemote}/>:tab==="success"?<SuccessForecast records={records}/>:tab==="action"?<TradeActionCenter records={records} investments={investments} onMarkInvestment={markInvestment}/>:<InvestmentDiary investments={investments} records={records} onCloseInvestment={closeInvestment} onRemoveInvestment={removeInvestment}/>}</main>
}
