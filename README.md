# Phillips CRM

A custom CRM for a tax and advisory firm. It tracks tax-strategy clients, advisory companies and deals, and revenue, and it runs email automation from Gmail.

It is a single-file web app with no build dependencies or framework. The source lives in `src/` and `build.sh` bundles it into one `index.html` for static hosting (for example Tiiny.host).

## Features

- **Dashboard and tasks**: daily overview, task list with assignees and due dates.
- **Contacts, companies, deals**: tags, notes, activity timeline, and a kanban deal board. Client deals use the full stage list. Company advisory projects use a simple Open / Closed / Lost pipeline.
- **Clients**:
  - Tiers: Platinum, Gold, Silver, Special.
  - Designations (REPS, STR, business owner, W-2), strategies, and work items, each with a status.
  - Check-in cadence by tier with overdue tracking.
  - Client status (onboarding, active, paused, former) and next review date.
- **Revenue**:
  - Revenue types: quarterly strategy fees, retainers, startup fees, deal fees, consulting, commissions.
  - Fee plans (monthly, quarterly, annual) that generate installments.
  - Tier-based default fees and a sign-on rule (startup fee plus current quarter at signing).
  - Ledger, amounts due, charts, and a breakdown by billing type.
  - Potential revenue from open deals.
- **Advisory and equity**: company advisory agreements set a fee in basis points on project value, split between cash and equity. The terms sync into open projects. An equity portfolio tracks pending, issued, realized, and forfeited positions.
- **Email automation**:
  - Templates with merge tags.
  - Multi-step sequences with delays, sent from Gmail during business hours. They stop on reply, bounce, or unsubscribe.
  - Workflows triggered by events (contact created, form submitted, tag added, deal created, deal stage changed) or by dates (before a quarter, before a client review, after a client signs).
  - Workflow actions: send email, enroll in a sequence, create task, delay, add or remove tag, set stage, notify, stop sequences.
  - Automation log.
- **Website lead form**: the Apps Script web app accepts form posts (with a honeypot field) and creates or updates contacts. Settings generates an embed snippet.
- **AI assistant**: a chat panel that calls the Anthropic API from the browser. It proposes workflows, templates, tasks, and emails as cards, and nothing is saved until you approve. The API key is stored only in the browser's localStorage.
- **Backup and restore**: JSON export and import in Settings.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/shell.html` | HTML skeleton with `/*CSS*/` and `/*JS*/` placeholders |
| `src/styles.css` | All styles |
| `src/core.js` | Config, utilities, state, shell, data helpers, Firebase boot |
| `src/views.js` | Dashboard, contacts, companies, deals, tasks |
| `src/clients.js` | Client views and drawer, check-ins |
| `src/revenue.js` | Fee plans, ledger, revenue view |
| `src/advisory.js` | Advisory agreements, deal fees, equity |
| `src/auto.js` | Templates, sequences, workflows, log, settings |
| `src/dates.js` | Date-based workflow triggers |
| `src/local.js` | Local mode storage, backups, in-browser automation preview |
| `src/ai.js` | AI assistant |
| `src/boot.js` | Startup |
| `apps-script/Code.gs` | Automation engine (Google Apps Script) |
| `firestore.rules` | Firestore security rules |
| `build.sh` | Bundles `src/` into `index.html` |
| `index.html` | Built output (generated, committed for easy hosting) |

## Build

Requires `sh` and `python3`.

```sh
./build.sh
```

This concatenates the JS modules in a fixed order (`core, views, clients, revenue, advisory, local, ai, auto, dates, boot`) into `index.html`. Edit files in `src/`, never `index.html` directly.

## Running modes

**Local mode (default).** While `FIREBASE_CONFIG` in `src/core.js` still contains the `PASTE_...` placeholders, the app stores everything in the browser's localStorage. You can load sample data or start empty. Automations run as an in-browser preview and do not send real email. Use this for trying the app out. Data lives in one browser only, so use the backup export regularly.

**Live mode (team use).** Fill in `FIREBASE_CONFIG`, rebuild, and host `index.html`. Data is shared through Firestore, sign-in is Google, and the Apps Script engine sends real email.

## Live setup

1. **Firebase project.** Create one in the Firebase console. Enable Firestore and enable Google as an Authentication sign-in provider. Add your hosting domain under Authentication > Settings > Authorized domains.
2. **Web config.** In Project settings > Your apps, create a web app and paste its config into `FIREBASE_CONFIG` in `src/core.js`. Run `./build.sh`.
3. **Security rules.** Edit the email allowlist in `firestore.rules` to the real sign-in addresses, then paste the file into Firestore > Rules and publish. Only listed, verified Google accounts can read or write.
4. **Service account.** In Firebase Project settings > Service accounts, generate a private key (JSON). The engine uses it to read and write Firestore, bypassing the rules.
5. **Apps Script engine.**
   1. Create a new Apps Script project (signed in as the account that will send mail) and paste in `apps-script/Code.gs`.
   2. Project Settings > Script properties: add `SERVICE_ACCOUNT_JSON` with the entire key file contents.
   3. Run `setup()` once from the editor and approve the Gmail permissions. It checks Firestore, installs a 5 minute trigger, and does a first run.
   4. Optionally run `sendTestEmail()` to check your signature and delivery.
6. **Web app (form and unsubscribe links).** Deploy > New deployment > Web app, execute as you, access for anyone. Add the deployment URL as the `WEBAPP_URL` script property. Open Settings in the CRM for the website form snippet.
7. **Host** the built `index.html` and sign in. Save Settings once so the engine can find its settings document.
8. **AI assistant (optional).** Enter an Anthropic API key in Settings. It stays in your browser.

### Engine limits

The engine caps sends per run, stops when the daily Gmail quota runs low, limits workflow event chaining depth to prevent loops, and ends each run well before the 6 minute Apps Script limit. See the `CFG` block at the top of `Code.gs`.

## Security notes

- Client data is sensitive. Keep `firestore.rules` restricted to your team and never commit a service account key or API key.
- `.gitignore` excludes `*backup*.json` exports and `*.zip` files.
- The AI assistant sends a snapshot of CRM data (clients, deals, contacts) to the Anthropic API when you use it.
- Anyone with access to the hosted `index.html` can see the Firebase web config. That is normal for Firebase, and the Firestore rules are what protect the data.

## Status

There are no automated tests. The app is configured for local mode until the Firebase config is filled in.
