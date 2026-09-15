# Contract Renewal Tracker

Tracks contracts (MA/license renewals, procurement lifecycle) and flags
upcoming/overdue renewals. React frontend, Node.js/Express backend,
**PostgreSQL** storage. Seeded on first run from
`backend/data/Contract_Tracking_Mock.csv` (replace with real data any time -
seeding only happens if the table is empty).

Alert thresholds: **Overdue** (past end date), **Critical** (≤30 days),
**Warning** (≤90 days), **OK** (>90 days). Adjustable in `backend/alerts.js`.

---

## Run with Docker (Windows)

**Prerequisites:** [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/),
with the WSL2 backend enabled (default on a modern install).

1. Unzip this project anywhere, e.g. `C:\Users\<you>\contract-tracker`.
2. Open **PowerShell** in that folder.
3. **Check port 5432 is free first** - if you have another Postgres
   container running (e.g. from a different project), it will already be
   using that port and this stack will fail to start. Either stop the other
   container, or change the left-hand side of `postgres:`'s port mapping in
   `docker-compose.yml` (e.g. `"5433:5432"` - only affects host access, the
   backend still talks to it on 5432 internally since that's a separate
   Docker network).
4. Build and start everything:
   ```powershell
   docker compose up --build
   ```
   First run downloads images and installs dependencies - a couple of
   minutes. The backend waits for Postgres to report healthy before it
   starts, then creates its tables and seeds the mock CSV automatically.
5. Open the app: **http://localhost:5173**
   API alone: **http://localhost:4000/api/contracts**
   Postgres itself (e.g. via a DB client like DBeaver/pgAdmin): `localhost:5432`,
   user `postgres`, password `postgres`, database `contract_tracker`.
6. Stop with `Ctrl+C`, or `docker compose down` from another terminal.
   Data persists in the `contract-tracker-pgdata` volume between restarts -
   `docker compose down -v` wipes it for a clean slate.

**If port 5173 or 4000 is already used**, same fix: edit the left-hand side
of the relevant `ports:` mapping and re-run `docker compose up --build`.

**Common Windows gotchas:**
- "Docker Desktop is not running" → start it from the Start menu and wait
  for the whale icon in the system tray to stop animating.
- A container stuck `Restarting` → check `docker compose logs <service> --tail 80`
  before guessing at fixes.
- Antivirus/firewall prompts on first `docker compose up` are normal.

---

## Run locally without Docker

Requires Node.js 18+ and a running PostgreSQL instance.

```powershell
# create the database once
psql -U postgres -c "CREATE DATABASE contract_tracker;"

# Terminal 1 - backend
cd backend
npm install
# set PGHOST/PGUSER/PGPASSWORD/PGDATABASE env vars to match your Postgres,
# or copy .env.example to .env if you're using something like dotenv
npm start          # http://localhost:4000

# Terminal 2 - frontend
cd frontend
npm install
npm run dev         # http://localhost:5173
```

The backend reads `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
from the environment (defaults: `localhost`, `5432`, `postgres`, `postgres`,
`contract_tracker`). The frontend reads its API URL from `VITE_API_BASE`
(`frontend/.env`, copy from `.env.example`).

---

## LINE renewal notifications (optional)

The backend can push a daily digest of Critical/Overdue contracts to LINE
via the LINE Messaging API. It's a no-op until configured:

1. Create a LINE Official Account / Messaging API channel, get a
   **Channel access token**, and the **user/group/room ID** to push to.
2. Set `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_TARGET_ID` - in
   `docker-compose.yml`'s backend `environment:` block, or as OS environment
   variables if running without Docker.
3. It runs automatically at 08:00 server time, or trigger it manually:
   `POST http://localhost:4000/api/notify/run-now`.

## Project structure

```
contract-tracker/
├── docker-compose.yml     postgres + backend + frontend
├── backend/               Express API + PostgreSQL (pg)
│   ├── server.js            routes
│   ├── db.js                schema + CSV seeding (Thai-date aware)
│   ├── alerts.js             renewal alert-level logic
│   ├── notifyLine.js         optional LINE push
│   └── data/                  seed CSV lives here
└── frontend/              React (Vite)
    └── src/
        ├── App.jsx
        ├── api.js
        └── components/        SummaryCards, FilterBar, ContractTable, ContractForm
```
