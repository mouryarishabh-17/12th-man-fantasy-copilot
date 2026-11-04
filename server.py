"""12th Man local server.

Serves the web app and proxies AI questions to Claude so the API key never touches the browser.
Run:  python server.py   then open http://localhost:8011
Without an API key the app still works in offline (rule-based) mode.
"""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
WEB = ROOT / "web"
PORT = int(os.environ.get("PORT", "8011"))
MODEL = os.environ.get("TWELFTH_MAN_MODEL", "claude-opus-5-5")


def load_dotenv():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


load_dotenv()

client = None
if os.environ.get("ANTHROPIC_API_KEY"):
    try:
        import anthropic

        client = anthropic.Anthropic()
    except ImportError:
        print("! 'anthropic' package not installed (pip install -r requirements.txt). Running in offline mode.")

SYSTEM = """You are "12th Man", a live companion for a fantasy-cricket player during a T20 match.
The user has a locked fantasy XI (Captain 2x, Vice-captain 1.5x) in a contest against ~3,000 rival teams.
You receive a JSON snapshot that the app computed: score, the user's players and points, rank history,
"leverage" per player (the user's multiplier minus the average rival's), and recent events.

Rules:
- Use ONLY facts in the snapshot. Never invent runs, points, players or events. If something is unknown, say so.
- Speak to the user's stake: always connect a match event to THEIR points and rank. Rank moves come from
  players they own more or less of than the field, not from raw points alone.
- Be a knowledgeable friend watching alongside them: warm, direct, a little fun, never hype or gambling-pushy.
  Teams are locked mid-match, so never suggest changing the team or spending money.
- Be short: at most ~90 words unless asked for detail. Plain text, no markdown headings. Bullets (•) are fine.
"""

MODE_HINT = {
    "ask": "Answer the user's question.",
    "explain": "Explain in 2-3 sentences why this single moment mattered (or didn't) for the user's points and rank.",
    "catchup": "The user stepped away and just came back. Use catchUpWindow. Give: one line on the match situation now, "
    "what changed for them (points, rank before→now), the 2-3 moments or players that moved them most and why, "
    "then who to cheer for next. Use 4-6 short bullets.",
}


def ask_claude(payload):
    mode = payload.get("mode", "ask")
    lang = payload.get("lang", "en")
    lang_hint = (
        "Reply in natural Hinglish (Hindi-English mix in Roman script), the way Indian cricket fans text each other."
        if lang == "hinglish"
        else "Reply in English."
    )
    user = (
        f"{MODE_HINT.get(mode, MODE_HINT['ask'])} {lang_hint}\n\n"
        f"<snapshot>\n{json.dumps(payload.get('context', {}), ensure_ascii=False)}\n</snapshot>\n\n"
        f"User: {payload.get('question', '')}"
    )
    resp = client.beta.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=SYSTEM,
        output_config={"effort": "low"},  # live chat: speed matters more than deep reasoning
        betas=["server-side-fallback-2026-07-01"],
        extra_body={"fallbacks": "default"},  # re-route to a fallback model if a request is declined
        messages=[{"role": "user", "content": user}],
    )
    if resp.stop_reason == "refusal":
        return "Sorry, I can't help with that one. Ask me about the match or your team."
    return "".join(b.text for b in resp.content if b.type == "text").strip()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(WEB), **kw)

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/status":
            return self._json(200, {"ai": client is not None, "model": MODEL if client else None})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/ask":
            return self._json(404, {"error": "not found"})
        if client is None:
            return self._json(200, {"text": None, "offline": True})
        try:
            n = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(n))
            return self._json(200, {"text": ask_claude(payload)})
        except Exception as e:  # surface the error, front-end falls back to offline answers
            print("AI error:", repr(e))
            return self._json(200, {"text": None, "error": str(e)})

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    print(f"12th Man running at http://localhost:{PORT}  (AI: {'Claude ' + MODEL if client else 'offline mode, no API key'})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
