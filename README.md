# Spring API + React Catalog

This frontend consumes the Spring Boot backend from the `java-ecommerce` folder and renders live products in React.

## What is integrated

1. React Query data fetching from `/api/products/cursor`.
2. Category filter + keyword search in the React UI.
3. Typed API client in `src/api/productsApi.ts`.
4. Cursor-based server-side pagination and filtering (`search`, `categoryId`, `cursor`, `limit`).
5. Stable snapshot token support (`snapshot`) so cursor traversal stays deterministic during heavy writes.
6. Snapshot token expiry/version validation for stricter production semantics.
7. Sortable server-side columns (`sortBy=NEWEST|PRICE|NAME`, `sortDirection=ASC|DESC`).
8. Cached count endpoint (`/api/products/counts`) for fast total/active/inactive badge rendering.
9. Product create/update/delete from React using login-issued bearer tokens.
10. Optimistic CRUD updates for instant UX while mutation requests run.
11. Image URL support with preview in the form and product cards.
12. Vite dev proxy from `/api/*` to Spring Boot (default is `http://localhost:8080` in development).
13. Runtime header badge showing active frontend API target (port 8080 vs 8081), click to copy full target URL.

## Run the backend

From `java-ecommerce`:

```powershell
./gradlew bootRun
```

Isolated backend mode for `bun run dev:8081`:

```powershell
./scripts/start-backend-8081.ps1
```

Equivalent direct command:

```powershell
./gradlew bootRun --args="--server.port=8081 --spring.profiles.active=dev-fast"
```

Backend API URL:

```text
http://localhost:8080/api/products/cursor?limit=8&sortBy=NEWEST&sortDirection=DESC
```

Example filtered request:

```text
http://localhost:8080/api/products/cursor?search=keyboard&categoryId=1001&limit=8&sortBy=PRICE&sortDirection=ASC
```

Cursor page response includes:

- `nextCursor`: token for the next page.
- `snapshotToken`: pass this back as `snapshot` on next requests to keep a stable dataset window.
- `snapshotVersion`, `snapshotIssuedAtEpochMs`, `snapshotExpiresAtEpochMs`, `snapshotActive`.

Frontend auto-recovery behavior:

- If the backend returns `400` with a snapshot-expired error, React automatically resets to live page 1.
- A toast is shown: `Snapshot expired, switched back to live results.`
- If the backend returns `400` with a snapshot-version-mismatch error, React also resets to live page 1.
- A toast is shown: `Snapshot version changed, switched back to live results.`

Snapshot configuration defaults (backend):

- `app.pagination.snapshot.version=v1`
- `app.pagination.snapshot.ttl-seconds=300`

When a snapshot token expires or its version mismatches, the API returns `400` so the UI can restart from live page 1.

Count badges endpoint:

```text
http://localhost:8080/api/products/counts?search=keyboard&categoryId=1001
```

## Run the frontend

From `spring-api-ecommerce`:

```powershell
bun install
bun run dev
```

`bun run dev` uses the default development proxy target from `.env.development`:

```text
http://localhost:8080
```

Use explicit profile scripts when you want to switch backend targets quickly:

```powershell
bun run dev:8080
bun run dev:8081
```

When running `bun run dev:8081`, make sure backend is started on port `8081` using one of the commands above.

If you prefer pnpm:

```powershell
pnpm install
pnpm dev
```

Frontend URL:

```text
http://localhost:5173
```

## One-command local smoke launcher

From the workspace root (`JAVA`), run:

```powershell
./java-ecommerce/scripts/run-e2e-smoke-stack.ps1
```

What it does automatically:

1. Starts Spring Boot backend on `http://localhost:8081`
2. Starts Vite frontend on `http://localhost:5173`
3. Runs the auth + product CRUD smoke flow through the frontend proxy
4. Shuts down both backend and frontend processes

Optional useful flags:

1. `-SkipFrontendInstall` (skip `npm ci` check path if `node_modules` already exists)
2. `-BackendPort <port>` and `-FrontendPort <port>`
3. `-StartupTimeoutSeconds <seconds>`
4. `-AdminCredential <PSCredential>`

## End-to-end smoke flow (auth + product CRUD)

With backend and frontend running together, execute the reusable smoke script from `java-ecommerce`:

```powershell
../java-ecommerce/scripts/smoke-react-spring-flow.ps1 -FrontendBaseUrl http://localhost:5173
```

What this validates through the frontend proxy:

1. Login (`POST /api/auth/login`)
2. Product listing (`GET /api/products/cursor`)
3. Product create (`POST /api/products`)
4. Product update (`PUT /api/products/{id}`)
5. Product delete (`DELETE /api/products/{id}`)

Credentials are resolved in this order:

1. Script parameter `-AdminCredential`
2. Environment variables `APP_SECURITY_ADMIN_USERNAME` and `APP_SECURITY_ADMIN_PASSWORD`

If neither source is available, the script fails fast with a clear setup message.

## CI smoke job

The repository now includes a push-triggered GitHub Actions workflow:

1. Workflow file: `.github/workflows/e2e-smoke.yml`
2. Trigger: every push (plus manual `workflow_dispatch`)
3. Behavior: installs dependencies, runs the same integrated launcher script, and fails the pipeline if smoke checks fail

## Local data behavior (dev-fast profile)

The backend now auto-seeds demo categories/products in `dev-fast` when catalog tables are empty.
The feature is controlled by:

```text
app.seed.dev-fast.enabled=true
```

## Optional environment variables

`VITE_BACKEND_URL`

- Used by Vite proxy in development.
- Default for `bun run dev`: `http://localhost:8080` (from `.env.development`).
- Override with profile scripts:
	- `bun run dev:8080` -> `.env.backend8080`
	- `bun run dev:8081` -> `.env.backend8081`

`VITE_API_BASE_URL`

- Optional direct API base URL for the fetch client.
- Leave empty in local development to use Vite proxy.

## Why this pattern is portfolio-ready

1. Uses a dedicated API module (separation of concerns).
2. Uses React Query for caching, retries, and refresh behavior.
3. Implements practical CRUD workflows with auth-protected write operations.
4. Uses optimistic updates so UI feels instant before refetch.
5. Uses cursor pagination for scalable listing APIs.
6. Uses snapshot tokens for deterministic pagination windows under write load.
7. Adds sortable server-driven ordering by newest, price, and name.
8. Adds cached aggregate counts for fast UX badges.
9. Adds a frontend indicator when the user is in a frozen snapshot window.
10. Adds product discovery UX via server-side search and category filter.
11. Supports richer catalog visuals with image URL previews.
12. Keeps frontend code strongly typed end-to-end.
13. Avoids CORS issues in development via proxy.
