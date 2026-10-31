# TaskNotes – setup guide 🛠️

Do these in order. Each step is short.

---

## 1️⃣ Put the app online (GitHub Pages)

1. GitHub → **DF-AI-Lab/tasknotes-mcp** → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main**, folder: **/docs** → **Save**
4. After a minute it's live at:
   **https://df-ai-lab.github.io/tasknotes-mcp/**

> The code is on branch `claude/awesome-ptolemy-lyoozy` until it's merged into `main`.

📱 **On your phone (Chrome):** open the link → ⋮ menu → **Add to Home screen**.

🧪 **Demo:** add `?demo=1` to the link for fake data.

At this point the app works fully **offline on the phone**. Steps 2 to 5 add the Google Sheet and Claude.

---

## 2️⃣ Make the Google "robot" (service account)

Use **df.ai.lab.hq** for testing (and **darrenfawcett1980** later for real).

1. Go to https://console.cloud.google.com → make a project called **TaskNotes**
2. **APIs & Services → Library** → turn on **Google Sheets API**
3. **IAM & Admin → Service Accounts → Create** → name it `tasknotes-robot` → Done
4. Open it → **Keys → Add key → JSON** → a file downloads. Keep it secret.
5. Copy the robot's email (like `tasknotes-robot@tasknotes-123.iam.gserviceaccount.com`)
6. Open the Sheet **TaskNotes Data (mock)** → **Share** → paste the robot email → **Editor**

---

## 3️⃣ Make 3 secrets

Make up three things and keep them in your password manager:

| Name | What | Example |
|---|---|---|
| `APP_KEY` | the phone uses this to sync | 30+ random letters |
| `MCP_PIN` | you type this once to connect Claude | 8+ digits |
| `TOKEN_SECRET` | signs Claude's login | 30+ random letters |

---

## 4️⃣ Put the Worker online (Cloudflare, free)

### Option A: from GitHub (no computer needed) ⭐

1. Sign up at https://dash.cloudflare.com (free)
2. Find your **Account ID** on the right of the Workers page
3. **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"** template → copy it
4. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**. Add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `GOOGLE_SERVICE_ACCOUNT` (paste the **whole** JSON file)
   - `APP_KEY`, `MCP_PIN`, `TOKEN_SECRET`
5. GitHub → **Actions → Deploy Worker → Run workflow**
6. The Worker address is shown in the log, like `https://tasknotes.<you>.workers.dev`

### Option B: from a computer

```bash
cd worker
```

```bash
npx wrangler@3 login
```

```bash
npx wrangler@3 secret put GOOGLE_SERVICE_ACCOUNT
```

(repeat `secret put` for `APP_KEY`, `MCP_PIN`, `TOKEN_SECRET`)

```bash
npx wrangler@3 deploy
```

✅ **Check:** open the Worker address. It should say *"TaskNotes Worker is running"*.

🔒 **Optional, recommended:** block PIN guessing. Create a KV store called `LOCKS` and uncomment it in `worker/wrangler.toml`.

---

## 5️⃣ Connect the phone

App → tap your initials (top right) → **☁️ Cloud sync**

- Worker address: `https://tasknotes.<you>.workers.dev`
- App key: your `APP_KEY`
- **Test and save**

The 🔄 button shows the sync state:
- 🟢 synced
- 🟡 changes waiting
- 🔴 a problem (tap it to see what)

---

## 6️⃣ Connect Claude

claude.ai → **Settings → Connectors → Add custom connector**

- Name: **TaskNotes**
- URL: `https://tasknotes.<you>.workers.dev/mcp`
- A page opens → type your `MCP_PIN` → **Connect** ✅

Then try asking Claude:
- "What's on today?"
- "Add a task to book the MOT tomorrow, 15 minutes, Home"
- "Show my review-later notes"

**Sign Claude out everywhere:** change `TOKEN_SECRET` and deploy again.

---

## 🧪 Tests

```bash
node --test tests/*.test.js worker/test/*.test.js
```

These also run on GitHub for every push (Actions → Tests).
