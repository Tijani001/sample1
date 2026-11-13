# Style Desk

Teach it how you write. Then paste in anything (a draft an AI wrote for you, a colleague's edit, an old email) and Style Desk shows which parts don't sound like you and rewrites them in your voice.

It works for one person or a whole team. A newsroom, for example, can train one shared "house style" voice and every reporter checks against it.

## How it works

1. **Train a voice.** Create a voice ("My blog", "Work emails", "Our newsroom") and add samples of your own writing. About 1,000 words is a good start. Style Desk measures:
   - **Rhythm:** sentence length and how much it varies, reading ease, vocabulary variety.
   - **Tone and formality:** contractions, first person ("I", "we"), addressing the reader as "you", questions and exclamation marks.
   - **Punctuation:** dashes and semicolons.
   - **Habits:** UK or US spelling, "per cent" or "%", "said" or "says", the serial comma, how titles are capitalised. A habit only counts when your samples are consistent about it.
   - **AI-sounding phrases** ("delve into", "in today's fast-paced world", "it's not just X, it's Y"). They're flagged only if you never use them yourself.

   With an Anthropic API key, Claude also reads your samples and writes a **voice profile**: your tone, signature phrases and the things you'd never write.
2. **Add your own rules (optional).** "Always use 'use', never 'utilize'", "never 'synergy'", or a note such as "I don't start emails with 'I hope this finds you well'".
3. **Check any text.** You get:
   - a **match score** (0-100);
   - the measurable **differences** from your writing ("16 words per sentence here; you average 8");
   - every flagged passage highlighted, with a reason.

   Tick **Deep check with AI** and Claude also judges tone and voice.
4. **Rewrite in your voice.**
   - Rewrite a single flagged passage, all flagged passages, or the whole text.
   - Flagged passages are widened to full sentences so the rewrite reads naturally.
   - Facts, names, numbers and quotes are kept.
   - You see a preview with the changes highlighted before you accept it.

## Where it works

- **Web app.** It can be installed on desktop (Chrome/Edge: Install app) and phones (Add to Home Screen).
- **Chrome extension.** Checks any text box or rich editor on the web as you type and underlines what doesn't sound like you. It can rewrite flagged sentences in place, and Ctrl+Z undoes a rewrite.

Plans for Google Docs, Word, keyboards and native apps are in [docs/ROADMAP.md](docs/ROADMAP.md).

## Run it

```bash
cd styledesk
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...        # optional: enables the voice profile, deep check and rewriting
uvicorn app.main:app --reload
```

Open http://localhost:8000 and create an account.

To try it:
1. Create a voice and upload the files in `samples/voices/personal-blog/`.
2. Paste the text of `samples/ai-draft.txt` into **Check & rewrite** and press **Check**.

Without an API key, the training, fingerprint, rules, AI-phrase detection and match estimate all work. Rewriting needs the key.

### Chrome extension

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose `clients/chrome-extension`.
3. Click the Style Desk toolbar button, sign in with the server address, and pick a voice.

Type in any text box. The badge in its corner shows how many things were flagged. Click it, or an underlined word, to see suggestions and rewrite.

### Teams

Every account starts with its own private workspace. The owner can share the invite code from **Account**, and people who join can:
- use every voice in the workspace;
- edit the voices they create.

The owner can manage everything.

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset | Enables AI voice profiles, deep checks and rewriting |
| `STYLEDESK_MODEL` | `claude-opus-5-5` | Model used for the AI features |
| `STYLEDESK_DB` | `styledesk.db` | SQLite database path |

## Tests

```bash
cd styledesk && python -m pytest -q
```

## Layout

- `app/learner.py`: learns habits, the style fingerprint and AI-phrase usage from samples (no API key needed)
- `app/checker.py`: flags passages, compares fingerprints, estimates the match score
- `app/ai.py`: Claude voice profile, voice/tone review and rewriting (structured outputs)
- `app/main.py`: API; `app/auth.py`: accounts, workspaces and tokens; `app/db.py`: SQLite
- `app/static/`: the web app (installable PWA)
- `clients/chrome-extension/`: the browser extension (Manifest V3)
- `samples/`: two example voices and an AI-written draft to test with
