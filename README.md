# 12th Man: your AI co-pilot for live fantasy matches

**Live demo:** https://mouryarishabh-17.github.io/12th-man-fantasy-copilot/

**Quick open:** double-click `web/index.html` (works in any browser, no install, offline AI mode).
For the Claude-powered answers, see "Run it" below.

> "My rank just dropped 400 spots and I don't know why."

## 1. The problem

### Who the fan is
A 19 to 30 year old cricket fan with a team in a free Dream11 contest (paid contests ended with India's 2025
Online Gaming Act; Dream11 is now an engagement-first sports platform, so time spent during the match is what matters). During the match they have the live
stream on their phone or TV and the Dream11 app open on their phone, switching between the two. They might be
at work, in a cab, or at dinner, so they miss overs.

### What actually happens during a live match
Once the toss happens, the team is locked. For the next 3.5 hours the fan can't do anything except watch, so
the whole experience is about understanding and feeling the match through their team. The app gives them
**numbers, not meaning**:

| What the fan sees | What the fan actually wants to know |
|---|---|
| Points: 356 → 341, Rank: 656 → 1,031 | Why did I drop? I didn't even lose points. |
| A wicket falls | Is this good or bad for me? |
| Their captain is batting | How much do I need from him? |
| They come back after 4 overs away | What did I miss, and what did it do to me? |
| They support CSK, but their fantasy captain plays for MI | Who do I cheer for right now? |

### The insight
In a contest, your rank doesn't depend on your points alone. It depends on your points compared with everyone
else's. A six from a player you own earns you points, but if 80% of the contest also owns him, you barely
move. A six from a player you don't own, whom 60% of rivals do own, drops your rank even though your own
score didn't change.

Fans feel this ("my rank dropped for no reason") but nobody explains it to them, ball by ball, in plain
language. That gap creates anxiety, confusion, and a lot of second-screen switching. It is also a missed
chance for engagement during the 3.5 hours when the team is locked.

**Problem statement:** during a live match, fantasy fans can't easily connect what happens on the field to
what it means for their own team and rank. They don't know who to cheer for, why their rank moved, or how to
catch up after stepping away.

## 2. The solution: 12th Man

An AI companion that translates every ball into "what this means for you".

| Feature | Fan job it solves |
|---|---|
| **Personal impact feed.** Every key ball is shown with *your* change in points (with C/VC multipliers), the average rival's change, and how many rank spots you moved. | "Is this good or bad for me?" |
| **Cheer / Danger board** ("leverage"). For each player still able to score, your stake in him minus the average rival's stake. +1.2x means each point he scores is worth 1.2 points more to you than to the field. | "Who should I root for right now?" (This can be a player from the other team, or one you don't even own.) |
| **Step away → Catch me up.** Tap "Step away", the match keeps running, then "I'm back" gives a personal recap: key moments, points and rank before → now, who moved you, and who to cheer for next. | "I missed 4 overs, what happened to me?" |
| **"What does this mean for me?"** button on every big moment. | Explains one moment in 2 or 3 sentences. |
| **Ask anything.** For example: "Why did my rank drop?", "How's my captain doing?", "Can I still win?", "Why did I get −2?" | The questions fans currently search for or ask in WhatsApp groups. |
| **Hinglish toggle** | Answers the way Indian fans actually text each other. |
| **Captain picker** that shows how many rivals captain each player | Teaches the safe-vs-differential idea before the match starts. |

### Design principle: the numbers are computed, the AI only narrates
Fans hate wrong points. So all points, ranks and leverage figures are computed deterministically in code
(`web/engine.js`). Claude only gets a JSON snapshot of those facts and is told to use nothing else. That makes
the LLM fast and safe to put in front of millions of users: it can't make up a score, it only explains.
If no API key is set, a rule-based fallback answers the common questions, so the product degrades gracefully
instead of breaking.

## 3. How it works

```
web/engine.js   match simulator (seeded, ball by ball), fantasy scorer, contest of 3,000 rival teams
web/app.js      live loop, personal impact lines, leverage, step-away / catch-up, chat, offline answers
web/index.html  UI
server.py       local server; keeps the API key on the PC; sends questions + snapshot to Claude
```

- **Match:** a realistic T20 between two fictional teams (MUM vs BLR), replayed ball by ball. The seed is
  chosen for drama: MUM win by 1 run, and the demo team's rank swings from #319 to #1,931 to #288 to
  #1,500 or so.
- **Contest:** 3,000 rival teams sampled from realistic ownership and captaincy percentages. Rank is
  recomputed after every ball.
- **Leverage:** `my multiplier (0 / 1 / 1.5 / 2) − average rival multiplier` for that player.
- **AI:** Claude (`claude-opus-5-5`, low effort for fast replies). It receives a ~4 KB JSON snapshot of the
  match and the user's stake, plus a system prompt: use only these facts, focus on the user's stake, keep it
  short, never push spending (teams are locked).

## 4. Run it

```bash
pip install -r requirements.txt        # once
python server.py                       # or double-click start.bat
# open http://localhost:8011
```

- **To enable Claude:** copy `.env.example` to `.env` and paste your `ANTHROPIC_API_KEY`. Without a key, the
  app runs in offline mode (rule-based answers) and everything else works the same.
- **Demo shortcut:** `http://localhost:8011/?skip=230` jumps straight into the chase.
- **Suggested demo flow:** pick a C/VC → play at 4x → click "What does this mean for me?" on a wicket → ask
  "Who should I root for now?" → press Step away, wait about 3 overs, press I'm back.

## 5. What I'd build next (with real Dream11 data)
1. **Real feeds:** the ball-by-ball feed and the actual contest's ownership instead of the simulation. The
   leverage maths stays exactly the same.
2. **Push "moments that matter":** a notification only when something swings your rank by more than X%, not
   on every wicket. That cuts notification noise and brings fans back to the app at the right moments.
3. **Multi-team view:** most serious players have several teams. Show which team to follow and the cheer list
   combined across all of them.
4. **What-if:** "If Reddy scores 30 more, where do I finish?" by simulating the rest of the match.
5. **Voice / regional languages:** Hindi, Tamil, Telugu and Bengali audio recaps for the catch-up.
6. **Metrics to judge it:** session time during live matches, app-switch rate, return rate after a push,
   and the share of users who use catch-up.

*Points system is simplified Dream11-style T20 scoring, used for this prototype. Teams and players are
fictional.*
