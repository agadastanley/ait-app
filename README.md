# AiT — Telegram Mining Mini App

A tap-to-earn Telegram Mini App themed as an AI compute ecosystem: tapping "runs inference"
to earn AiT, energy is "GPU Power," upgrades are "Model Upgrades," and so on.

```
ait-app/
├── backend/     Node.js/Express API + Telegram bot (deploy to Render)
├── frontend/    User-facing Mini App — plain HTML/JS (deploy to Vercel)
├── admin/       Admin dashboard — plain HTML/JS (deploy to Vercel, separate project)
└── README.md    You are here
```

## 1. Prerequisites (all free)

- A Telegram account + [@BotFather](https://t.me/BotFather) to create your bot
- A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) account (free M0 cluster)
- A [Render](https://render.com) account (free web service)
- A [Vercel](https://vercel.com) account (free static hosting) — you'll create **two** projects, one for `frontend/` and one for `admin/`

## 2. Create the Telegram bot

1. Message @BotFather → `/newbot` → follow prompts → save the **bot token**.
2. `/setmenubutton` is handled automatically by the backend on startup (see `bot.js`), so you don't need to do this manually — just make sure `MINI_APP_URL` is set correctly (step 4).
3. Note your bot's **username** (e.g. `AiTMiningBot`) — needed for referral links.
4. **Add your bot as an admin of your Telegram channel** (Channel → Administrators → Add Admin → search your bot). Member-level admin access is enough — no special permissions needed. This is required for the "Join Telegram Channel" mission's real verification (`getChatMember`); without it, that mission's claim step will always fail.
5. Note your channel's `@username` (or its numeric chat ID if it's private) — this becomes `TELEGRAM_CHANNEL_ID`.

## 3. Set up MongoDB Atlas

1. Create a free M0 cluster.
2. Database Access → add a database user (username/password).
3. Network Access → allow access from anywhere (`0.0.0.0/0`) — Render's free tier IPs aren't static.
4. Get your connection string from Connect → Drivers → copy the `mongodb+srv://...` URI.

## 4. Deploy the backend to Render

1. Push this repo to GitHub.
2. Render → New → Web Service → connect the repo → set **root directory** to `backend`.
3. Build command: `npm install`  ·  Start command: `npm start`
4. Add environment variables (copy from `backend/.env.example`):
   - `MONGODB_URI` — from step 3
   - `TELEGRAM_BOT_TOKEN` — from step 2
   - `TELEGRAM_BOT_USERNAME` — your bot's username (no `@`)
   - `TELEGRAM_CHANNEL_ID` — your channel's `@username` (from step 2.5) — required for real "Join Channel" mission verification
   - `MINI_APP_URL` — your Vercel frontend URL (set this after step 5, then redeploy)
   - `JWT_SECRET`, `ADMIN_JWT_SECRET` — any long random strings
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD` — your admin login
   - `ALLOWED_ORIGINS` — your frontend + admin Vercel URLs, comma-separated
5. Deploy. Render's free tier spins down after inactivity — the first request after idle will be slow (~30-60s); this is a known free-tier tradeoff.
6. (Optional) Run `node src/seed.js` once via Render's shell tab to create starter missions — or just add them from the admin dashboard.

## 5. Deploy the frontend (Mini App) to Vercel

1. Vercel → New Project → import the repo → set **root directory** to `frontend`.
2. Framework preset: **Other** (it's static HTML/JS, no build step needed).
3. Before/after deploying, edit `frontend/app.js` line 2: set `API_BASE` to your Render backend URL + `/api`, e.g. `https://ait-backend.onrender.com/api`.
4. Deploy. Copy the resulting Vercel URL — this is your `MINI_APP_URL` (go back to Render step 4 and set it).

## 6. Deploy the admin dashboard to Vercel

1. Vercel → New Project → import the same repo → set **root directory** to `admin`.
2. Same static setup as above.
3. Edit `admin/admin.js` line 1: set `API_BASE` to your Render backend URL + `/api/admin`.
4. Deploy. **Do not link this URL anywhere in the user-facing bot or app** — access is by URL + password only.
5. Add this URL to Render's `ALLOWED_ORIGINS`.

## 7. Verify everything works

- Open your bot in Telegram → tap the menu button → the Mini App should load and show your balance.
- Tap the core a few times → balance should go up, energy down.
- Open the admin URL → log in with `ADMIN_USERNAME`/`ADMIN_PASSWORD` → you should see your test user under the Users tab.
- Add a mission from the admin dashboard → it should immediately appear in the Mini App's Tasks tab (no redeploy needed — this is the point of storing missions in the DB).

## 8. Confirming data survives redeploys

Since every write (taps, upgrades, missions, referrals, admin edits) goes straight to MongoDB Atlas rather than
local disk, a redeploy on Render or Vercel does not touch user data at all — the app simply reconnects to the
same Atlas cluster on startup and reloads existing state. To confirm: earn some AiT, trigger a redeploy on
Render (e.g. push an empty commit), reopen the Mini App — your balance should be unchanged.

## 9. What this doesn't include

Per the original spec, this covers the app/game layer only: no blockchain token issuance, no exchange listings,
and no token-launch legal/regulatory work. Mission "verification" for join-channel/follow-X/invite-friends types
trusts the client's claim of completion (standard for this genre at zero budget) — full verification would
require Telegram Bot API channel-membership checks and X's API, which has no meaningful free tier as of this
writing.

## 10. Suggested next steps

- Swap Telegram bot polling for a webhook once you have a stable Render URL (see comment in `backend/src/bot/bot.js`).
- Add real membership verification for the "Join Telegram Channel" mission using `bot.getChatMember()`.
- Consider Upstash Redis (also free-tier) if you need faster leaderboard reads at scale — Mongo aggregation is fine for an MVP.
