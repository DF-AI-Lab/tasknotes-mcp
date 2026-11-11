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
- [x] GitHub Pages live (SETUP.md step 1)
- [x] Google robot + Cloudflare + secrets, Worker deployed (SETUP.md steps 2-4)
- [x] Claude connected (SETUP.md step 6), tested working 7 Nov
- [x] Todoist copied into TaskNotes 7 Nov (Todoist left as it is)
- [ ] Darren: change MCP_PIN back to a strong one + run Deploy Worker (it's a simple test PIN right now)
- [x] Deploy fixes from `claude/jolly-wozniak-511lt5` merged into main (7 Nov)

## 🚀 Worker live (7 Nov 2026)
- Address: https://tasknotes.df-ai-lab-hq.workers.dev (shows "TaskNotes Worker v0.2.0 is running")
- Claude connector URL: https://tasknotes.df-ai-lab-hq.workers.dev/mcp (claude.ai → Settings → Connectors → TaskNotes)
- Deploy: Actions → Deploy Worker → Run workflow → branch **main**. (Also runs by itself when `worker/` changes on main.)
- Cloudflare token: the **"Edit Cloudflare Workers"** one is the one in GitHub. Don't delete it.
- Changing a GitHub secret does nothing until **Deploy Worker** runs again.
- MCP_PIN = only for connecting Claude once. Changing it later does NOT sign Claude out (TOKEN_SECRET does).
- Claude asks permission once per tool (12 tools). Settings → Connectors → TaskNotes to set "Always allow" for all.

## ⭐ v1.18: star rules + more ⋯ options (7 Nov 2026)
- Star a category = all its tasks/notes get ⭐. You can still unstar one of them, or star one in a plain category
- `important` cell: categories `yes` / empty. Tasks + notes: empty = follow category, `yes` = starred, `no` = unstarred
  (old TRUE/FALSE from v1.16 still read fine). MCP edit_task / edit_note important:false works inside a starred category
- ⋯ menu adds: 🗂️ Move to another category, 📄 Duplicate, 📋 Copy the text

## 🗂️ v1.17: task cards (7 Nov 2026)
- Each task is a card: title, category / date / time pills, notes cut to 2 lines
- Tap a card with notes = open it (full notes), tap again = close. Only one open at a time.
  A card with no notes opens Edit straight away
- Right side: ⭐ (tap to star / unstar) and ⋯ menu: Edit, Move to tomorrow, Move to next week, Tick off, Delete
- Important cards get a gold edge on the left

## ⭐ v1.16 / Worker 0.3.0: Important (7 Nov 2026, asked by Orbit)
- Star a **task** (☆ button next to 🗑️ in the task sheet), a **note** (⭐ Important chip) or a whole **category** (⋯ → ⭐ Mark important)
- A task/note counts as important if it has its own ⭐ **or** its category has one
- New `important` column on Tasks, Notes and Categories (added to the Sheet by itself)
- MCP: ⭐ shows in list_tasks / list_notes / list_categories lines. `important_only: true` on list_tasks + list_notes.
  `important` on add_task, edit_task, add_note, edit_note, add_category. New tool **edit_category** (13 tools now)
- list_tasks `search` now looks in the task notes too
- Dates: Orbit handles dates/times (next 2 weeks only). TaskNotes gives no "far away" warnings, none needed
- Needs: merge to main → Deploy Worker runs by itself (worker/ changed)

## 📥 Todoist import (7 Nov 2026)
- New category 🛒 Shopping. Home tasks → Home, Projects → AI Lab, "Things to look in to" → review-later notes.
- Long Todoist descriptions became AI Lab notes. Labels went in brackets in task names.
- Hedge task was "every Saturday" in Todoist: no repeats in TaskNotes yet (idea for IDEAS.md).

## v1.06: Passport 🛂
- The old lock (lock.js + lockui.js) is gone. Passport is the lock now (`docs/passport/`, `docs/passport-lock.js`)
- Same Google sign-in as Passport. The Sheet lives in **App data - DON'T DELETE / DF…… / Todo** (an old loose Sheet gets moved in)
- 🔐 Secrets open with the passport passcode (its hidden key). Old Secrets made with the old PIN can't be opened.
- Settings → 🛂 Passport: change passcode, backup codes, fingerprint
- Update Passport: copy the new files from DF-AI-Lab/Passport-ID into `docs/passport/` (see PASSPORT.md there)

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

## 🎨 Demo 2 round 3 (11 Nov 2026), `docs/demo2/`
- Spring tick: tick pops, line crosses out, card lifts and springs to the bottom as one line with the time
- Pin button on every task row, springs to the top
- Bottom bar "line + dot" with a shaded + button
- Header fixed, only the middle scrolls
- Mocks: https://claude.ai/artifact/B6mLMuojAdb2BQMxThzfzK
- Branch `claude/confident-gates-3t4exr`, needs merging to main to show on the phone

## 🎨 Demo 2 round 4 (11 Nov 2026), live on main
- Edit sheet like the live app: title, 3 pills (Category / Date / Time), fixed-height notes, options slide over the notes (no jump)
- Short 36px buttons, red bin on the right, + to add a category
- Tasks open into one big card ("Big tick" design: colour outline, big pulsing tick, Later, pin, ⋮). Notes use the same card
- Scrollbar gone, small arrow in the corner when there is more
- Notes filters on one line as text tabs: All fixed, bookmark = Review later, categories scroll, search icon on the right
- 🔐 Secrets tab is now **Vault** with Secrets / Documents tabs, a search box, and cards (Show/Hide, copy, Open)
- + on Vault: New secret sheet (name, Password/PIN/Code, secret) and New document sheet (name, category, choose file)
- + in the edit sheet attaches documents to a task or note (shows on the card)
- Header spacing halved, line under the filters removed
- Day change is smooth: the highlight glides, the list slides in
- Demo only: vault items and files are pretend (names and sizes, not real files)
- Phone shows an old copy? Add `?v=8` to the link or close and reopen

## 🆕 New look on the live app (11 Nov 2026), at /next/

- **Where:** `docs/next/`. The live app at `/` is untouched.
- **How:** the Demo 2 skin on the real insides (store, Google Sheet sync, Passport, Vault). Same storage, so the same data.
- **Day, Notes, Done:** real tasks and notes. Claude's delete requests show at the top of Day.
- **Notes:** first line is the title, the rest is the body (still one `text` field, so the Sheet is unchanged).
- **Vault:** passcode keypad, then Secrets with Password / PIN / Code. Documents show "coming soon" (they need Drive storage).
- **Settings:** name, free time, categories (colours), Google account, fingerprint, Passport, lock, invite, download, demo, back to old look.
- **Passport:** new theme in `docs/next/passport/theme.json`.
- **Safe bits:** `/next/` has its own offline cache (`tnnext-`). The live `sw.js` no longer saves other pages (demo2, next) as its offline copy.
- **Not in yet:** file attachments and Documents (need Drive), task time-of-day.
- **Backup:** the live app before this is commit `dffee80`.

## Next step
Change MCP_PIN to a strong one + redeploy.

### 📋 Next session list (Darren, 7 Nov)
1. ~~**Full merge** of `claude/jolly-wozniak-511lt5` into main~~ ✅ done 7 Nov (deploy fixes + real SHEET_ID now on main)
2. ~~**Edit categories**~~ ✅ v1.12: ⋯ on each tile → Edit / Tick off all / Delete (asks first, 10 sec undo)
   - ✅ v1.13: opens straight in (no passcode unless 🔒 Lock now / Sign out) + Google 1-hour sign-in survives closing the app. Google still needs a quick re-tap after each hour (fix idea: sync through the Worker instead).
   - ✅ v1.14: 📱 Invite a friend (Settings): QR + Copy link + Share. Friends get their OWN TaskNotes. Google app is still in Testing = add each friend as a test user (or Publish app).
3. ~~**No timer lock on the app**~~ ✅ v1.11/v1.13: opens straight in (v1.13 flag `tasknotes-locked`, set only by Lock now / Sign out). Secrets unchanged
4. Maybe: repeating tasks (IDEAS.md)

### 📋 Next session list (Darren, 7 Nov evening) — live = v1.14 on main
- **Linking devices:** NOT needed as WMM's Main/invite. Same Google = same passport = same Sheet. TaskNotes merges row by row
  (newest `updated` wins, only changed rows sent), so a stale PC can't wipe the phone. Darren is fine with that ("no Main is way better").
  Tiny gap (2 devices saving in the same 1-2 s, whole-Sheet write) = optional "read back + resend" fix in gsheet.js run() + Worker.
- **Friends can't sign in yet:** Google app still Testing → add test users (Google Cloud → Audience) or Branding + privacy page + Publish.
- **Google re-tap every hour:** idea = sync through the Worker (service account) so the app never needs Google's token.
- Optional: 📱 Your devices list in Settings.
- Darren: change MCP_PIN to a strong one + run Deploy Worker on main. Move the passport over to main live (his job).
- Day-to-day tasks: use a normal Claude chat (TaskNotes connector), not this coding repo.

**Setup facts (from 4 Nov):** robot `tasknotes-robot@passport-513517` (Passport project) is shared on the real Sheet.
Cloudflare = df.ai.lab.hq account.

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
- v.1.04 / demo.v.04: ☁️ Sign in with Google (Settings → Google account). Pick your email; the app makes **TaskNotes Data** in that Drive and syncs to it. Same Google project as WMM (docs/config.js). Scope drive.file only. The Worker is now the "Advanced" option.
- v.1.05 / demo.v.05: if Google Sheets is off, the app shows 4 steps, a Turn it on button and Try again.
- v.1.15 / demo.v.15: ✏️ new task screen (mock B, minimal): name, 3 pills (category · date · time, tap to open), Notes box. "+ New" category right there. Tasks get a `details` column (Sheet + Worker + Claude add_task/edit_task). 📝 shows on tasks with notes. Redeploy the Worker so Claude sees notes.
- v.1.12 / demo.v.12: ⋯ on each category tile: ✏️ Edit, ✅ Tick off all, 🗑️ Delete. Both ask "are you sure", then 10 seconds to undo.
- v.1.11 / demo.v.11: stays signed in. No 5 min lock. Only 🔒 Lock now or Sign out ask for the passcode again. 🔐 Secrets still asks every time.
