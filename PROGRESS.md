# TaskNotes – App Progress

> For a new chat: read this first, then IDEAS.md.

## What we're building
- Todo list app with **categories / folders**
- Tasks have **time to complete** (estimate / due)
- **Quick notes** (just jot something down)
- **"Review later" notes** – things to look back over
- **MCP server** so Claude can read/add tasks & notes
- Later: hook up my own assistant app (Claude only for now)
- Data stored in **Google Drive** (online backup / sync)
- App installed on **mobile**
- Code lives on **GitHub**: `DF-AI-Lab/tasknotes-mcp`

## Status
- [x] Grill done, plan signed off, look picked (Ocean)
- [x] **Step 1: phone app + lock (offline)**, in `docs/`
- [x] **Step 2: Worker + Sheet sync**, code in `worker/` (not deployed yet)
- [x] **Step 3: MCP for Claude**, on the same Worker (not deployed yet)
- [x] Tests: 14 passing (`node --test tests/*.test.js worker/test/*.test.js`), GitHub Actions runs them
- [ ] Darren: turn on GitHub Pages (SETUP.md step 1)
- [ ] Darren: Google robot + Cloudflare + secrets (SETUP.md steps 2-4)
- [ ] Connect phone + Claude (SETUP.md steps 5-6)
- [ ] Test on the real phone, then switch to the darrenfawcett1980 Sheet

## What's built (v0.1.0)
**App (`docs/`)**
- Lock: name → 6-digit PIN twice → 10 backup codes → offer fingerprint. PIN pad, 5 wrong = 15 min lock,
  re-locks after 5 min idle, "Forgot PIN?" with a backup code. Shared module, any DF app can use it
  (`LockUI.start({app, prefix, ...})`).
- Day screen: day bar (planned mins vs free time), category tiles (tap = filter), Overdue / Today / Tomorrow /
  This week / Later / No date, latest notes.
- Quick add understands `Call mum 20m tomorrow #home`. Task/Note switch.
- Tap a task = edit sheet (title, category, due chips + date, minutes chips). Tap circle = tick + Undo.
- Notes: cards, 🔖 Later / ✓ Reviewed button, edit sheet. Review tab with badge. Done tab.
- "🤖 Claude wants to delete" box: Keep / Delete. Auto-gone after 7 days.
- Settings: name, colour (Ocean / Ember / Mint), free hours per day, categories (add, rename, icon, colour,
  delete → items move), cloud sync, fingerprint on/off, change PIN, new backup codes, lock now,
  download a copy (JSON), demo.
- Offline: service worker (`sw.js`, bump VERSION each release). `?demo=1` uses fake data in sessionStorage only.

**Worker (`worker/`)**
- `/api/ping`, `/api/sync` (Bearer APP_KEY): phone sends changed rows, newest `updated` wins, gets the whole Sheet back.
- Sheet columns are added automatically (reads the old mock format too, UK dates OK).
- `/mcp`: MCP (Streamable HTTP, JSON). Login = OAuth with PKCE where Darren types `MCP_PIN` once.
  Stateless signed tokens (TOKEN_SECRET). Optional KV `LOCKS` for PIN lockout.
- Tools: day_summary, list_tasks, add_task, edit_task, complete_task, list_notes, list_review_notes,
  add_note, edit_note, list_categories, add_category, delete_item (soft).

## Decisions made
- Mobile: **PWA** (web app added to home screen), **Android**
- Claude: **online MCP** so it works on phone + claude.ai
- Storage: **Google Sheet** – mock: [TaskNotes Data (mock)](https://docs.google.com/spreadsheets/d/1CmMYDzu4nEv-Es1Q0HVY7Q63nvk_rwwDNPVdhr9AJUQ/edit)
  - Tabs: Tasks / Notes / Categories
  - Lives in the Drive of `df.ai.lab.hq@gmail.com`
- Time: **due date + estimate (mins)**
- Folders: **flat categories**
- Hosting: **app on GitHub Pages** (same as WMM Lite). **MCP on a free Cloudflare Worker** (reads/writes the Sheet)
- Google accounts: **df.ai.lab.hq** for testing, **darrenfawcett1980** for real use
- Login: **copy WMM Lite's lock** (`docs/lock.js` + `docs/lockui.js` on branch `claude/elegant-davinci-h39d2r`
  of DF-AI-Lab/wheres-my-money-lite): passcode + backup codes + fingerprint passkey, in the browser.
  Make it shared so other apps reuse it. Google is NOT the login, only data storage.
- Claude deletes: crossed out, I confirm/undo; auto-deleted after **7 days** if ignored
- Claude connects once with PIN/fingerprint, then stays connected
- Claude (MCP): add / read / edit / tick off. **Delete = soft delete** (crossed out, I confirm or undo in the app)
- Offline: **yes**. Phone keeps its own copy, syncs to the Sheet when online; MCP uses the same Sheet
- Review later: **flag on a note** + a Review screen
- Reminders: **later** (in IDEAS.md)
- Done tasks: **hidden, kept**
- Sync: **phone talks only to the Worker**; Worker talks to Google (no Google login on the phone)
- Worker reaches the Sheet with a **Google service account** (Sheet shared with it once)
- MCP tools v1: add task/note, list tasks (by category/due), edit, tick off, list review-later notes,
  add category, soft delete
- Look: **same style as WMM Lite** (cards, light + dark)
- Name: **TaskNotes**
- Testing: **`?demo=1`** fake-data mode, never touches real data
- Build order: 1) phone app + lock (offline) 2) Worker + Sheet sync 3) MCP for Claude

## Design (picked 31 Oct)
- Mockup: `design/mockup.html` (live: https://claude.ai/artifact/VBWSfKBnMyqZdttPmxaJti)
- Colour: **Ocean** (blue dark). Ember and Mint kept in the mockup as spares.
- Opening: PIN pad (6 dots, keypad, fingerprint key), "Hi Darren".
- Main: "Your day" header + day bar (minutes per category vs ~6h), category tiles (tap to filter),
  Today / Tomorrow / Later list with time + category pill, sticky note cards (tap = review flag),
  quick-add box (Task/Note toggle), bottom nav Day / Notes / Review / Done, undo toast.

## Next step
Darren follows SETUP.md (Pages → Google robot → Cloudflare → connect phone and Claude), then tests on the phone.

## Reference: WMM Lite (the pattern to copy)
- Repo: DF-AI-Lab/wheres-my-money-lite, live branch `claude/elegant-davinci-h39d2r`, site in `docs/`
- Live: https://df-ai-lab.github.io/wheres-my-money-lite/
- Has: lock.js/lockui.js (lock), sw.js (offline), sheet.js, DRIVE_SETUP.md (Drive `drive.file` scope)
- NOT PythonAnywhere (that is the old financial-tracker app)

## v0.2.0 · 🔐 Secrets (2026-10-31)
- New **Secrets** tab. Needs the PIN every time (no fingerprint). Locks after 1 min idle, on leaving the tab, or when the app goes to the background.
- Each secret = a name + hidden text, shown once open, with 📋 Copy.
- Scrambled on the phone (AES-GCM, key from the lock key) before syncing. The Sheet gets a **Secrets** tab of gibberish. No Claude tool reads it.
- Limit: only this phone's key opens them. A new phone needs the backup-file idea (see IDEAS.md).
- Redeploy the Worker so it syncs the Secrets tab (an old Worker just leaves secrets on the phone).

## 🏷️ Version numbers
- Shown under the initials (top right) and in Settings.
- Live: `v.1.01` → bump `VERSION` in `docs/app.js` **and** `docs/sw.js` (so phones get the new files).
- Demo: `demo.v.01` → bump `DEMO_VERSION` in `docs/app.js`.
- Then update `docs/version.json` (version, demo, notes). Open apps see it and show the 🎉 update pop-up.
- v.1.01: zoom turned off (no sideways sliding), version labels added.
- v.1.02 / demo.v.02: secret cards fold up (tap the name), plus Open all / Close all.
- v.1.03 / demo.v.03: 🎉 update pop-up at the bottom when a new version is live.
