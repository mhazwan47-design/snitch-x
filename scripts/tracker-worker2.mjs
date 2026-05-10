// SNITCH X v7.1 Full Background Worker
// Runs from GitHub Actions every 15 minutes.
// It scans radar tokens, classifies PRIME/BUY/SELL/GOLDEN/NEW, updates tracker-db.json,
// and preserves old records so Performance Lab keeps growing even when browser is closed.

import fs from "node:fs/promises";
import path from "node:path";

const RADAR = ["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","LINK","DOT","TRX","TON","NEAR","APT","ARB","OP","SUI","SEI","INJ","TIA","JUP","PYTH","WIF","BONK","PEPE","FLOKI","SHIB","FET","RNDR","RENDER","WLD","ONDO","ENA","ORDI","STX","FIL","ATOM","LTC","UNI","AAVE","1000SATS","1000CAT","ACT","PNUT","MEME","GALA","SAND","MANA","IMX","STRK","ZK","BLUR","LDO","RUNE","ETC","BCH","POL","MATIC","HBAR","ICP","VET","ALGO","KAS","TAO","JASMY","NOT","DOGS","TURBO","BOME","MEW","POPCAT","MOG","GOAT","PENGU","AI","AIXBT","VIRTUAL","GRASS","CETUS","DEEP","KAITO","BERA","WLD","ZRO","AEVO","EIGEN","ALT","ARKM","GMT","APE","CHZ","CRV","DYDX","GMX","COMP","MKR","PENDLE","JTO","JST","SUSHI","CAKE","LQTY","ENS","MASK","MINA","ROSE"];
const OUT = path.join(process.cwd(), "public", "tracker-db.json");
const VERSION = "v10.14.4-stable-ui-recovery";
const MAJOR_QUOTES = new Set(["USDC","USDT","WETH","ETH","WBTC","BTC","SOL","WSOL","BNB","WBNB","DAI","USD"]);
const STABLE_QUOTES = new Set(["USDC","USDT","DAI","USD"]);
const MAJOR_DEX = new Set(["uniswap","pancakeswap","raydium","orca","meteora","aerodrome","camelot","sushiswap","curve","balancer","traderjoe","quickswap","ekubo","cetus","velodrome","osmosis"]);


async function sendTelegram(text){
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if(!token || !chatId){
    console.log("Telegram secrets missing; skip alert");
    return false;
  }
  try{
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {"content-type":"application/json"},
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });
    if(!res.ok){
      console.log("Telegram send failed", res.status, await res.text());
      return false;
    }
    return true;
  }catch(e){
    console.log("Telegram error", e.message);
    return false;
  }
}

function esc(s){
  return String(s ?? "").replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
}

function fmtPrice(v){
  const x = Number(v || 0);
  if(!Number.isFinite(x)) return "0";
  if(Math.abs(x) >= 100) return x.toFixed(2);
  if(Math.abs(x) >= 1) return x.toFixed(4);
  if(Math.abs(x) >= 0.01) return x.toFixed(6);
  return x.toPrecision(6);
}



function aggressivePriority(record, capital=10){
  const isSell = record.signalType === "SELL";
  const current = Number(record.currentPrice || record.signalPrice || 0);
  const tp1 = Number(record.tp1 || 0);
  const tp2 = Number(record.tp2 || 0);
  const invalid = Number(record.invalidation || 0);
  const sec = Number(record.securityScore || 0);
  const cat = String(record.category || "");
  const cexLike = /USDT|USDC|WETH|WBTC|WBNB|SOL|ETH/i.test(String(record.pairLabel || ""));
  const tp1Pct = current && tp1 ? ((tp1-current)/current)*100 : 0;
  const tp2Pct = current && tp2 ? ((tp2-current)/current)*100 : 0;
  const riskPct = current && invalid ? Math.abs(((invalid-current)/current)*100) : 99;

  if(isSell) return {label:"SKIP / AVOID", size:0, score:0, reason:"Sell watch. Do not buy spot.", tp1Pct, tp2Pct, riskPct};
  if(record.hitInvalid || record.hitInvalidation) return {label:"SKIP / INVALID", size:0, score:0, reason:"Invalidation already hit.", tp1Pct, tp2Pct, riskPct};
  if(record.hitTP2) return {label:"TAKE PROFIT / TOO LATE", size:0, score:0, reason:"TP2 already hit. Do not chase.", tp1Pct, tp2Pct, riskPct};
  if(record.hitTP1) return {label:"TOO LATE / PROFIT HIT", size:0, score:0, reason:"TP1 already hit. Do not chase fresh entry.", tp1Pct, tp2Pct, riskPct};

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
    label="GRAB NOW"; size=20; reason="Trigger confirmed, security strong, remaining TP2 still attractive.";
  } else if((record.hitZone || cat.includes("GOLDEN")) && sec >= 90 && tp2Pct >= 7){
    label="ENTER SMALL"; size=10; reason="Early/aggressive opportunity: strong category and enough upside.";
  } else if(sec >= 90 && tp2Pct >= 8 && riskPct <= 10){
    label="SCOUT ENTRY"; size=5; reason="Candidate has upside, but no trigger/zone confirmation yet.";
  }
  return {label, size, score:Math.round(score), reason, tp1Pct, tp2Pct, riskPct};
}

function beginnerSignal(record, hit){
  const isSell = record.signalType === "SELL";
  const action = typeof directAction === "function" ? directAction(record, hit) : {label:"WATCH", toTP1:0, toTP2:0, toStop:0};
  let headline = "👀 WAIT, GOOD SETUP";
  let simpleAction = "Wait. Do not buy yet.";
  let why = "Setup is still developing.";
  if(isSell){
    headline = "🛑 AVOID THIS COIN";
    simpleAction = "Do not buy. Sell pressure detected.";
    why = "SNITCH X detected SELL WATCH. This is not a spot-buy signal.";
    if(hit === "T1" || hit === "T2"){
      headline = "✅ SELL TARGET HIT";
      simpleAction = "Do not chase. Bearish target already reached.";
      why = "The sell-side forecast already hit target.";
    }
    return {headline, simpleAction, why, action};
  }
  if(hit === "INV" || record.hitInvalid){
    return {headline:"⛔ CUT LOSS / EXIT", simpleAction:"Do not buy. Exit/review if already holding.", why:"Invalidation level was hit.", action};
  }
  if(hit === "T2" || record.hitTP2){
    return {headline:"🏆 TAKE PROFIT NOW", simpleAction:"TP2 hit. Secure profit. Do not buy new.", why:"Final target reached. Forecast mission completed.", action};
  }
  if(hit === "T1" || record.hitTP1){
    return {headline:"✅ TAKE PROFIT NOW", simpleAction:"TP1 hit. Secure partial/all profit. Do not chase.", why:"First target already reached. New buy is late.", action};
  }
  if(hit === "TR" || record.hitTrigger){
    if(action.toTP1 <= 0){
      return {headline:"⚠️ TOO LATE, DON’T BUY", simpleAction:"Do not buy now. Wait pullback or skip.", why:"Price is already beyond Target 1.", action};
    } else if(action.toTP1 < 1.2){
      return {headline:"⚠️ WAIT PULLBACK", simpleAction:"Do not market buy. Wait price retest lower.", why:"Price is too close to Target 1.", action};
    } else if(action.toTP2 >= 4 && action.toStop <= 5){
      return {headline:"✅ BUY NOW SMALL", simpleAction:"Buy small only. Set stop-loss immediately.", why:"Buy trigger confirmed and there is still room to Target 2.", action};
    }
    return {headline:"🟡 BUY SMALL / CAUTION", simpleAction:"Buy small only if price is not spiking.", why:"Trigger confirmed but risk/reward is not perfect.", action};
  }
  if(hit === "ZN" || record.hitZone){
    return {headline:"👀 WAIT, GOOD SETUP", simpleAction:"Watch only. Wait for BUY NOW SMALL / trigger.", why:"Price is in buy zone but confirmation trigger has not hit yet.", action};
  }
  return {headline, simpleAction, why, action};
}
function simpleCoinName(record){
  const p = String(record.pairLabel || "");
  return p.split("/")[0] || record.token || p;
}
function entryGuide(record){
  const current = Number(record.currentPrice || 0);
  if(!current || record.signalType !== "BUY") return "";
  const maxBuy = current * 1.003;
  return `Buy only below: $${fmtPrice(maxBuy)}`;
}

function alertMessage(record, hit){
  const ag = aggressivePriority(record, 10);
  const coin = simpleCoinName(record);
  let title = `🚀 SNITCH X — ${ag.label}`;
  if(String(ag.label).includes("SKIP")) title = `🛑 SNITCH X — ${ag.label}`;
  if(String(ag.label).includes("PROFIT") || String(ag.label).includes("TOO LATE")) title = `✅ SNITCH X — ${ag.label}`;

  const lines = [
    `<b>${title}</b>`,
    "",
    `Coin: <b>${esc(coin)}</b>`,
    `Pair: ${esc(record.pairLabel)}`,
    `Price now: <b>$${fmtPrice(record.currentPrice)}</b>`,
    `Suggested size: <b>$${ag.size}</b>`,
    `Priority score: <b>${ag.score}/100</b>`,
    "",
    `TP Limit: $${fmtPrice(record.tp1)} (${ag.tp1Pct.toFixed(2)}%)`,
    `TP2 reference: $${fmtPrice(record.tp2)} (${ag.tp2Pct.toFixed(2)}%)`,
    `SL Trigger / hard invalid: $${fmtPrice(record.invalidation)} (${ag.riskPct.toFixed(2)}%)`,
    "",
    `<b>WHAT TO DO:</b> ${ag.size>0 ? `Enter ${ag.label.toLowerCase()} with $${ag.size}. Set stop immediately.` : "Do not enter fresh trade."}`,
    `<b>WHY:</b> ${esc(ag.reason)}`,
    "",
    "Advanced:",
    `Signal: ${esc(record.signalType)} · Category: ${esc(record.category)} · Security: ${esc(record.securityStatus || "UNKNOWN")} ${Number(record.securityScore||0).toFixed(0)}`,
    `System hit: ${esc(hit)} · Hits: ${["ZN","TR","T1","T2","INV"].filter(k => ({ZN:record.hitZone,TR:record.hitTrigger,T1:record.hitTP1,T2:record.hitTP2,INV:record.hitInvalid || record.hitInvalidation}[k])).join(" ") || "-"}`,
  ];
  if(record.url) lines.push(`Chart: ${esc(record.url)}`);
  return lines.filter(Boolean).join("\n");
}
const ACTIVE_TRADE_MAX_AGE_HOURS = 48;
const MIN_REMAINING_TO_TP1_PCT = 0.30;
function hoursOld(iso){const t=new Date(iso||0).getTime();if(!Number.isFinite(t)||t<=0)return 9999;return Math.max(0,(Date.now()-t)/36e5)}
function isRecordSuccess(r){return !!(r?.hitTP1 || r?.hitTP2 || String(r?.resultStatus||"").includes("SUCCESS") || String(r?.result||"").includes("WIN"))}
function isRecordInvalidated(r){return !!(r?.hitInvalidation || r?.hitInvalid || String(r?.status||"").includes("INVALID") || String(r?.result||"").includes("FAILED"))}
function currentAlreadyPastTarget(r){
  const p=n(r?.currentPrice||r?.signalPrice),tp1=n(r?.tp1),tp2=n(r?.tp2),inv=n(r?.invalidation),isSell=r?.signalType==="SELL";
  if(!(p>0))return true;
  if(isSell){
    if(tp2>0&&p<=tp2)return true;
    if(tp1>0&&p<=tp1)return true;
    if(inv>0&&p>=inv)return true;
    if(tp1>0&&((p-tp1)/p)*100<MIN_REMAINING_TO_TP1_PCT)return true;
  }else{
    if(tp2>0&&p>=tp2)return true;
    if(tp1>0&&p>=tp1)return true;
    if(inv>0&&p<=inv)return true;
    if(tp1>0&&((tp1-p)/p)*100<MIN_REMAINING_TO_TP1_PCT)return true;
  }
  return false;
}
function isActiveTradeValid(r){
  if(!r || !(r.signalType==="BUY"||r.signalType==="SELL"))return false;
  if(isRecordSuccess(r)||isRecordInvalidated(r))return false;
  if(String(r.securityStatus||"").includes("BLOCKED"))return false;
  if(currentAlreadyPastTarget(r))return false;
  const old=hoursOld(r.lastUpdated||r.trackedAt||r.firstSeenAt);
  if(old>ACTIVE_TRADE_MAX_AGE_HOURS&&!r.hitTrigger&&!r.hitZone)return false;
  return true;
}

function remainingToTP1PctRecord(r){
  const p=n(r?.currentPrice||r?.signalPrice),tp1=n(r?.tp1),isSell=r?.signalType==="SELL";
  if(!(p>0)||!(tp1>0))return 0;
  return isSell?((p-tp1)/p)*100:((tp1-p)/p)*100;
}
function isFreshActionableNowRecord(r){
  if(!isActiveTradeValid(r))return false;
  if(remainingToTP1PctRecord(r)<MIN_REMAINING_TO_TP1_PCT)return false;
  const p=n(r.currentPrice||r.signalPrice),isSell=r.signalType==="SELL";
  if(!(p>0))return false;
  if(isSell){
    if(n(r.invalidation)>0&&p>=n(r.invalidation))return false;
    if(n(r.tp1)>0&&p<=n(r.tp1))return false;
  }else{
    if(n(r.invalidation)>0&&p<=n(r.invalidation))return false;
    if(n(r.tp1)>0&&p>=n(r.tp1))return false;
  }
  if(!(r.hitZone||r.hitTrigger)&&hoursOld(r.trackedAt||r.firstSeenAt||r.lastUpdated)>12)return false;
  return true;
}

function pruneActiveRecords(records){
  return (records||[]).filter(isFreshActionableNowRecord).sort((a,b)=>new Date(b.lastUpdated||0)-new Date(a.lastUpdated||0)).slice(0,160);
}
function pruneSuccessForecasts(list){
  const m=new Map();
  for(const x of (list||[])){
    const k=`${x.id}-${x.successLevel||""}`;
    const old=m.get(k);
    if(!old||new Date(x.completedAt||0)>new Date(old.completedAt||0))m.set(k,x);
  }
  return [...m.values()].sort((a,b)=>new Date(b.completedAt||0)-new Date(a.completedAt||0)).slice(0,250);
}

async function checkAndSendAlerts(record){
  record.alertsSent = record.alertsSent || {};
  const flags = {
    ZN: !!record.hitZone,
    TR: !!record.hitTrigger,
    T1: !!record.hitTP1,
    T2: !!record.hitTP2,
    INV: !!record.hitInvalid
  };

  const priority = ["INV","T2","T1","TR","ZN"];
  const hitToSend = priority.find(k => flags[k] && !record.alertsSent[k]);

  if(!hitToSend) return false;

  const ok = await sendTelegram(alertMessage(record, hitToSend));
  if(ok){
    record.alertsSent[hitToSend] = true;
    if(hitToSend === "T1" || hitToSend === "T2") record.alertsSent.TR = true;
    if(hitToSend === "T2") record.alertsSent.T1 = true;
    record.lastAlertAt = new Date().toISOString();
    return true;
  }
  return false;
}

function markSuccess(record, db){
  if(!(record.hitTP1 || record.hitTP2)) return;
  record.resultStatus = record.hitTP2 ? "SUCCESS_TP2" : "SUCCESS_TP1";
  record.successLevel = record.hitTP2 ? "TP2" : "TP1";
  record.completedAt = record.completedAt || new Date().toISOString();
  db.successForecasts = db.successForecasts || [];
  const exists = db.successForecasts.find(x => x.id === record.id && x.successLevel === record.successLevel);
  if(!exists){
    db.successForecasts.push({
      id: record.id,
      pairLabel: record.pairLabel,
      signalType: record.signalType,
      category: record.category,
      securityScore: record.securityScore,
      securityStatus: record.securityStatus,
      signalPrice: record.signalPrice,
      currentPrice: record.currentPrice,
      tp1: record.tp1,
      tp2: record.tp2,
      successLevel: record.successLevel,
      completedAt: record.completedAt,
      url: record.url,
      chain: record.chain,
      dex: record.dex
    });
  }
}


function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f}
function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,v))}
function norm(v){return String(v||"").trim().toLowerCase()}
function pmove(a,b){a=n(a);b=n(b);return a>0&&b>0?((b-a)/a)*100:0}
function qt(q){q=String(q||"").toUpperCase();if(STABLE_QUOTES.has(q))return 3;if(["WETH","ETH","WBTC","BTC","SOL","WSOL","BNB","WBNB"].includes(q))return 2;return MAJOR_QUOTES.has(q)?1:0}
function matchScore(p,q){q=norm(q);const bs=norm(p?.baseToken?.symbol),bn=norm(p?.baseToken?.name);if(q===bs)return 35;if(bn===q)return 25;if(bn.includes(q)||bs.includes(q))return 12;return -10}

function levelsFor(p,h24,signal){
  if(signal==="SELL"){
    const zone=p*(h24<=0?1.035:1.055), zoneLow=zone*.985, zoneHigh=zone*1.005, trigger=p*(h24<=0?.965:.94), invalidation=zone*1.035, tp1=p*.945, tp2=p*.89;
    return{zoneLow,zoneHigh,trigger,invalidation,tp1,tp2,rr:p&&invalidation?Math.abs(p-tp1)/Math.abs(invalidation-p):0}
  }
  const support=p*(h24>=0?.965:.94), zoneLow=support*.995, zoneHigh=support*1.015, trigger=p*(h24>=0?1.045:1.03)*1.006, invalidation=support*.965, tp1=p*1.055, tp2=p*1.11;
  return{zoneLow,zoneHigh,trigger,invalidation,tp1,tp2,rr:p&&invalidation?Math.abs(tp1-p)/Math.abs(p-invalidation):0}
}

function analyze(pair, query){
  const px=n(pair?.priceUsd), liq=n(pair?.liquidity?.usd), vol=n(pair?.volume?.h24), vol6=n(pair?.volume?.h6);
  const h1=n(pair?.priceChange?.h1), h6=n(pair?.priceChange?.h6), h24=n(pair?.priceChange?.h24);
  const buys=n(pair?.txns?.h24?.buys), sells=n(pair?.txns?.h24?.sells), tx=buys+sells;
  const buyFlow=tx?buys/tx*100:50, sellFlow=100-buyFlow;
  const quote=String(pair?.quoteToken?.symbol||"").toUpperCase(), dex=norm(pair?.dexId), qTier=qt(quote);
  const ms=matchScore(pair,query);
  const reject = !pair?.pairAddress || !px || liq<200000 || vol<10000 || tx<25 || (qTier<2 && vol<250000);

  let valid=42+ms+(liq>=1e6?16:liq>=2e5?10:0)+(vol>=1e6?13:vol>=1e5?7:-10)+(tx>=500?10:tx>=100?6:-8)+(qTier>=2?8:-10)+(MAJOR_DEX.has(dex)?5:0);
  let exec=42+(h1>-2&&h1<6?8:0)+(h6>0&&h6<15?12:0)+(h24>0&&h24<35?12:0)+(liq>=2e5?8:0)+(vol6>=1e5?8:0)+(buyFlow>=52&&buyFlow<=70?6:0)+(tx>=100?5:0)-((h1>12||h6>30||h24>80)?25:0);
  let opp=40+ms*.4+(vol>=1e6?14:0)+(liq>=250000?8:0)+(h24>2&&h24<35?12:0)+(h6>1&&h6<18?8:0)+(buyFlow>55?6:0)-(h24>80?18:0);
  let risk=42+(liq<100000?22:0)+(vol<100000?18:0)+(tx<25?14:0)+(h24>80||h24<-35?18:0)+(qTier<2?12:0)+(reject?20:0);
  valid=clamp(valid);exec=clamp(exec);opp=clamp(opp);risk=clamp(risk);

  const bull = !reject && qTier>=2 && vol>=250000 && tx>=150 && valid>=78 && exec>=76 && risk<=62 && buyFlow>=45;
  const prime = !reject && qTier>=2 && vol>=100000 && tx>=80 && valid>=72 && exec>=72 && risk<=64 && buyFlow>=40;
  const bearScore=(sellFlow>=58?22:sellFlow>=54?14:sellFlow>=50?6:0)+(h1<-1?10:0)+(h6<-2?10:0)+(h24<-3?10:0)+(vol>=250000?8:0)+(tx>=150?6:0)-(buyFlow>=56?12:0)-(h24>8?10:0);
  const bear = !reject && qTier>=2 && vol>=150000 && tx>=100 && valid>=65 && bearScore>=34;

  let signalType="NONE", decision="WAIT";
  if(bear && !bull){signalType="SELL"; decision="SELL WATCH"}
  else if(bull){signalType="BUY"; decision="BUY WATCH"}
  else if(prime){signalType="BUY"; decision="PRIME WATCH"}
  else return null;

  const item = {
    id:`${pair.chainId}-${pair.pairAddress}-${signalType==="SELL"?"SELL":"BUY"}`,
    pairKey:`${pair.chainId}-${pair.pairAddress}`,
    token:pair?.baseToken?.symbol||"UNKNOWN",
    pairLabel:`${pair?.baseToken?.symbol||"?"}/${pair?.quoteToken?.symbol||"?"}`,
    chain:pair?.chainId||"unknown",
    dex:pair?.dexId||"unknown",
    url:pair?.url||"#",
    priceUsd:px,
    liquidityUsd:liq,
    volume24h:vol,
    h1,h6,h24,
    tx24:tx,
    buyPressure:buyFlow,
    sellPressure:sellFlow,
    validity:valid,
    execution:exec,
    opportunity:opp,
    risk,
    bearScore,
    signalType,
    decision,
    raw:pair
  };
  item.security = assessSecurity(item,"balanced");
  item.category = getCategory(item);
  item.levels = levelsFor(px,h24,signalType);
  return item;
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
function getCategory(item){
  const created = n(item.raw?.pairCreatedAt);
  const ageDays = created ? (Date.now() - created) / 86400000 : 999;
  const volLiq = item.liquidityUsd > 0 ? item.volume24h / item.liquidityUsd : 0;
  const absMove = Math.abs(n(item.h24));
  const golden = item.signalType==="BUY" && item.liquidityUsd>=100000 && item.liquidityUsd<=10000000 && item.volume24h>=250000 && item.tx24>=150 && item.buyPressure>=50 && item.buyPressure<=70 && item.risk<=62 && absMove>=1 && absMove<=65 && volLiq>=0.15;
  const newPair = ageDays<=1 && item.liquidityUsd>=50000 && item.volume24h>=25000 && item.tx24>=30;
  if(golden)return "GOLDEN WATCH";
  if(newPair)return "NEW PAIR";
  if(item.signalType==="SELL")return "SELL WATCH";
  if(item.decision==="PRIME WATCH")return "PRIME WATCH";
  if(item.signalType==="BUY")return "BUY WATCH";
  return "WAIT";
}

function rank(x){return x.validity*.85+x.execution*1.05+x.opportunity*.55-x.risk*.6+n(x.bearScore)*(x.signalType==="SELL"?1.1:.1)+(x.signalType==="BUY"?34:x.signalType==="SELL"?30:0)+Math.log10(Math.max(1,x.volume24h))*3}

function recFrom(item,source="github-worker"){
  const t=new Date().toISOString(), l=item.levels||{};
  return {id:item.id,pairKey:item.pairKey,token:item.token,pairLabel:item.pairLabel,chain:item.chain,dex:item.dex,url:item.url,source,version:VERSION,
    signalType:item.signalType,category:item.category,security:item.security,securityScore:item.security?.securityScore||0,securityStatus:item.security?.securityStatus||"UNKNOWN",securityFlags:item.security?.securityFlags||[],signal:item.decision,trackedAt:t,firstSeenAt:t,lastUpdated:t,signalPrice:item.priceUsd,currentPrice:item.priceUsd,maxHigh:item.priceUsd,maxLow:item.priceUsd,
    zoneLow:l.zoneLow,zoneHigh:l.zoneHigh,trigger:l.trigger,invalidation:l.invalidation,tp1:l.tp1,tp2:l.tp2,rr:l.rr,
    opportunity:item.opportunity,execution:item.execution,validity:item.validity,risk:item.risk,bearScore:item.bearScore,liquidityUsd:item.liquidityUsd,volume24h:item.volume24h,tx24:item.tx24,buyPressure:item.buyPressure,sellPressure:item.sellPressure,
    hitZone:false,hitTrigger:false,hitTP1:false,hitTP2:false,hitInvalid:false,alertsSent:{},currentMovePct:0,forecastGoodPct:0,adverseMovePct:0,status:"ACTIVE",result:"TRACKING",updateCount:1}
}

function updateRec(r,item){
  const p=n(item.priceUsd,r.currentPrice), high=Math.max(n(r.maxHigh,p),p), low=r.maxLow?Math.min(n(r.maxLow,p),p):p, isSell=r.signalType==="SELL";
  const hitZone=!!(r.hitZone||(p>=n(r.zoneLow)&&p<=n(r.zoneHigh))||(low<=n(r.zoneHigh)&&high>=n(r.zoneLow)));
  const hitTrigger=!!(r.hitTrigger||(isSell?low<=n(r.trigger):high>=n(r.trigger)));
  const hitTP1=!!(r.hitTP1||(isSell?low<=n(r.tp1):high>=n(r.tp1)));
  const hitTP2=!!(r.hitTP2||(isSell?low<=n(r.tp2):high>=n(r.tp2)));
  const hitInvalid=!!(r.hitInvalid||(isSell?high>=n(r.invalidation):low<=n(r.invalidation)));
  const cur=pmove(r.signalPrice,p), up=pmove(r.signalPrice,high), dn=pmove(r.signalPrice,low);
  const forecastGoodPct=isSell?Math.abs(Math.min(0,dn)):Math.max(0,up), adverseMovePct=isSell?Math.max(0,up):Math.abs(Math.min(0,dn));
  let status="MID RANGE", result="NO TRIGGER";
  if(hitTP2){status=isSell?"HIT DOWN TP2":"HIT TP2";result="WIN TP2"}
  else if(hitTP1){status=isSell?"HIT DOWN TP1":"HIT TP1";result="WIN TP1"}
  else if(hitInvalid){status="INVALIDATED";result="FAILED"}
  else if(hitTrigger){status=isSell?"HIT BREAKDOWN":"HIT BREAKOUT";result=isSell?"BEAR TRIGGER":"BULL TRIGGER"}
  else if(hitZone){status=isSell?"HIT SELL ZONE":"HIT BUY ZONE";result=isSell?"REJECTION WATCH":"BOUNCE WATCH"}
  return {...r,category:item.category||r.category,security:item.security||r.security,securityScore:item.security?.securityScore||r.securityScore||0,securityStatus:item.security?.securityStatus||r.securityStatus||"UNKNOWN",securityFlags:item.security?.securityFlags||r.securityFlags||[],lastUpdated:new Date().toISOString(),currentPrice:p,maxHigh:high,maxLow:low,liquidityUsd:item.liquidityUsd,volume24h:item.volume24h,tx24:item.tx24,buyPressure:item.buyPressure,sellPressure:item.sellPressure,opportunity:item.opportunity,execution:item.execution,validity:item.validity,risk:item.risk,bearScore:item.bearScore,hitZone,hitTrigger,hitTP1,hitTP2,hitInvalid,currentMovePct:cur,forecastGoodPct,adverseMovePct,status,result,updateCount:n(r.updateCount)+1}
}

async function fetchPairs(token){
  const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(token)}`);
  if(!res.ok) throw new Error(`DexScreener ${res.status}`);
  const data = await res.json();
  return data.pairs || [];
}
async function loadDb(){
  try{
    const raw=await fs.readFile(OUT,"utf8");
    const db=JSON.parse(raw);
    return {
      ...db,
      records: Array.isArray(db.records)?db.records:[],
      successForecasts: Array.isArray(db.successForecasts)?db.successForecasts:[]
    };
  }catch{
    return {records:[], successForecasts:[]}
  }
}
async function saveDb(db,meta){
  await fs.mkdir(path.dirname(OUT),{recursive:true});
  let records = pruneActiveRecords(db.records||[]);
  if(records.length === 0){
    records = emergencyFallbackRecords(db.records||[]);
  }
  const successForecasts = pruneSuccessForecasts(db.successForecasts||[]);
  await fs.writeFile(OUT,JSON.stringify({version:VERSION,updatedAt:new Date().toISOString(),meta,records,successForecasts},null,2));
}


async function sendTelegramTestMode(){
  const now = new Date().toISOString();
  const msg = [
    "<b>✅ SNITCH X TELEGRAM TEST SUCCESSFUL</b>",
    "",
    `Time: ${now}`,
    "Source: GitHub Actions workflow_dispatch",
    "",
    "If you receive this, TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are working."
  ].join("\n");
  const ok = await sendTelegram(msg);
  if(!ok) throw new Error("Telegram test message failed. Check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID secrets.");
  console.log("Telegram test message sent successfully.");
}


function relaxedFreshCandidate(r){
  if(!r || !(r.signalType==="BUY"||r.signalType==="SELL")) return false;
  if(isRecordSuccess(r)||isRecordInvalidated(r)) return false;
  if(String(r.securityStatus||"").includes("BLOCKED")) return false;
  if(n(r.currentPrice||r.signalPrice)<=0) return false;
  if(n(r.liquidityUsd)<25000) return false;
  if(n(r.volume24h)<10000) return false;
  return true;
}
function emergencyFallbackRecords(records){
  return (records||[])
    .filter(relaxedFreshCandidate)
    .sort((a,b)=>{
      const av = n(a.securityScore)*1.2 + n(a.validity)*0.8 + n(a.execution)*0.9 + Math.log10(Math.max(1,n(a.volume24h)))*8 + Math.log10(Math.max(1,n(a.liquidityUsd)))*4;
      const bv = n(b.securityScore)*1.2 + n(b.validity)*0.8 + n(b.execution)*0.9 + Math.log10(Math.max(1,n(b.volume24h)))*8 + Math.log10(Math.max(1,n(b.liquidityUsd)))*4;
      return bv-av;
    })
    .slice(0,40)
    .map(r=>({...r,status:r.status||"FALLBACK WATCH",result:r.result||"RELAXED FRESH CANDIDATE",fallback:true,lastUpdated:new Date().toISOString()}));
}

async function main(){
  if(String(process.env.TEST_TELEGRAM || "false").toLowerCase() === "true"){
    await sendTelegramTestMode();
    return;
  }

  const db=await loadDb();

  // v10.13 rule:
  // Active records are rebuilt fresh every run. Old active records are NOT carried forward.
  // Only successForecasts are historical evidence.
  db.successForecasts = pruneSuccessForecasts(db.successForecasts || []);

  const oldById = new Map((db.records||[]).map(r=>[r.id,r]));
  const freshMap = new Map();
  const allCandidates = [];
  let discovered=0, updated=0, scannedPairs=0;

  for(const token of RADAR){
    try{
      const pairs=await fetchPairs(token);
      scannedPairs += pairs.length;
      const ranked=pairs
        .map(p=>analyze(p,token))
        .filter(Boolean)
        .sort((a,b)=>rank(b)-rank(a))
        .slice(0,5);

      for(const item of ranked){
        const old = oldById.get(item.id);
        const nr = old ? updateRec(old,item) : recFrom(item);
        // Force this run to be treated as fresh updated figure.
        nr.lastUpdated = new Date().toISOString();
        allCandidates.push(nr);
        if(isFreshActionableNowRecord(nr)){
          freshMap.set(nr.id,nr);
          old ? updated++ : discovered++;
        } else {
          // If it already succeeded, keep it only in successForecasts.
          markSuccess(nr, db);
        }
      }
      await new Promise(r=>setTimeout(r,350));
    }catch(e){console.warn(`Scan failed ${token}: ${e.message}`)}
  }

  db.records = [...freshMap.values()];
  if(db.records.length === 0){
    console.log("No strict fresh active records found. Applying emergency relaxed fallback candidates.");
    db.records = emergencyFallbackRecords(allCandidates);
  }

  let alerts=0, successes=0;
  for(const rec of db.records){
    const before = JSON.stringify(rec.alertsSent || {});
    await checkAndSendAlerts(rec);
    if(JSON.stringify(rec.alertsSent || {}) !== before) alerts++;
    const wasSuccess = rec.resultStatus;
    markSuccess(rec, db);
    if(rec.resultStatus && rec.resultStatus !== wasSuccess) successes++;
  }

  const activeAfterPrune = pruneActiveRecords(db.records||[]).length;
  const successAfterPrune = pruneSuccessForecasts(db.successForecasts||[]).length;
  await saveDb(db,{
    radarTokens:RADAR,
    discovered,
    updated,
    scannedPairs,
    alerts,
    successes,
    totalActiveValidRecords:activeAfterPrune,
    totalSuccessForecasts:successAfterPrune,
    cleanup:"fresh_active_records_rebuilt_each_run_success_history_only"
  });
  console.log(`SNITCH X DB updated. discovered=${discovered}, updated=${updated}, activeValid=${activeAfterPrune}, success=${successAfterPrune}, scannedPairs=${scannedPairs}`);
}
main().catch(e=>{console.error(e);process.exit(1)});
