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
9. Product create/update/delete from React using Spring Basic Auth.
10. Optimistic CRUD updates for instant UX while mutation requests run.
11. Image URL support with preview in the form and product cards.
12. Vite dev proxy from `/api/*` to Spring Boot (`http://localhost:8080` by default).

## Run the backend

From `java-ecommerce`:

```powershell
./gradlew bootRun
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

If you prefer pnpm:

```powershell
pnpm install
pnpm dev
```

Frontend URL:

```text
http://localhost:5173
```

## Seed local dev data (dev-fast profile)

The default backend profile uses H2 with Flyway disabled, so the product list may start empty.

Use this PowerShell script to create a category and two products via secured Spring endpoints:

```powershell
$pair = "admin:admin123"
$token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$headers = @{ Authorization = "Basic $token" }

$category = Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/categories" -Headers $headers -ContentType "application/json" -Body '{"name":"Electronics","description":"Portfolio demo category"}'

Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/products" -Headers $headers -ContentType "application/json" -Body (@{
	name = "Mechanical Keyboard Pro"
	description = "Hot-swappable keyboard for developers"
	imageUrl = "https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?auto=format&fit=crop&w=1200&q=80"
	price = 129.00
	stockQuantity = 120
	categoryId = $category.id
	active = $true
} | ConvertTo-Json)

Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/products" -Headers $headers -ContentType "application/json" -Body (@{
	name = "UltraWide 34 Monitor"
	description = "3440x1440 monitor for productivity"
	imageUrl = "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=1200&q=80"
	price = 649.00
	stockQuantity = 35
	categoryId = $category.id
	active = $true
} | ConvertTo-Json)
```

## Optional environment variables

`VITE_BACKEND_URL`

- Used by Vite proxy in development.
- Default: `http://localhost:8080`

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
