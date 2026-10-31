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
- [ ] Grill round 4+
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
- Hosting: **Cloudflare** (app + MCP)
- Google accounts: **df.ai.lab.hq** for testing, **darrenfawcett1980** for real use
- Login: **shared login service** (reused by other apps) – email + username + 6-digit PIN + fingerprint
- Claude (MCP): add / read / edit / tick off. **Delete = soft delete** (crossed out, I confirm or undo in the app)
- Offline: **yes**, basic offline + sync later
- Review later: **flag on a note** + a Review screen
- Reminders: **later** (in IDEAS.md)
- Done tasks: **hidden, kept**

## Next step
Finish the grill-me questions, then lock the plan.
