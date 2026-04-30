// SNITCH X v7.1 Full Background Worker
// Runs from GitHub Actions every 15 minutes.
// It scans radar tokens, classifies PRIME/BUY/SELL/GOLDEN/NEW, updates tracker-db.json,
// and preserves old records so Performance Lab keeps growing even when browser is closed.

import fs from "node:fs/promises";
import path from "node:path";

const RADAR = ["ETH","SOL","BTC","BNB","XRP","ARB","ONDO","TON","SUI","LINK","DOGE","PEPE","WIF","SEI","FET","RNDR","AVAX","OP","INJ","TIA"];
const OUT = path.join(process.cwd(), "public", "tracker-db.json");
const VERSION = "v10-telegram-success-forecast";
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

function alertMessage(record, hit){
  const titleMap = {
    ZN: "🚨 SNITCH X — BUY ZONE HIT",
    TR: "⚡ SNITCH X — TRIGGER HIT",
    T1: "✅ SNITCH X — TP1 HIT",
    T2: "🏆 SNITCH X — TP2 SUCCESS FORECAST",
    INV: "⛔ SNITCH X — INVALIDATION HIT"
  };
  const actionMap = {
    ZN: "Potential entry zone. Check chart first; do not overbuy.",
    TR: "Confirmation trigger hit. Check Trade Action Center route.",
    T1: "TP1 reached. Consider securing partial profit.",
    T2: "TP2 reached. Forecast mission completed.",
    INV: "Setup invalidated. Avoid fresh entry / review risk."
  };
  const hits = [];
  if(record.hitZone) hits.push("ZN");
  if(record.hitTrigger) hits.push("TR");
  if(record.hitTP1) hits.push("T1");
  if(record.hitTP2) hits.push("T2");
  if(record.hitInvalid) hits.push("INV");

  return [
    `<b>${titleMap[hit] || "SNITCH X ALERT"}</b>`,
    "",
    `Pair: <b>${esc(record.pairLabel)}</b>`,
    `Signal: <b>${esc(record.signalType)}</b>`,
    `Category: <b>${esc(record.category)}</b>`,
    `Security: <b>${esc(record.securityStatus || "UNKNOWN")} ${Number(record.securityScore||0).toFixed(0)}</b>`,
    `Current: <b>$${fmtPrice(record.currentPrice)}</b>`,
    `Signal Price: $${fmtPrice(record.signalPrice)}`,
    `Zone: $${fmtPrice(record.zoneLow)} – $${fmtPrice(record.zoneHigh)}`,
    `Trigger: $${fmtPrice(record.trigger)}`,
    `TP1 / TP2: $${fmtPrice(record.tp1)} / $${fmtPrice(record.tp2)}`,
    `Invalidation: $${fmtPrice(record.invalidation)}`,
    `Hits: ${hits.join(" ") || "-"}`,
    "",
    `<b>Action:</b> ${esc(actionMap[hit] || "Review setup.")}`,
    record.url ? `Chart: ${esc(record.url)}` : ""
  ].filter(Boolean).join("\n");
}

async function checkAndSendAlerts(record){
  record.alertsSent = record.alertsSent || {};
  const order = ["ZN","TR","T1","T2","INV"];
  const flags = {
    ZN: !!record.hitZone,
    TR: !!record.hitTrigger,
    T1: !!record.hitTP1,
    T2: !!record.hitTP2,
    INV: !!record.hitInvalid
  };
  let sentAny = false;
  for(const k of order){
    if(flags[k] && !record.alertsSent[k]){
      const ok = await sendTelegram(alertMessage(record,k));
      if(ok){
        record.alertsSent[k] = true;
        record.lastAlertAt = new Date().toISOString();
        sentAny = true;
      }
    }
  }
  return sentAny;
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
  const records = (db.records||[]).sort((a,b)=>new Date(b.lastUpdated||0)-new Date(a.lastUpdated||0));
  const successForecasts = (db.successForecasts||[]).sort((a,b)=>new Date(b.completedAt||0)-new Date(a.completedAt||0));
  await fs.writeFile(OUT,JSON.stringify({version:VERSION,updatedAt:new Date().toISOString(),meta,records,successForecasts},null,2));
}

async function main(){
  const db=await loadDb();
  const old=db.records||[];
  const map=new Map(old.map(r=>[r.id,r]));
  let discovered=0, updated=0;

  for(const token of RADAR){
    try{
      const pairs=await fetchPairs(token);
      const ranked=pairs.map(p=>analyze(p,token)).filter(Boolean).sort((a,b)=>rank(b)-rank(a)).slice(0,3);
      for(const item of ranked){
        const existing=map.get(item.id);
        if(existing){
          const nr = updateRec(existing,item);
          map.set(item.id,nr);
          updated++;
        } else {
          const nr = recFrom(item);
          map.set(item.id,nr);
          discovered++;
        }
      }
      await new Promise(r=>setTimeout(r,350));
    }catch(e){console.warn(`Scan failed ${token}: ${e.message}`)}
  }

  // Refresh every existing record if its token can still be found.
  for(const r of [...map.values()].slice(0,180)){
    try{
      const pairs=await fetchPairs(r.token);
      const found=pairs.map(p=>analyze(p,r.token)).filter(Boolean).find(x=>x.id===r.id);
      if(found){
        const nr = updateRec(r,found);
        map.set(r.id,nr);
        updated++;
      }
      await new Promise(x=>setTimeout(x,200));
    }catch{}
  }

  let alerts=0, successes=0;
  const finalRecords = [...map.values()];
  db.records = finalRecords;
  for(const rec of finalRecords){
    const before = JSON.stringify(rec.alertsSent || {});
    await checkAndSendAlerts(rec);
    if(JSON.stringify(rec.alertsSent || {}) !== before) alerts++;
    const wasSuccess = rec.resultStatus;
    markSuccess(rec, db);
    if(rec.resultStatus && rec.resultStatus !== wasSuccess) successes++;
  }

  await saveDb(db,{radarTokens:RADAR,discovered,updated,alerts,successes,totalRecords:map.size,totalSuccessForecasts:(db.successForecasts||[]).length});
  console.log(`SNITCH X DB updated. discovered=${discovered}, updated=${updated}, alerts=${alerts}, successes=${successes}, total=${map.size}`);
}
main().catch(e=>{console.error(e);process.exit(1)});
