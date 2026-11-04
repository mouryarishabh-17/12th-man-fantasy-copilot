// 12th Man — match simulator, fantasy scorer and contest model.
// Everything numeric is computed deterministically here; the AI layer only narrates these facts.
(function (root) {
  const TEAMS = {
    MUM: {
      id: 'MUM', name: 'Mumbai Monsoons', color: '#3b82f6',
      players: [
        ['m1', 'Arjun Mehta', 'WK', 0.82, 0, 78, 18],
        ['m2', 'Rohan Desai', 'BAT', 0.72, 0, 46, 6],
        ['m3', 'Kabir Shah', 'BAT', 0.78, 0, 62, 12],
        ['m4', 'Vikram Rao', 'AR', 0.64, 0.58, 55, 8],
        ['m5', 'Ishaan Kapoor', 'BAT', 0.6, 0, 22, 1],
        ['m6', 'Dev Patil', 'AR', 0.55, 0.6, 38, 3],
        ['m7', 'Aryan Joshi', 'AR', 0.45, 0.5, 15, 1],
        ['m8', 'Siddharth Nair', 'BOWL', 0.25, 0.82, 70, 5],
        ['m9', 'Harsh Yadav', 'BOWL', 0.2, 0.7, 40, 1],
        ['m10', 'Kunal Verma', 'BOWL', 0.15, 0.66, 28, 0.5],
        ['m11', 'Aditya Singh', 'BOWL', 0.1, 0.74, 33, 1],
      ],
    },
    BLR: {
      id: 'BLR', name: 'Bengaluru Blazers', color: '#f97316',
      players: [
        ['b1', 'Tanmay Gowda', 'WK', 0.74, 0, 58, 9],
        ['b2', 'Nikhil Reddy', 'BAT', 0.86, 0, 84, 24],
        ['b3', 'Pranav Iyer', 'BAT', 0.68, 0, 24, 2],
        ['b4', 'Rahul Shetty', 'AR', 0.62, 0.6, 60, 7],
        ['b5', 'Yash Kulkarni', 'BAT', 0.58, 0, 20, 1],
        ['b6', 'Manish Hegde', 'AR', 0.5, 0.55, 25, 1],
        ['b7', 'Varun Bhat', 'AR', 0.4, 0.5, 12, 0.5],
        ['b8', 'Akash Naik', 'BOWL', 0.22, 0.8, 65, 2],
        ['b9', 'Om Prakash', 'BOWL', 0.18, 0.7, 30, 0.5],
        ['b10', 'Sameer Khan', 'BOWL', 0.15, 0.76, 52, 2],
        ['b11', 'Zaid Ansari', 'BOWL', 0.1, 0.62, 16, 0.5],
      ],
    },
  };

  const PLAYERS = {};
  for (const t of Object.values(TEAMS)) {
    t.players = t.players.map(([id, name, role, bat, bowl, own, cap]) => {
      const p = { id, name, short: name.split(' ')[1], role, bat, bowl, own, cap, team: t.id };
      PLAYERS[id] = p;
      return p;
    });
  }
  const ALL = Object.values(PLAYERS);

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rng, items, w) {
    const ws = items.map(w);
    let r = rng() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }

  // ---------------- Match simulation ----------------
  function simInnings(inn, bat, bowl, target, rng, push) {
    const order = bat.players.map((p) => p.id);
    let s = 0, ns = 1, next = 2, runs = 0, wk = 0, legal = 0;
    const quota = {};
    bowl.players.filter((p) => p.bowl > 0).forEach((p) => (quota[p.id] = 4));
    let last = null;
    const keeper = bowl.players.find((p) => p.role === 'WK');
    outer: for (let over = 0; over < 20; over++) {
      let cands = bowl.players.filter((p) => quota[p.id] > 0 && p.id !== last);
      if (!cands.length) cands = bowl.players.filter((p) => quota[p.id] > 0);
      const bw = pick(rng, cands, (p) => p.bowl * p.bowl * quota[p.id]);
      quota[bw.id]--; last = bw.id;
      let ballNo = 0, overRuns = 0;
      const phase = over < 6 ? 'pp' : over >= 15 ? 'death' : 'mid';
      while (ballNo < 6) {
        const st = PLAYERS[order[s]];
        const base = { type: 'ball', inn, over, batTeam: bat.id, bowlTeam: bowl.id, bowler: bw.id, striker: st.id, nonStriker: order[ns], target };
        if (rng() < 0.03) {
          runs++; overRuns++;
          push({ ...base, ball: ballNo, runs: 0, wide: true, total: runs, wk, legal,
            text: `${over}.${ballNo + 1} ${bw.short} to ${st.short}: wide` });
          if (target && runs >= target) break outer;
          continue;
        }
        let aggr = phase === 'death' ? 0.3 : phase === 'pp' ? 0.1 : 0;
        if (target) {
          const left = 120 - legal, need = target - runs;
          aggr += Math.max(-0.3, Math.min(0.6, ((need / left) * 6 - 8.5) / 8));
        }
        const sk = st.bat, b = bw.bowl;
        const pW = 0.025 + (1 - sk) * 0.065 + b * 0.02 + aggr * 0.025;
        const p6 = Math.max(0.005, 0.02 + sk * 0.05 + aggr * 0.035);
        const p4 = 0.065 + sk * 0.065 + (phase === 'pp' ? 0.03 : 0) + aggr * 0.02;
        const p0 = Math.max(0.2, 0.38 - sk * 0.1 + b * 0.06 - aggr * 0.06);
        const p2 = 0.07, p3 = 0.01;
        const r = rng();
        legal++; ballNo++;
        const ev = { ...base, ball: ballNo, runs: 0 };
        const tag = `${over}.${ballNo} ${bw.short} to ${st.short}`;
        if (r < pW) {
          const t = rng();
          const type = t < 0.58 ? 'caught' : t < 0.73 ? 'bowled' : t < 0.85 ? 'lbw' : t < 0.94 ? 'runout' : 'stumped';
          let fielder = null;
          if (type === 'caught') {
            const f = rng();
            fielder = f < 0.18 ? keeper.id : f < 0.25 ? bw.id : pick(rng, bowl.players.filter((p) => p.id !== bw.id && p !== keeper), () => 1).id;
          } else if (type === 'runout') fielder = pick(rng, bowl.players, () => 1).id;
          else if (type === 'stumped') fielder = keeper.id;
          wk++;
          ev.wicket = { type, out: st.id, fielder };
          const how = type === 'caught' ? `c ${fielder === bw.id ? '& b' : PLAYERS[fielder].short + ' b'} ${bw.short}`
            : type === 'bowled' ? `b ${bw.short}` : type === 'lbw' ? `lbw b ${bw.short}`
            : type === 'runout' ? `run out (${PLAYERS[fielder].short})` : `st ${keeper.short} b ${bw.short}`;
          ev.text = `${tag}: OUT! ${st.name} ${how}`;
          ev.total = runs; ev.wk = wk; ev.legal = legal;
          push(ev);
          if (wk === 10) break outer;
          s = next++;
        } else {
          let rr;
          let x = r - pW;
          if ((x -= p6) < 0) rr = 6;
          else if ((x -= p4) < 0) rr = 4;
          else if ((x -= p0) < 0) rr = 0;
          else if ((x -= p2) < 0) rr = 2;
          else if ((x -= p3) < 0) rr = 3;
          else rr = 1;
          runs += rr; overRuns += rr;
          ev.runs = rr; ev.total = runs; ev.wk = wk; ev.legal = legal;
          ev.text = `${tag}: ${rr === 6 ? 'SIX!' : rr === 4 ? 'FOUR!' : rr === 0 ? 'dot ball' : rr + ' run' + (rr > 1 ? 's' : '')}`;
          push(ev);
          if (rr % 2 === 1) [s, ns] = [ns, s];
          if (target && runs >= target) break outer;
        }
      }
      push({ type: 'overEnd', inn, over, bowler: bw.id, overRuns, maiden: overRuns === 0, total: runs, wk, batTeam: bat.id,
        text: `End of over ${over + 1}: ${bat.id} ${runs}/${wk}${overRuns === 0 ? ` — MAIDEN by ${bw.name}` : ` (${overRuns} off the over)`}` });
      [s, ns] = [ns, s];
    }
    return { runs, wk, legal };
  }

  function simulateMatch(seed) {
    const rng = mulberry32(seed);
    const events = [];
    const push = (e) => { e.i = events.length; events.push(e); };
    push({ type: 'start', text: 'Toss: Bengaluru Blazers chose to bowl. Mumbai Monsoons bat first. Teams are locked!' });
    const a = simInnings(1, TEAMS.MUM, TEAMS.BLR, null, rng, push);
    const target = a.runs + 1;
    push({ type: 'break', target, text: `Innings break — MUM ${a.runs}/${a.wk}. BLR need ${target} to win.` });
    const b = simInnings(2, TEAMS.BLR, TEAMS.MUM, target, rng, push);
    const text = b.runs >= target
      ? `Bengaluru Blazers win by ${10 - b.wk} wickets (${120 - b.legal} balls left)`
      : b.runs === a.runs ? 'Match tied!' : `Mumbai Monsoons win by ${a.runs - b.runs} run${a.runs - b.runs === 1 ? "" : "s"}`;
    push({ type: 'end', text });
    return { events, inn1: a, inn2: b, result: text };
  }

  // ---------------- Fantasy scoring (simplified Dream11-style T20) ----------------
  const RULES = [
    ['Playing XI', 4], ['Each run', 1], ['Boundary bonus', 4], ['Six bonus', 6],
    ['30-run bonus', 4], ['Half-century bonus', 8], ['Century bonus', 16], ['Duck (non-bowlers)', -2],
    ['Wicket (excl. run out)', 25], ['Bowled / LBW bonus', 8], ['3 / 4 / 5 wicket bonus', '4 / 8 / 16'],
    ['Maiden over', 12], ['Catch', 8], ['3-catch bonus', 4], ['Stumping', 12], ['Run out', 12],
    ['Captain multiplier', '2x'], ['Vice-captain multiplier', '1.5x'],
  ];

  class Scorer {
    constructor() {
      this.p = {};
      ALL.forEach((pl) => (this.p[pl.id] = { total: 0, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, wkts: 0, overs: 0, conceded: 0, catches: 0, log: [] }));
    }
    add(pid, pts, why, d) { const s = this.p[pid]; s.total += pts; s.log.push({ pts, why }); d.push({ pid, pts, why }); }
    apply(ev) {
      const d = [];
      if (ev.type === 'start') ALL.forEach((pl) => this.add(pl.id, 4, 'Playing XI', d));
      if (ev.type === 'ball') {
        const st = this.p[ev.striker], bw = this.p[ev.bowler];
        bw.conceded += ev.wide ? 1 : ev.runs;
        if (ev.wide) return d;
        st.balls++;
        if (ev.runs > 0) {
          const before = st.runs; st.runs += ev.runs;
          this.add(ev.striker, ev.runs, `${ev.runs} run${ev.runs > 1 ? 's' : ''}`, d);
          if (ev.runs === 4) { st.fours++; this.add(ev.striker, 4, 'Boundary bonus', d); }
          if (ev.runs === 6) { st.sixes++; this.add(ev.striker, 6, 'Six bonus', d); }
          for (const [m, pts, why] of [[30, 4, '30-run bonus'], [50, 8, 'Half-century bonus'], [100, 16, 'Century bonus']])
            if (before < m && st.runs >= m) this.add(ev.striker, pts, why, d);
        }
        if (ev.wicket) {
          const w = ev.wicket; st.out = true;
          if (st.runs === 0 && PLAYERS[ev.striker].role !== 'BOWL') this.add(ev.striker, -2, 'Duck', d);
          if (w.type !== 'runout') {
            bw.wkts++; this.add(ev.bowler, 25, 'Wicket', d);
            if (w.type === 'bowled' || w.type === 'lbw') this.add(ev.bowler, 8, 'Bowled/LBW bonus', d);
            const wb = { 3: 4, 4: 8, 5: 16 }[bw.wkts];
            if (wb) this.add(ev.bowler, wb, `${bw.wkts}-wicket bonus`, d);
          }
          if (w.type === 'caught') {
            const f = this.p[w.fielder]; f.catches++;
            this.add(w.fielder, 8, 'Catch', d);
            if (f.catches === 3) this.add(w.fielder, 4, '3-catch bonus', d);
          }
          if (w.type === 'stumped') this.add(w.fielder, 12, 'Stumping', d);
          if (w.type === 'runout') this.add(w.fielder, 12, 'Run out', d);
        }
      }
      if (ev.type === 'overEnd') {
        this.p[ev.bowler].overs++;
        if (ev.maiden) this.add(ev.bowler, 12, 'Maiden over', d);
      }
      return d;
    }
  }

  // ---------------- Contest: simulated rival teams ----------------
  class Contest {
    constructor(n, seed) {
      const rng = mulberry32(seed);
      this.n = n;
      this.ids = ALL.map((p) => p.id);
      this.rivals = [];
      const exp = {}; const own = {}; const cap = {};
      this.ids.forEach((id) => { exp[id] = 0; own[id] = 0; cap[id] = 0; });
      for (let k = 0; k < n; k++) {
        const pool = [...ALL]; const team = [];
        while (team.length < 11) {
          const p = pick(rng, pool, (x) => x.own);
          team.push(p); pool.splice(pool.indexOf(p), 1);
        }
        const c = pick(rng, team, (x) => x.cap + 0.3);
        const vc = pick(rng, team.filter((x) => x !== c), (x) => x.cap * 0.7 + x.own * 0.05 + 0.3);
        const mult = team.map((p) => (p === c ? 2 : p === vc ? 1.5 : 1));
        this.rivals.push({ pids: team.map((p) => p.id), mult });
        team.forEach((p, i) => { exp[p.id] += mult[i]; own[p.id]++; });
        cap[c.id]++;
      }
      this.exposure = {}; this.ownPct = {}; this.capPct = {};
      this.ids.forEach((id) => { this.exposure[id] = exp[id] / n; this.ownPct[id] = (100 * own[id]) / n; this.capPct[id] = (100 * cap[id]) / n; });
    }
    rank(myTotal, scorer) {
      let above = 0; const totals = new Float64Array(this.n);
      for (let k = 0; k < this.n; k++) {
        const r = this.rivals[k]; let t = 0;
        for (let j = 0; j < 11; j++) t += scorer.p[r.pids[j]].total * r.mult[j];
        totals[k] = t; if (t > myTotal) above++;
      }
      let sum = 0, best = 0; for (const t of totals) { sum += t; if (t > best) best = t; }
      return { rank: above + 1, of: this.n + 1, avg: sum / this.n, top: best };
    }
  }

  const api = { TEAMS, PLAYERS, ALL, RULES, simulateMatch, Scorer, Contest, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
