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
- [x] Repo created
- [x] PROGRESS.md + IDEAS.md added
- [x] Grill round 1 + 2 done
- [x] Mock Sheet created
- [x] Grill round 3 done
- [x] Grill rounds 4-5 done
- [x] Grill round 6 done
- [ ] Final round: look, name, sign-off
- [ ] Tech stack decided
- [ ] Data model decided
- [ ] MCP server built
- [ ] Google Drive sync built
- [ ] Mobile app built

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
- Build order: 1) phone app + lock (offline) 2) Worker + Sheet sync 3) MCP for Claude

## Next step
Finish the grill-me questions, then lock the plan.

## Reference: WMM Lite (the pattern to copy)
- Repo: DF-AI-Lab/wheres-my-money-lite, live branch `claude/elegant-davinci-h39d2r`, site in `docs/`
- Live: https://df-ai-lab.github.io/wheres-my-money-lite/
- Has: lock.js/lockui.js (lock), sw.js (offline), sheet.js, DRIVE_SETUP.md (Drive `drive.file` scope)
- NOT PythonAnywhere (that is the old financial-tracker app)
