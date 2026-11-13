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

   With an OpenAI or Anthropic API key, the AI also reads your samples and writes a **voice profile**: your tone, signature phrases and the things you'd never write.
2. **Add your own rules (optional).** "Always use 'use', never 'utilize'", "never 'synergy'", or a note such as "I don't start emails with 'I hope this finds you well'".
3. **Check any text.** You get:
   - a **match score** (0-100);
   - the measurable **differences** from your writing ("16 words per sentence here; you average 8");
   - every flagged passage highlighted, with a reason.

   Tick **Deep check with AI** and the AI also judges tone and voice.
4. **Rewrite in your voice.**
   - Rewrite a single flagged passage, all flagged passages, or the whole text.
   - Flagged passages are widened to full sentences so the rewrite reads naturally.
   - Facts, names, numbers and quotes are kept, and the AI never invents experiences. If your voice depends on personal stories the draft doesn't have, tick **Leave notes where my own details should go** to get [fill-in notes] instead.
   - You see a preview with the changes highlighted before you accept it.

## Where it works

- **Web app.** It can be installed on desktop (Chrome/Edge: Install app) and phones (Add to Home Screen).
- **Chrome extension.** Checks any text box or rich editor on the web as you type and underlines what doesn't sound like you. It can rewrite flagged sentences in place, and Ctrl+Z undoes a rewrite.

Plans for Google Docs, Word, keyboards and native apps are in [docs/ROADMAP.md](docs/ROADMAP.md).

## Run it

```bash
cd styledesk
pip install -r requirements.txt
export OPENAI_API_KEY=...           # optional: enables the voice profile, deep check and rewriting
                                    # (or ANTHROPIC_API_KEY to use Claude instead)
uvicorn app.main:app --reload
```

Open http://localhost:8000 and create an account.

To try it:
1. Create a voice and upload the files in `samples/voices/personal-blog/`.
2. Paste the text of `samples/ai-draft.txt` into **Check & rewrite** and press **Check**.

Without an API key, the training, fingerprint, rules, AI-phrase detection and match estimate all work. Rewriting needs a key.

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
| `OPENAI_API_KEY` | unset | Enables the AI features using OpenAI |
| `OPENAI_MODEL` | `gpt-6-astra` | OpenAI model used |
| `ANTHROPIC_API_KEY` | unset | Enables the AI features using Claude instead |
| `STYLEDESK_MODEL` | `claude-opus-5-5` | Claude model used |
| `STYLEDESK_AI_PROVIDER` | auto | `openai` or `anthropic`; by default whichever key is set (Anthropic first if both are) |
| `STYLEDESK_DB` | `styledesk.db` | SQLite database path |

## Tests

```bash
cd styledesk && pip install pytest httpx && python -m pytest -q
```

To try the AI features for real on the sample voice (a few cents of API use):

```bash
export OPENAI_API_KEY=...
python scripts/try_ai.py                                   # personal-blog voice vs samples/ai-draft.txt
python scripts/try_ai.py samples/voices/news-reporting my-draft.txt
```

This prints the learned voice profile, the review of the draft, a rewrite of the flagged parts and a whole-text rewrite. Each comes with a rule-based score, so you can see whether it moved toward the voice.

## Deploy

### Render (recommended)

`render.yaml` at the repository root is a Render Blueprint. It defines the web service, a 1 GB persistent disk for the database, a health check and the settings.

1. In Render, choose **New > Blueprint** and connect this GitHub repository. Pick the branch that contains `render.yaml`.
2. Render asks for two values:
   - `OPENAI_API_KEY`: your OpenAI key.
   - `STYLEDESK_SIGNUP_CODE`: a code people need to create an account. Leave it empty to let anyone sign up, but they'll be using your API key.
3. Click **Apply**. The first build takes a few minutes. The app will be at `https://styledesk-XXXX.onrender.com`.

It runs on the Starter plan, because persistent disks need a paid instance. Every push to the branch redeploys automatically.

### Other hosts

The `Dockerfile` runs anywhere that runs containers:
- Set `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`) as a secret.
- Mount a persistent volume at `/data`.
- Serve over HTTPS.
- The app listens on `$PORT`.

### Protecting your API key on a public server

| Variable | Default | Purpose |
|---|---|---|
| `STYLEDESK_SIGNUP_CODE` | unset | If set, new accounts need this code. Team invites still work without it. |
| `STYLEDESK_AI_DAILY_LIMIT` | `40` | AI checks, voice learning and rewrites allowed per user per UTC day. `0` means no limit. A failed AI call doesn't count. |

Set a monthly spending limit in your OpenAI account as well.

## Layout

- `app/learner.py`: learns habits, the style fingerprint and AI-phrase usage from samples (no API key needed)
- `app/checker.py`: flags passages, compares fingerprints, estimates the match score
- `app/ai.py`: AI voice profile, voice/tone review and rewriting, on OpenAI or Claude (structured outputs, streamed)
- `app/main.py`: API; `app/auth.py`: accounts, workspaces and tokens; `app/db.py`: SQLite
- `app/static/`: the web app (installable PWA)
- `clients/chrome-extension/`: the browser extension (Manifest V3)
- `samples/`: two example voices and an AI-written draft to test with
