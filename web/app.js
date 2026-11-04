// 12th Man — UI + personalisation + AI layer
const E = window.Engine;
const P = E.PLAYERS;
const SEED = 141, RIVALS = 3000, CONTEST_SEED = 7;
const MY_PIDS = ['m1', 'b2', 'm3', 'b1', 'b4', 'm4', 'm6', 'b3', 'm8', 'b8', 'b11'];

const S = {
  match: E.simulateMatch(SEED),
  scorer: new E.Scorer(),
  contest: new E.Contest(RIVALS, CONTEST_SEED),
  i: 0, c: 'm1', vc: 'b2', total: 0, rank: null, rankHist: [], items: [],
  playing: false, speed: 1, timer: null, away: null, ai: false, lang: 'en',
  inn: 1, batTeam: 'MUM', bowlTeam: 'BLR', target: null, crease: [], lastBall: null, done: false,
};
const $ = (id) => document.getElementById(id);
const mult = (id) => (id === S.c ? 2 : id === S.vc ? 1.5 : MY_PIDS.includes(id) ? 1 : 0);
const lev = (id) => mult(id) - S.contest.exposure[id];
const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString('en-IN');
const sign = (n) => (n > 0 ? '+' : '') + fmt(n);
const ovs = (legal) => `${Math.floor(legal / 6)}.${legal % 6}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- pre-match ----------------
function renderPick() {
  $('pickList').innerHTML = MY_PIDS.map((id) => {
    const p = P[id];
    return `<div class="pick"><div><b>${p.name}</b> <span class="chip ${p.team}">${p.team}</span> <span class="sub">${p.role} · owned ${S.contest.ownPct[id].toFixed(0)}% · C by ${S.contest.capPct[id].toFixed(0)}%</span></div>
      <button class="${S.c === id ? 'sel' : ''}" onclick="setCV('c','${id}')">C</button>
      <button class="${S.vc === id ? 'sel' : ''}" onclick="setCV('vc','${id}')">VC</button><span></span></div>`;
  }).join('');
  const cp = S.contest.capPct[S.c];
  $('pickHint').textContent = cp < 10 ? `${P[S.c].short} as captain is a differential pick (only ${cp.toFixed(0)}% of rivals). High risk, high reward.`
    : `${cp.toFixed(0)}% of rivals also captain ${P[S.c].short}. A safe pick, but you won't gain much rank from him.`;
}
window.setCV = (k, id) => {
  if (k === 'c') { if (S.vc === id) S.vc = S.c; S.c = id; } else { if (S.c === id) S.c = S.vc; S.vc = id; }
  renderPick();
};
$('startBtn').onclick = () => { $('prematch').style.display = 'none'; step(); render(); play(true); };
$('rulesList').innerHTML = E.RULES.map(([k, v]) => `<div class="lev"><span>${k}</span><b>${typeof v === 'number' && v > 0 ? '+' + v : v}</b></div>`).join('');
$('rulesBtn').onclick = () => ($('rules').style.display = 'flex');

// ---------------- simulation loop ----------------
function step() {
  if (S.i >= S.match.events.length) { S.done = true; play(false); return null; }
  const ev = S.match.events[S.i++];
  const before = S.rank ? S.rank.rank : null;
  const d = S.scorer.apply(ev);
  let mine = 0, field = 0;
  for (const x of d) { mine += x.pts * mult(x.pid); field += x.pts * S.contest.exposure[x.pid]; }
  S.total += mine;
  S.rank = S.contest.rank(S.total, S.scorer);
  S.rankHist.push(S.rank.rank);
  if (ev.type === 'break') { S.inn = 2; S.batTeam = 'BLR'; S.bowlTeam = 'MUM'; S.target = ev.target; S.crease = []; }
  if (ev.type === 'ball') { S.crease = [ev.striker, ev.nonStriker].filter((id) => !(ev.wicket && ev.wicket.out === id)); S.lastBall = ev; }
  if (ev.type === 'end') S.done = true;
  const item = { ev, d, mine, field, net: mine - field, before, after: S.rank.rank };
  item.kind = classify(item);
  S.items.push(item);
  return item;
}
function classify(it) {
  const { ev, d } = it;
  if (['start', 'break', 'end'].includes(ev.type)) return 'info';
  const touchesMe = d.some((x) => mult(x.pid) > 0);
  const milestone = d.some((x) => /bonus|Maiden|Duck/.test(x.why) && x.why !== 'Boundary bonus' && x.why !== 'Six bonus');
  if (Math.abs(it.net) >= 7 || (ev.wicket) || milestone || (touchesMe && ev.runs >= 4)) return it.net >= 0 ? 'good' : 'bad';
  return 'minor';
}
function play(on) {
  S.playing = on;
  $('playBtn').textContent = on ? '⏸ Pause' : '▶ Play';
  clearInterval(S.timer);
  if (on) S.timer = setInterval(tick, S.away ? 120 : 1400 / S.speed);
}
function tick() {
  const it = step();
  if (!it) return;
  if (!S.away) render(it); else renderAwayTicker();
}
$('playBtn').onclick = () => (S.done ? null : play(!S.playing));
document.querySelectorAll('[data-speed]').forEach((b) => (b.onclick = () => { S.speed = +b.dataset.speed; markSpeed(); if (S.playing) play(true); }));
function markSpeed() { document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === S.speed)); }
$('overBtn').onclick = () => {
  let it; do { it = step(); } while (it && it.ev.type !== 'overEnd' && it.ev.type !== 'end');
  if (!S.away) render(it);
};

// ---------------- personal impact language ----------------
function impactLine(it) {
  const { ev, d } = it;
  if (!d.length) return '';
  const byP = {};
  for (const x of d) (byP[x.pid] = byP[x.pid] || { pts: 0, why: [] }), (byP[x.pid].pts += x.pts), byP[x.pid].why.push(x.why);
  if (ev.type === 'start') return `Everyone starts on +4. Your C ${P[S.c].short} and VC ${P[S.vc].short} start on ${4 * 2} and ${4 * 1.5}.`;
  const parts = [];
  for (const [pid, v] of Object.entries(byP)) {
    const m = mult(pid), pl = P[pid];
    const why = [...new Set(v.why.filter((w) => !/run/.test(w) || /Run out/.test(w)))].join(', ');
    if (m > 0) parts.push(`<b>${pl.short}</b> ${sign(v.pts)}${m !== 1 ? ` ×${m} = <b>${sign(v.pts * m)}</b>` : ''}${why ? ` (${why})` : ''}`);
    else if (Math.abs(v.pts) >= 6) parts.push(`<b>${pl.short}</b> ${sign(v.pts)} <span class="sub">not in your team · ${S.contest.ownPct[pid].toFixed(0)}% of rivals have him</span>`);
  }
  if (ev.wicket && mult(ev.wicket.out) > 0) {
    const o = ev.wicket.out, s = S.scorer.p[o];
    const tag = o === S.c ? 'your CAPTAIN' : o === S.vc ? 'your VC' : 'your player';
    parts.push(`💔 <b>${P[o].short}</b> (${tag}) out for ${s.runs}. No more batting points from him${P[o].bowl > 0 && s.overs < 4 ? ', but he can still bowl' : ''}`);
  }
  let rk = '';
  if (it.before && it.after !== it.before) {
    const diff = it.before - it.after;
    rk = ` <span class="delta ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff).toLocaleString('en-IN')} spots</span>`;
  }
  const you = `You ${sign(it.mine)} vs field avg ${sign(it.field)}`;
  return `${parts.join(' · ')}${parts.length ? '<br>' : ''}<span class="sub">${you}</span>${rk}`;
}

// ---------------- state helpers ----------------
function status(id) {
  const s = S.scorer.p[id], p = P[id];
  const bat = s.balls > 0 || s.out ? `${s.runs}${s.out ? '' : '*'} (${s.balls})` : null;
  const bowl = s.overs > 0 || s.wkts > 0 ? `${s.wkts}-${s.conceded} (${s.overs} ov)` : null;
  let state = '';
  if (S.crease.includes(id) && !S.done) state = 'batting now';
  else if (s.out) state = 'out';
  else if (S.lastBall && S.lastBall.bowler === id && !S.done) state = 'bowling';
  else if (!bat && !S.done && (p.team === S.batTeam || (S.inn === 1 && p.team === 'BLR'))) state = 'yet to bat';
  return { bat, bowl, state, text: [bat && `bat ${bat}`, bowl && `bowl ${bowl}`, s.catches && `${s.catches} ct`, state].filter(Boolean).join(' · ') };
}
function canStillScore(id) {
  if (S.done) return false;
  const s = S.scorer.p[id], p = P[id];
  const canBat = !s.out && (p.team === S.batTeam || (S.inn === 1 && p.team === 'BLR'));
  const canBowl = p.bowl > 0 && s.overs < 4 && (p.team === S.bowlTeam || (S.inn === 1 && p.team === 'MUM'));
  return canBat || canBowl;
}
function rootFor() {
  const all = E.ALL.filter((p) => canStillScore(p.id)).map((p) => ({ id: p.id, lev: lev(p.id), why: P[p.id].team === S.batTeam ? 'batting side' : 'bowling side' }));
  const cheer = all.filter((x) => x.lev > 0.15).sort((a, b) => b.lev - a.lev).slice(0, 4);
  const danger = all.filter((x) => x.lev < -0.15).sort((a, b) => a.lev - b.lev).slice(0, 4);
  return { cheer, danger };
}
function scoreLines() {
  const ev = [...S.match.events.slice(0, S.i)].reverse();
  const inn1 = ev.find((e) => e.inn === 1 && e.total !== undefined);
  const inn2 = ev.find((e) => e.inn === 2 && e.total !== undefined);
  const lastLegal = (inn) => { const b = ev.find((e) => e.inn === inn && e.legal !== undefined); return b ? b.legal : 0; };
  return { inn1, inn2, l1: lastLegal(1), l2: lastLegal(2) };
}

// ---------------- render ----------------
function render(it) {
  const { inn1, inn2, l1, l2 } = scoreLines();
  let sb = `<div class="score-row ${S.inn === 2 ? 'dim' : ''}"><span class="t"><span class="chip MUM">MUM</span> Mumbai Monsoons</span><span class="r">${inn1 ? `${inn1.total}/${inn1.wk}` : '–'} <span class="sub">(${ovs(l1)})</span></span></div>`;
  sb += `<div class="score-row ${S.inn === 1 ? 'dim' : ''}"><span class="t"><span class="chip BLR">BLR</span> Bengaluru Blazers</span><span class="r">${inn2 ? `${inn2.total}/${inn2.wk}` : S.inn === 2 ? '0/0' : 'yet to bat'} <span class="sub">${S.inn === 2 ? `(${ovs(l2)})` : ''}</span></span></div>`;
  if (S.done) sb += `<div class="sub" style="color:var(--accent)">${S.match.result}</div>`;
  else if (S.inn === 2) {
    const need = S.target - (inn2 ? inn2.total : 0), left = 120 - l2;
    sb += `<div class="sub">BLR need <b>${need}</b> off ${left} balls · RRR ${(left ? (need / left) * 6 : 0).toFixed(2)}</div>`;
  } else if (inn1) sb += `<div class="sub">CRR ${(l1 ? (inn1.total / l1) * 6 : 0).toFixed(2)}</div>`;
  $('scoreboard').innerHTML = sb;

  const changed = new Set(it ? it.d.map((x) => x.pid) : []);
  $('myxi').innerHTML = [...MY_PIDS].sort((a, b) => S.scorer.p[b].total * mult(b) - S.scorer.p[a].total * mult(a)).map((id) => {
    const p = P[id], s = S.scorer.p[id], m = mult(id), st = status(id);
    return `<div class="pl ${changed.has(id) ? 'flash' : ''}"><div class="n">${p.name} <span class="chip ${p.team}">${p.team}</span>${id === S.c ? '<span class="cv">C</span>' : id === S.vc ? '<span class="cv vc">VC</span>' : ''}</div>
      <div class="p">${fmt(s.total * m)}</div><div class="s">${st.text || p.role} · owned ${S.contest.ownPct[id].toFixed(0)}%</div></div>`;
  }).join('');
  $('myTotalSmall').textContent = `${fmt(S.total)} pts`;

  $('myPts').textContent = fmt(S.total);
  const gap = S.total - S.rank.avg;
  $('ptsVs').innerHTML = `<span class="delta ${gap >= 0 ? 'up' : 'down'}">${sign(gap)}</span> vs avg rival · leader ${fmt(S.rank.top)}`;
  $('myRank').textContent = '#' + S.rank.rank.toLocaleString('en-IN');
  const pct = (100 * S.rank.rank) / S.rank.of;
  const overAgo = S.rankHist.length > 7 ? S.rankHist[S.rankHist.length - 8] : S.rankHist[0];
  const dr = overAgo - S.rank.rank;
  $('rankDelta').innerHTML = `Top ${pct.toFixed(1)}% · <span class="delta ${dr >= 0 ? 'up' : 'down'}">${dr >= 0 ? '▲' : '▼'} ${Math.abs(dr)}</span> last over`;
  spark();

  const rf = rootFor();
  const row = (x) => `<div class="lev"><span>${P[x.id].short} <span class="chip ${P[x.id].team}">${P[x.id].team}</span>${mult(x.id) ? (x.id === S.c ? ' <span class="cv">C</span>' : x.id === S.vc ? ' <span class="cv vc">VC</span>' : '') : ''}</span><b class="delta ${x.lev > 0 ? 'up' : 'down'}">${x.lev > 0 ? '+' : ''}${x.lev.toFixed(1)}x</b></div>`;
  $('cheer').innerHTML = rf.cheer.map(row).join('') || '<div class="sub">—</div>';
  $('danger').innerHTML = rf.danger.map(row).join('') || '<div class="sub">—</div>';

  if (it) addFeed(it);
}
function addFeed(it) {
  const feed = $('feed');
  const el = document.createElement('div');
  el.className = `ev ${it.kind}`;
  const line = it.kind === 'minor' ? '' : impactLine(it);
  el.innerHTML = `<div class="c">${it.kind === 'minor' ? '' : '<b>'}${esc(it.ev.text)}${it.kind === 'minor' ? '' : '</b>'}${it.kind === 'minor' && Math.abs(it.mine) > 0 ? ` <span class="sub">· you ${sign(it.mine)}</span>` : ''}</div>${line ? `<div class="me">${line}</div>` : ''}`;
  if (it.kind === 'good' || it.kind === 'bad') {
    const b = document.createElement('button');
    b.className = 'why'; b.textContent = '✦ What does this mean for me?';
    b.onclick = async () => {
      b.disabled = true; b.textContent = 'thinking…';
      const r = await ask('explain', `Explain this moment for me: "${it.ev.text}". My points change: ${sign(it.mine)} (field avg ${sign(it.field)}), rank ${it.before} → ${it.after}.`, it);
      b.remove();
      const t = document.createElement('div'); t.className = 'ai-text'; t.textContent = r.text; el.appendChild(t);
    };
    el.appendChild(b);
  }
  feed.prepend(el);
  while (feed.children.length > 250) feed.lastChild.remove();
}
function spark() {
  const h = S.rankHist; if (h.length < 2) return;
  const n = S.match.events.length, of = S.rank.of;
  const step = Math.max(1, Math.floor(h.length / 150));
  const pts = [];
  for (let k = 0; k < h.length; k += step) pts.push(`${((k / n) * 300).toFixed(1)},${(4 + (h[k] / of) * 48).toFixed(1)}`);
  pts.push(`${(((h.length - 1) / n) * 300).toFixed(1)},${(4 + (h[h.length - 1] / of) * 48).toFixed(1)}`);
  const brk = S.match.events.findIndex((e) => e.type === 'break');
  $('spark').innerHTML = `<line x1="${(brk / n) * 300}" x2="${(brk / n) * 300}" y1="0" y2="56" stroke="#24304d" stroke-dasharray="3 3"/>
    <polyline fill="none" stroke="#fbbf24" stroke-width="2" points="${pts.join(' ')}" vector-effect="non-scaling-stroke"/>`;
}

// ---------------- step away / catch me up ----------------
$('awayBtn').onclick = () => {
  if (S.away) return comeBack();
  if (S.done) return;
  S.away = { from: S.i, rank: S.rank.rank, total: S.total, score: scoreLines() };
  $('awayBtn').textContent = "🙋 I'm back";
  $('awayBtn').classList.add('on');
  renderAwayTicker();
  play(true);
};
function renderAwayTicker() {
  const balls = S.items.slice(S.away.from).filter((x) => x.ev.type === 'ball').length;
  $('awayZone').innerHTML = `<div class="away-banner">You're away. 12th Man is watching for you…<br><span class="sub">${balls} balls missed so far · tap "I'm back" for a personal catch-up</span></div>`;
  if (S.done) comeBack();
}
async function comeBack() {
  const win = S.items.slice(S.away.from);
  const since = S.away; S.away = null;
  $('awayBtn').textContent = '🚶 Step away'; $('awayBtn').classList.remove('on');
  $('awayZone').innerHTML = '';
  win.filter((x) => x.kind !== 'minor').slice(-30).forEach((x) => addFeed(x));
  render();
  play(false);
  await catchUp(win, since);
}
$('catchBtn').onclick = () => {
  const from = Math.max(0, S.items.length - 14);
  const win = S.items.slice(from);
  const first = win[0];
  catchUp(win, { rank: first && first.before ? first.before : S.rank.rank, total: S.total - win.reduce((a, x) => a + x.mine, 0) });
};
function windowFacts(win, since) {
  const balls = win.filter((x) => x.ev.type === 'ball');
  const per = {};
  for (const it of win) for (const x of it.d) per[x.pid] = (per[x.pid] || 0) + x.pts;
  const movers = Object.entries(per).map(([id, pts]) => ({ name: P[id].name, team: P[id].team, pts, inMyTeam: mult(id) > 0, myMult: mult(id), netEffectOnMe: +(pts * lev(id)).toFixed(1) }))
    .sort((a, b) => Math.abs(b.netEffectOnMe) - Math.abs(a.netEffectOnMe)).slice(0, 6);
  const key = win.filter((x) => x.kind !== 'minor' && x.kind !== 'info' || ['break', 'end'].includes(x.ev.type)).map((x) => ({ text: x.ev.text, myPts: +x.mine.toFixed(1), rankAfter: x.after })).slice(-12);
  return {
    ballsMissed: balls.length, rankBefore: since.rank, rankNow: S.rank.rank,
    myPointsBefore: +since.total.toFixed(1), myPointsNow: +S.total.toFixed(1), keyMoments: key, biggestMoversForMe: movers,
  };
}
async function catchUp(win, since) {
  const facts = windowFacts(win, since);
  addMsg('u', facts.ballsMissed > 12 ? `I'm back. I missed ${facts.ballsMissed} balls. What happened?` : 'Catch me up on the last couple of overs.');
  const pending = addMsg('a', '…');
  const r = await ask('catchup', 'Catch me up', null, facts);
  setMsg(pending, r);
}

// ---------------- AI layer ----------------
function context(extra) {
  const { inn1, inn2, l1, l2 } = scoreLines();
  const rf = rootFor();
  return {
    match: {
      teams: 'Mumbai Monsoons (MUM) vs Bengaluru Blazers (BLR), T20',
      innings: S.inn, status: S.done ? S.match.result : 'live',
      MUM: inn1 ? `${inn1.total}/${inn1.wk} (${ovs(l1)} ov)` : 'yet to bat',
      BLR: inn2 ? `${inn2.total}/${inn2.wk} (${ovs(l2)} ov)` : S.inn === 2 ? '0/0' : 'yet to bat',
      target: S.target, ballsLeftInChase: S.inn === 2 ? 120 - l2 : null,
      last12Balls: S.items.filter((x) => x.ev.type === 'ball').slice(-12).map((x) => x.ev.text),
    },
    me: {
      points: +S.total.toFixed(1), rank: S.rank.rank, contestSize: S.rank.of, topPercent: +((100 * S.rank.rank) / S.rank.of).toFixed(1),
      avgRivalPoints: +S.rank.avg.toFixed(1), leaderPoints: +S.rank.top.toFixed(1),
      rankAtEachOverEnd: S.items.filter((x) => x.ev.type === 'overEnd').slice(-8).map((x) => x.after),
      captain: P[S.c].name, viceCaptain: P[S.vc].name,
      team: MY_PIDS.map((id) => ({ name: P[id].name, team: P[id].team, role: P[id].role, multiplier: mult(id), basePoints: S.scorer.p[id].total, myPoints: +(S.scorer.p[id].total * mult(id)).toFixed(1), status: status(id).text || 'not involved yet', ownedByPctOfRivals: +S.contest.ownPct[id].toFixed(0), leverage: +lev(id).toFixed(2), canStillScore: canStillScore(id) })),
    },
    rootFor: {
      explain: 'leverage = my multiplier on a player minus the average rival\'s. Positive: his points push me up. Negative: his points push me down.',
      cheer: rf.cheer.map((x) => ({ name: P[x.id].name, leverage: +x.lev.toFixed(2), inMyTeam: mult(x.id) > 0 })),
      danger: rf.danger.map((x) => ({ name: P[x.id].name, leverage: +x.lev.toFixed(2), ownedByPctOfRivals: +S.contest.ownPct[x.id].toFixed(0) })),
    },
    notMyPlayersScoringBig: E.ALL.filter((p) => !mult(p.id) && S.scorer.p[p.id].total >= 40).map((p) => ({ name: p.name, points: S.scorer.p[p.id].total, ownedByPctOfRivals: +S.contest.ownPct[p.id].toFixed(0) })),
    pointsSystem: Object.fromEntries(E.RULES),
    ...extra,
  };
}
async function ask(mode, question, item, facts) {
  const ctx = context(facts ? { catchUpWindow: facts } : {});
  if (S.ai) {
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, question, context: ctx, lang: S.lang }) });
      const j = await res.json();
      if (j.text) return { text: j.text, src: 'Claude' };
    } catch (e) { /* fall through to offline */ }
  }
  return { text: offline(mode, question, ctx, item, facts), src: 'offline rule-based mode' };
}

// Rule-based fallback so the prototype works without an API key.
function offline(mode, q, ctx, item, facts) {
  const me = ctx.me;
  const mine = me.team.filter((p) => p.canStillScore).sort((a, b) => b.leverage - a.leverage);
  const cheer = ctx.rootFor.cheer.map((x) => x.name.split(' ')[1]).join(', ') || 'nobody in particular';
  const danger = ctx.rootFor.danger.map((x) => `${x.name.split(' ')[1]} (${x.ownedByPctOfRivals}% own him)`).join(', ') || 'no one';
  if (mode === 'catchup') {
    const dr = facts.rankBefore - facts.rankNow;
    const mv = facts.biggestMoversForMe.slice(0, 3).map((m) => `${m.name.split(' ')[1]} ${sign(m.pts)} pts → ${m.netEffectOnMe >= 0 ? 'helped' : 'hurt'} you (${sign(m.netEffectOnMe)} vs field)`).join('\n• ');
    const prio = (t) => (/break|win|tied/i.test(t) ? 0 : /OUT/.test(t) ? 1 : /MAIDEN|SIX/.test(t) ? 2 : /FOUR/.test(t) ? 3 : 9);
    const km = facts.keyMoments.map((k, i) => ({ ...k, i, p: prio(k.text) })).filter((k) => k.p < 9)
      .sort((a, b) => a.p - b.p || b.i - a.i).slice(0, 5).sort((a, b) => a.i - b.i).map((k) => k.text).join('\n• ');
    const sit = ctx.match.innings === 2 ? `MUM made ${ctx.match.MUM.split(' ')[0]}; BLR are ${ctx.match.BLR}, chasing ${ctx.match.target}` : `MUM are ${ctx.match.MUM}`;
    return `While you were away (${facts.ballsMissed} balls): ${S.done ? S.match.result : sit}.\n` +
      `You went ${sign(facts.myPointsNow - facts.myPointsBefore)} pts and rank ${dr >= 0 ? 'climbed' : 'fell'} #${facts.rankBefore} → #${facts.rankNow}.\n\nKey moments:\n• ${km || 'quiet spell, mostly singles'}\n\nWhat moved you:\n• ${mv}\n\nNow cheer for: ${cheer}. Watch out for: ${danger}.`;
  }
  if (mode === 'explain' && item) {
    const agg = {};
    for (const x of item.d) (agg[x.pid] = agg[x.pid] || { pid: x.pid, pts: 0, why: [] }), (agg[x.pid].pts += x.pts), agg[x.pid].why.push(x.why);
    const big = Object.values(agg).reduce((a, x) => (Math.abs(x.pts * lev(x.pid)) > Math.abs(a.pts * lev(a.pid)) ? x : a));
    const pl = P[big.pid], L = lev(big.pid);
    return `${pl.name} got ${sign(big.pts)} (${big.why.join(' + ')}). ${mult(big.pid) ? `You have him at ${mult(big.pid)}x` : 'You don\'t have him'} and the average rival has ${S.contest.exposure[big.pid].toFixed(2)}x, so the net swing for you is ${sign(big.pts * L)}. ` +
      (L > 0 ? 'He is a differential for you, so moments like this are how you climb.' : 'Most rivals have more of him than you, so his points are pushing you down.') + ` Rank now #${item.after}.`;
  }
  const s = q.toLowerCase();
  if (/-\s?2|minus|negative|duck/.test(s)) {
    const ducks = MY_PIDS.filter((id) => S.scorer.p[id].log.some((l) => l.why === 'Duck'));
    return ducks.length ? `−2 is the duck penalty: ${ducks.map((id) => `${P[id].name} got out for 0${mult(id) > 1 ? ` (×${mult(id)} = ${-2 * mult(id)} for you)` : ''}`).join(', ')}. Ducks only apply to batters, keepers and all-rounders, not specialist bowlers.`
      : 'None of your players has a negative score right now. The only negative in this points system is −2 for a duck (out for 0, non-bowlers only).';
  }
  if (/drop|fall|down|why|lost|slip/.test(s)) {
    const recent = S.items.slice(-24); const per = {};
    for (const it of recent) for (const x of it.d) per[x.pid] = (per[x.pid] || 0) + x.pts * lev(x.pid);
    const worst = Object.entries(per).sort((a, b) => a[1] - b[1]).slice(0, 2).filter((x) => x[1] < 0);
    const best = Object.entries(per).sort((a, b) => b[1] - a[1])[0];
    return worst.length ? `In the last few overs your rank moved mostly because of ${worst.map(([id, v]) => `${P[id].name} (${sign(v)} vs field${mult(id) ? '' : `, ${S.contest.ownPct[id].toFixed(0)}% of rivals own him, you don't`})`).join(' and ')}. ` + (best && best[1] > 0 ? `${P[best[0]].short} helped a bit (${sign(best[1])}). ` : '') + `You're #${me.rank} (top ${me.topPercent}%).`
      : `Nothing has really hurt you lately. You're #${me.rank}, ${sign(me.points - me.avgRivalPoints)} pts vs the average rival.`;
  }
  if (/root|cheer|support|who|need/.test(s)) return `Cheer for ${cheer}: their points are worth more to you than to the field. Danger: ${danger}. If they score, the field gains on you.`;
  if (/captain|\bc\b|vc|vice/.test(s)) {
    const c = me.team.find((p) => p.multiplier === 2), v = me.team.find((p) => p.multiplier === 1.5);
    return `Captain ${c.name}: ${c.basePoints} pts ×2 = ${c.myPoints} (${c.status}). VC ${v.name}: ${v.basePoints} ×1.5 = ${v.myPoints} (${v.status}).`;
  }
  if (/win|chance|top|lead|can i/.test(s)) {
    const left = mine.filter((p) => p.leverage > 0.2).map((p) => p.name.split(' ')[1]);
    return `You're #${me.rank} of ${me.contestSize} (top ${me.topPercent}%), ${fmt(me.leaderPoints - me.points)} pts behind the leader. Players who can still lift you: ${left.join(', ') || 'none left, your total is mostly locked'}.`;
  }
  if (/point|rule|how many|score/.test(s)) return 'Run +1, four +4 bonus, six +6 bonus, 30/50/100 bonuses +4/+8/+16, wicket +25 (+8 if bowled/LBW), catch +8, stumping/run out +12, maiden +12, duck −2. C ×2, VC ×1.5. Open "Points system" for the full table.';
  return `You're on ${me.points} pts, #${me.rank} (top ${me.topPercent}%). Cheer for ${cheer}. Watch ${danger}. Try "why did my rank drop?" or "who should I root for?". With an API key added, Claude answers anything.`;
}

// ---------------- chat UI ----------------
function addMsg(who, text, src) {
  const m = document.createElement('div'); m.className = 'msg ' + who; m.textContent = text;
  if (src) { const s = document.createElement('span'); s.className = 'src'; s.textContent = src; m.appendChild(s); }
  $('chat').appendChild(m); $('chat').scrollTop = 1e9; return m;
}
function setMsg(m, r) { m.textContent = r.text; const s = document.createElement('span'); s.className = 'src'; s.textContent = '✦ ' + r.src; m.appendChild(s); $('chat').scrollTop = 1e9; }
const SUGG = ['Why did my rank drop?', 'Who should I root for now?', 'How is my captain doing?', 'Can I still win this?', 'Why did I get -2?'];
$('sugg').innerHTML = SUGG.map((q) => `<button>${q}</button>`).join('');
$('sugg').querySelectorAll('button').forEach((b) => (b.onclick = () => sendQ(b.textContent)));
$('askForm').onsubmit = (e) => { e.preventDefault(); const q = $('askInput').value.trim(); if (q) sendQ(q); $('askInput').value = ''; };
async function sendQ(q) { addMsg('u', q); const m = addMsg('a', '…'); setMsg(m, await ask('ask', q)); }
$('langBtn').onclick = () => { S.lang = S.lang === 'en' ? 'hinglish' : 'en'; $('langBtn').textContent = S.lang === 'en' ? 'EN' : 'Hinglish'; };

// ---------------- boot ----------------
fetch('/api/status').then((r) => r.json()).then((j) => { S.ai = !!j.ai; S.aiModel = j.model; }).catch(() => (S.ai = false)).finally(() => {
  $('aiBadge').textContent = S.ai ? `AI: Claude (${S.aiModel || 'on'})` : 'AI: offline mode';
  $('aiBadge').classList.toggle('live', S.ai);
  $('aiBadge').title = S.ai ? 'Answers are generated by Claude from live computed facts' : 'No API key found. Answers come from built-in rules. Add ANTHROPIC_API_KEY to .env to enable Claude.';
});
markSpeed();
renderPick();
// Demo helper: index.html?skip=150 auto-starts and fast-forwards 150 events (handy for presenting).
const skip = +new URLSearchParams(location.search).get('skip');
if (skip) {
  $('prematch').style.display = 'none';
  for (let k = 0; k < skip; k++) { const it = step(); if (it && it.kind !== 'minor') addFeed(it); }
  render();
}
addMsg('a', "Hi! I'm your 12th Man. I'll tell you what every ball means for your team and rank. Step away any time and I'll catch you up when you're back.", '✦ 12th Man');
