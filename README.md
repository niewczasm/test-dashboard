# Test Failures Dashboard

A dashboard that aggregates failing tests from selected Jenkins jobs:
statistics on what breaks most often, logs/stack traces from specific
builds, manual JIRA ticket assignment, and tagging of tests.

## Stack

- Next.js (App Router) + TypeScript
- SQLite via Node's built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html)
  module — no ORM, no native binary to download, nothing beyond Node itself.
  The schema (plain `CREATE TABLE IF NOT EXISTS` statements) is applied
  automatically the first time the app touches the database, so there's no
  separate migration step to run.
- `node-cron` for periodic synchronization with the Jenkins REST API

> **Why no Prisma/ORM?** Prisma needs to download a native query-engine
> binary from its own CDN on `install`/`generate`, which many corporate
> networks block. `node:sqlite` ships inside the Node.js binary itself —
> nothing to fetch, nothing that can be blocked by a proxy.

## Local setup (without Docker)

> Requires **Node.js 22.5+** — that's the version `node:sqlite` shipped in.
> `docker compose`/`Dockerfile` already pin a Node 22 image, so this only
> matters for running the app directly on your machine. `npm run dev` /
> `build` / `start` check this automatically and fail with a clear message
> if your Node is too old — if you instead see
> `Failed to load external module node:sqlite: Error [ERR_UNKNOWN_BUILTIN_MODULE]`,
> that's this: run `node -v` and upgrade if it's below 22.5 (common on
> Windows machines still on an older LTS like 18 or 20).

1. Install dependencies:

   ```bash
   npm ci
   ```

   Use `npm ci` day-to-day (including after every `git pull`), not
   `npm install` — `npm ci` installs exactly what's pinned in
   `package-lock.json` and never rewrites it. Plain `npm install` can pick up
   newer versions for any dependency pinned with `^` and silently rewrite the
   lockfile, which is what makes `git pull` painful (local lockfile changes
   colliding with incoming ones). Only use `npm install <pkg>` when you
   actually mean to add or bump a dependency — that's a deliberate,
   committed lockfile change, not drift.

2. Fill in `.env`:

   ```
   JENKINS_URL="https://jenkins.yourcompany.com"
   JENKINS_USER="your-username"
   JENKINS_API_TOKEN="jenkins-api-token"
   SYNC_INTERVAL_MINUTES="15"

   JIRA_URL="https://jira.yourcompany.com"
   JIRA_USER=""
   JIRA_API_TOKEN=""
   ```

   Generate the API token in Jenkins: user profile → *Configure* →
   *API Token* → *Add new Token*.

   `JIRA_URL` is optional but recommended: once set, a ticket key you attach
   to a test (e.g. `PROJ-123`) auto-links to `{JIRA_URL}/browse/PROJ-123`
   without having to paste the URL yourself, and its status gets refreshed
   on the same schedule as the Jenkins sync. `JIRA_USER`/`JIRA_API_TOKEN`
   are only needed if your JIRA requires auth to read issues — leave them
   blank for anonymous/public read access.

   **If `package-lock.json` (or other files) keep showing as locally
   modified right after a fresh `git pull`/clone** on Windows, it's almost
   always CRLF line endings — `.gitattributes` in this repo forces LF, but
   only for files checked out *after* it's present. One-time fix on an
   existing checkout:

   ```bash
   git add --renormalize .
   git status   # should now be clean; commit if it shows anything
   ```

3. Run the app — the SQLite database and its schema are created
   automatically on first run at the path in `DATABASE_URL` (default
   `./data/dev.db`):

   ```bash
   npm run dev     # development mode
   # or
   npm run build && npm start   # production
   ```

### Auto-rebuild on git pull (non-Docker deployments)

If you're running the app directly with `npm run build && npm start` (this
matters most on Windows, where there's no Docker/systemd to lean on), you
can make `git pull` automatically rebuild and restart the service instead of
doing it by hand every time:

1. Install [pm2](https://pm2.keymetrics.io/) globally — it's a pure-npm
   process manager (no external binary download, unlike e.g. NSSM), which
   matters if your network blocks fetching third-party executables:

   ```bash
   npm install -g pm2
   ```

2. Start the app under pm2 once, using the `ecosystem.config.js` in this
   repo, then save the process list so pm2 remembers it:

   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   ```

   (Optional, for surviving a reboot: `npm install -g pm2-windows-startup`
   then `pm2-windows-startup install`.)

3. Point git at this repo's versioned hooks directory (one-time, per clone):

   ```bash
   git config core.hooksPath scripts/git-hooks
   ```

From then on, every `git pull` you run triggers
`scripts/git-hooks/post-merge`: it runs `npm ci` if `package-lock.json`
changed, rebuilds, and restarts the `test-failures-dashboard` pm2 process —
all through Git for Windows' bundled shell, so no PowerShell execution
policy to fight with. If the build fails, the hook stops before restarting,
so a broken pull never takes down the currently running instance — but note
that `git pull` itself will still report success either way (git doesn't
fail the pull based on a hook's exit status), so watch the hook's own output
in your terminal to see whether the rebuild actually succeeded.

Useful pm2 commands afterward: `pm2 logs test-failures-dashboard`,
`pm2 restart test-failures-dashboard`, `pm2 stop test-failures-dashboard`.

## Docker

The repo includes a multi-stage `Dockerfile` that builds the app and starts
the Next.js server on port `3000` — the database schema is created
automatically on first run, no separate migration step needed. The SQLite
database lives at `/app/data/prod.db` inside the container — mount that
directory as a volume so data survives rebuilds/restarts.

Build and run standalone:

```bash
docker build -t test-failures-dashboard .
docker run -d \
  --name test-failures-dashboard \
  -p 3000:3000 \
  -e JENKINS_URL="https://jenkins.yourcompany.com" \
  -e JENKINS_USER="your-username" \
  -e JENKINS_API_TOKEN="jenkins-api-token" \
  -e SYNC_INTERVAL_MINUTES="15" \
  -v dashboard-data:/app/data \
  test-failures-dashboard
```

### docker-compose

A ready-to-use `docker-compose.yml` is included at the repo root:

```yaml
services:
  test-dashboard:
    build: .
    ports:
      - "3000:3000"
    environment:
      JENKINS_URL: "https://jenkins.yourcompany.com"
      JENKINS_USER: "your-jenkins-username"
      JENKINS_API_TOKEN: "your-jenkins-api-token"
      SYNC_INTERVAL_MINUTES: "15"
    volumes:
      - dashboard-data:/app/data
    restart: unless-stopped

volumes:
  dashboard-data:
```

Run it with:

```bash
docker compose up -d --build
```

The app will be available at `http://localhost:3000`.

**Plugging it into an existing `docker-compose.yml`:** copy the
`test-dashboard` service block (and its `dashboard-data` volume entry)
into your own compose file. If you already have a `volumes:` top-level
section, just add `dashboard-data:` to it instead of duplicating the
block. Points worth adjusting:

- Replace the `environment:` values with your real Jenkins URL/credentials,
  or reference an `.env` file / Docker secret instead of inlining them.
- Change the host-side port in `ports:` (`"8080:3000"`, etc.) if `3000` is
  already taken by another service on the host.
- If you're running this behind a reverse proxy (Traefik, nginx) that's
  already defined in your compose file, drop the `ports:` mapping and
  instead attach the service to the proxy's network plus the relevant
  labels, exposing container port `3000`.
- The container has no built-in HTTPS — terminate TLS at your reverse
  proxy/load balancer in front of it.

### Native Windows containers

`Dockerfile` + `docker-compose.yml` above build a **Linux** container image.
That already runs fine under Docker Desktop on Windows in its default mode
(Linux containers via WSL2) — no changes needed for that case.

If your hosts instead run **native Windows containers** (Docker switched to
"Windows containers" mode, no Linux/WSL2 involved), use `Dockerfile.windows`
and `docker-compose.windows.yml` instead:

```powershell
docker compose -f docker-compose.windows.yml up -d --build
```

Two things that are specific to Windows containers and worth knowing before
you rely on this:

- **Host/image OS build must match.** `Dockerfile.windows` targets
  `nanoserver-ltsc2022` (Windows Server 2022). If your hosts run a different
  Windows Server build, the image won't start unless you either retag every
  `nanoserver-ltsc2022` reference to match, or run with
  `docker run --isolation=hyperv` (Hyper-V isolation tolerates a mismatch;
  process isolation, the default, does not).
- **Not verified end-to-end here** — this repo was built and Docker-tested
  in a Linux sandbox, which cannot build or run Windows containers at all
  (it's a different container runtime, not just a config flag). The
  Windows Dockerfile follows Microsoft's/Node's documented patterns for
  `node:*-nanoserver-*` images, but test it on an actual Windows container
  host before depending on it.

Everything else — the app code, the `node:sqlite` database, the sync logic —
is unmodified; only the OS layer and a couple of Windows-specific Dockerfile
mechanics differ (see the comments in `Dockerfile.windows`).

## How it works

1. On the **Jobs** tab, add the jobs you want to track by providing a
   display name and the job's path in Jenkins (for nested folders, e.g.
   `team/subfolder/job-name`).
2. Every `SYNC_INTERVAL_MINUTES` minutes (or on demand via the
   *"Sync now"* button), the app pulls the list of recent builds for each
   job and their `testReport` from Jenkins, extracting failing/regressed
   test cases along with the error message and stack trace.
3. The **Dashboard** shows statistics for the selected time window: total
   number of failures, number of unique failing tests, daily trend,
   breakdown by job, and a ranking of the most frequently failing tests.
4. On a test's detail page you can see the full failure history (with a
   link to the build in Jenkins, the error message, and the stack trace),
   and you can:
   - assign a JIRA ticket (key, link, note) — the link is filled in
     automatically from `JIRA_URL` if you leave it blank,
   - add/remove any tags (managed globally on the **Tags** tab).
5. If `JIRA_URL` is set, each ticket's status is checked on the same
   schedule as the Jenkins sync (or on demand via the *"refresh"* link next
   to it). A ⚠️ shows up — on the test's detail page and in the dashboard's
   failing-tests table — whenever a ticket's JIRA status is in the "done"
   category (Done/Closed/Resolved, whatever your workflow calls it) but the
   test is still showing up as failing: the classic "we thought we fixed
   this" case.

Tests are identified by the pair `(className, testName)` within a given
job, so a tag or ticket assigned once stays attached to the test
regardless of how many subsequent builds it keeps failing in.
