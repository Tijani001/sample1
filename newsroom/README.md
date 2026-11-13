# Style Desk

Grammarly-style writing help, trained on your own newsroom's house style. Style Desk learns your style from stories you've already published, then checks reporters' writing wherever they write: the web app, in any text box through the Chrome extension, and (planned) keyboards and native apps. See [docs/ROADMAP.md](docs/ROADMAP.md).

Every newsroom has its own account, style profile and house rules. An editor sets up the newsroom, and reporters join with an invite code.

## How it works

1. **Learns from your archive.** Editors upload published articles (one `.txt`/`.md` file per article, headline on the first line). The app measures what your newsroom actually does:
   - "per cent" or "percent" or "%"
   - "said" or "says"
   - "Mr" or "Mr."
   - "8am" or "8 a.m."
   - UK or US spelling
   - whether it uses the serial comma
   - whether small numbers are spelled out
   - whether headlines are in sentence case or title case
   - usual sentence, paragraph and lede lengths

   A preference only counts when at least 80% of the archive follows it. That way the checker never enforces a habit the newsroom doesn't really have.
2. **House rules.** Editors add explicit rules that override what was learned:
   - **prefer:** "utilise" becomes "use"
   - **ban:** "unveiled" gets flagged
   - **note:** free-text guidance for the AI reviewer
3. **AI style guide (optional).** With an Anthropic API key, Claude reads the archive and writes down the newsroom's conventions as a style guide. That covers things a counter can't measure: voice, how ledes are built, attribution, titles on first and later reference.
4. **Checking stories.** Reporters paste a story and get every issue highlighted in the text, with one-click fixes. With AI on, Claude also reviews the story against the learned guide and gives a verdict: ready, minor edits or needs work.
5. **Editor queue.** Submitted stories arrive with their report. Editors approve them or send them back with a note. Approved stories can be added to the archive, so the style profile keeps improving.

## Run it

```bash
cd newsroom
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...        # optional: enables the AI guide + review
uvicorn app.main:app --reload
```

Open http://localhost:8000 and choose **Set up a newsroom**; you become its editor. Upload the files in `samples/archive/` on the **Style guide** tab, then check a story on **Write & check**. The **Team & apps** tab shows the invite code reporters use to join.

### Chrome extension

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose `clients/chrome-extension`.
3. Click the Style Desk toolbar button and sign in with the server address and your account.

Start typing in any text box. Problems are underlined, and the badge in the corner of the box opens suggestions. Click an underlined word to jump to its fix.

Settings (environment variables):

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset | Enables the AI style guide and AI review |
| `NEWSROOM_MODEL` | `claude-opus-5-5` | Model used for the AI features |
| `NEWSROOM_DB` | `newsroom.db` | SQLite database path |

## Tests

```bash
cd newsroom && python -m pytest -q
```

## Layout

- `app/learner.py`: measures style preferences from the archive (deterministic, needs no API key)
- `app/checker.py`: checks a story against the learned profile and the house rules
- `app/ai.py`: Claude style-guide distillation and story review (structured outputs)
- `app/main.py`: FastAPI routes; `app/auth.py`: accounts, newsrooms and tokens; `app/db.py`: SQLite storage
- `app/static/`: the web app (installable PWA)
- `clients/chrome-extension/`: the browser extension (Manifest V3)

## Not built yet

See [docs/ROADMAP.md](docs/ROADMAP.md): Google Docs and Word add-ins, Android and iOS keyboards, native apps, and what a public launch needs.
