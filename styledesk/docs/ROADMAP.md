# Style Desk: clients roadmap

One server holds each person's (or team's) trained voices, and every place they write connects to it. Every client is thin:
- it sends text to `POST /api/check` with the user's token and chosen voice, and shows the issues that come back;
- it calls `POST /api/rewrite` to rewrite flagged passages in that voice.

Learning, rules and AI all live on the server, so a voice behaves the same in every app.

```
            ┌────────────── Style Desk server ──────────────┐
            │ accounts · workspaces · voices · samples      │
            │ POST /api/check   POST /api/rewrite            │
            └───────────────────────▲────────────────────────┘
      ┌──────────┬──────────────┬───┴─────────┬──────────────┬───────────────┐
   Web app   Chrome ext.   Google Docs    Word add-in   Android kbd    iOS kbd
   (PWA)     (any site)    add-on                       / app          / app
```

## Built and tested

| Client | Status | Notes |
|---|---|---|
| Web app | Done | Train voices, check text, rewrite flagged parts or the whole text, with a preview. Installable on desktop and phones. On Android the installed app appears in the share sheet, so text from any app (including AI chat apps) can be sent to it. |
| Chrome extension | Done | `clients/chrome-extension`. Pick a voice. Issues are underlined as you type in any text box or rich editor, with the match score, one-click fixes, "rewrite in my voice" in place (undoable), ignore, an AI deep check, and an on/off switch per site. Also works in Edge and Brave. |

## Next, in recommended order

1. **Publish the extension to the Chrome Web Store.** Needs a developer account ($5 one-off), a privacy policy and store screenshots. Porting to Firefox is small (same code, MV3 manifest tweaks).
2. **Google Docs add-on.** The extension can't read Google Docs, because Docs draws text on a canvas. Grammarly uses special integration for this too. Build a Google Workspace add-on (Apps Script sidebar) that sends the document text to `/api/check` and applies fixes with the Docs API.
3. **Microsoft Word add-in.** A lot of professional writing happens in Word. An Office.js task pane works in Word desktop, Mac and web from one codebase.
4. **Android keyboard and app.** Kotlin `InputMethodService`. It reads the text around the cursor through `InputConnection`, checks it on a pause, and offers "rewrite in my voice" from the suggestion strip. Needs the Android SDK and a test device (not available in this build environment). A companion app handles sign-in, which the keyboard shares.
5. **iOS keyboard and app.** Swift keyboard extension (`UIInputViewController`, `textDocumentProxy`). iOS only lets a keyboard reach the network when the user turns on "Allow Full Access", and gives it limited access to surrounding text. Needs a Mac with Xcode and an Apple developer account ($99 a year).
6. **System-wide desktop app (Mac/Windows).** Checking text in every desktop app, as Grammarly Desktop does, relies on accessibility APIs and is the largest piece of work. The installable web app and the extension cover most writing until then.

## Before a public launch

- **Hosting:** HTTPS hosting, and moving from SQLite to Postgres.
- **Accounts:** password reset, email verification, and Google/Microsoft sign-in. Teams such as newsrooms will expect single sign-on.
- **Privacy:** people's writing samples and drafts can be private or unpublished, so this needs a clear policy:
  - The extension only reads the text box being typed in, and can be switched off per site.
  - With AI on, text is sent to the Anthropic API.
  - Add "export my data" and "delete my account".
- **Cost control:** every deep check, profile and rewrite is a paid API call. Add per-user rate limits and usage caps, and plan pricing around them (for example a free tier with rule-based checks only, and a paid tier for AI rewriting).
- **Quality:** build a small evaluation set of voices and AI drafts, so the effect of changes to the prompts on rewrite quality can be measured.
