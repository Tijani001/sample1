# Style Desk

A newsroom tool that learns your house style from stories you've already published, then checks every story a reporter files before it reaches an editor.

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

Open http://localhost:8000. To try it, upload the files in `samples/archive/` on the **Style guide** tab, then check a story on **Write & check**.

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
- `app/main.py`: FastAPI routes; `app/db.py`: SQLite storage
- `app/static/`: the web interface

## Not built yet

- Logins and roles. Right now anyone who can open the app can see both the reporter and editor views.
- Several newsrooms or desks, each with its own style profile.
- Plugins for CMS tools (WordPress, Arc, Google Docs) so stories are checked where reporters already write.
