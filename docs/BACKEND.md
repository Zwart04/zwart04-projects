# Backend and deployment

The eleven public applications share one private Cloudflare Worker through service bindings. Production uses a separate D1 database from integration tests. No business data is seeded.

## Deploy

1. Install Node.js 24 and `npm ci`.
2. Configure your Cloudflare account/database IDs in `platform/wrangler.jsonc`.
3. Apply `platform/schema.sql` to your empty D1 database: `npx wrangler d1 execute DB --remote --config platform/wrangler.jsonc --file platform/schema.sql`.
4. Deploy `npx wrangler deploy --config platform/wrangler.jsonc`.
5. Create a cryptographically random secret using your secret manager. Set it with `npx wrangler secret put PEPPER --config platform/wrangler.jsonc`. Do not change it casually: passwords and encrypted letters depend on it. Never commit this secret.
6. Deploy each canonical product's frontend after configuring its account, domain and BACKEND binding.

For schema updates, use explicit reviewed ALTER migrations. Do not overwrite live user data with a snapshot or reinitialize production. Use Cloudflare D1 Time Travel for database recovery and export actual workspace records from Settings.

## Security model

Passwords: salted PBKDF2-SHA256 plus a private server pepper; cookie sessions: random tokens, hashed in D1, HttpOnly/Secure/SameSite=Lax; mutations: origin and CSRF checks; roles: owner/editor/viewer. Recovery requires the user's recovery code, rotates the code and revokes existing sessions. No unconfigured email reset is advertised.

Record edits use version checks. Scheduling and inventory actions use D1 atomic batches. Deleted records use recoverable soft delete. AI has global and account quotas and never substitutes a simulated response on failure. Sensor ingestion requires a workspace API key and validates references. Public forms accept typed responses and enforce rate limits.

## Free provider boundaries

Cloudflare Workers/D1/Workers AI free allocations are finite; quota errors remain visible. No paid plan is activated. Public exchange rates use Frankfurter/ECB; crypto prices use Coinbase. Those APIs may be unavailable or delayed. Media bytes remain in the importing browser/account, with metadata in D1. Browser codec and speech voice availability vary by device.

## Verification

`npm test` runs backend/auth/workflow tests with a real in-memory SQLite schema and pure conversion/audio tests. VERIFICATION.json records actual Cloudflare D1 and provider checks in an isolated database; no test fixtures were placed in production. Browser QA covers responsive layout and native user flows separately.
