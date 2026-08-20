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
> matters for running the app directly on your machine.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Fill in `.env`:

   ```
   JENKINS_URL="https://jenkins.yourcompany.com"
   JENKINS_USER="your-username"
   JENKINS_API_TOKEN="jenkins-api-token"
   SYNC_INTERVAL_MINUTES="15"
   ```

   Generate the API token in Jenkins: user profile → *Configure* →
   *API Token* → *Add new Token*.

3. Run the app — the SQLite database and its schema are created
   automatically on first run at the path in `DATABASE_URL` (default
   `./data/dev.db`):

   ```bash
   npm run dev     # development mode
   # or
   npm run build && npm start   # production
   ```

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
   - assign a JIRA ticket (key, link, note),
   - add/remove any tags (managed globally on the **Tags** tab).

Tests are identified by the pair `(className, testName)` within a given
job, so a tag or ticket assigned once stays attached to the test
regardless of how many subsequent builds it keeps failing in.
