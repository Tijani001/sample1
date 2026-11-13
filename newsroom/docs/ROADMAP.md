# Style Desk: clients roadmap

Style Desk works the way Grammarly does: one server holds each newsroom's learned style, and every place a reporter writes connects to it. Every client is thin. It sends text to `POST /api/check` with the reporter's token and shows the issues that come back. The style learning, house rules and AI review all live on the server, so a newsroom's style is the same in every app.

```
            ┌────────────── Style Desk server ──────────────┐
            │ accounts & newsrooms · learned style · rules   │
            │ POST /api/check  (fast rules; use_ai = deep)   │
            └───────────────────────▲────────────────────────┘
      ┌──────────┬──────────────┬───┴─────────┬──────────────┬───────────────┐
   Web app   Chrome ext.   Google Docs    Word add-in   Android kbd    iOS kbd
   (PWA)     (any site)    add-on                       / app          / app
```

## Built and tested

| Client | Status | Notes |
|---|---|---|
| Web app | Done | Installable on desktop (Chrome/Edge "Install app") and phones ("Add to Home Screen"). On Android, the installed app appears in the share sheet, so reporters can share text from any app to check it. |
| Chrome extension | Done | `clients/chrome-extension`. Underlines issues as you type in any text box or rich editor (CMSs, WordPress, Gmail), with one-click fixes, undo, ignore, an AI deep check, and an on/off switch per site. Also works in Edge and Brave. |

## Next, in recommended order

1. **Publish the extension to the Chrome Web Store.** Needs a developer account ($5 one-off), a privacy policy and store screenshots. Porting to Firefox is small (same code, MV3 manifest tweaks).
2. **Google Docs add-on.** The extension can't read Google Docs, because Docs draws text on a canvas. Grammarly uses special integration for this too. Build a Google Workspace add-on (Apps Script sidebar) that sends the document text to `/api/check` and applies fixes with the Docs API.
3. **Microsoft Word add-in.** Many newsrooms file in Word. An Office.js task pane works in Word desktop, Mac and web from one codebase.
4. **Android keyboard and app.** Kotlin `InputMethodService`. It reads the text around the cursor through `InputConnection`, checks it on a pause, and shows fixes in the suggestion strip. Needs the Android SDK and a test device (not available in this build environment). A companion app handles sign-in, which the keyboard shares.
5. **iOS keyboard and app.** Swift keyboard extension (`UIInputViewController`, `textDocumentProxy`). iOS only lets a keyboard reach the network when the user turns on "Allow Full Access", and gives it limited access to surrounding text. Needs a Mac with Xcode and an Apple developer account ($99 a year).
6. **System-wide desktop app (Mac/Windows).** Checking text in every desktop app, as Grammarly Desktop does, relies on accessibility APIs and is the largest piece of work. The installable web app and the extension cover most newsroom writing until then.

## Before launching to other newsrooms

- **Hosting:** HTTPS hosting, and moving from SQLite to Postgres.
- **Accounts:** password reset and email verification, plus single sign-on (Google Workspace / Microsoft 365). Newsrooms will expect SSO.
- **Privacy:** unpublished stories are highly sensitive, so this needs a clear policy:
  - The extension only reads the text box a reporter is typing in, and can be switched off per site.
  - With AI review on, story text is sent to the Anthropic API.
  - Offer newsrooms a setting that turns AI off entirely.
- **Abuse protection:** per-user rate limits on `/api/check`, especially AI checks, which cost money per call.
- **Billing:** per-seat billing per newsroom if this becomes a product.
