- Platform & Dependencies
  - Drop `src/types/async-disposable.d.ts` once the TS config enables the built-in `esnext.disposable` lib so the shim is redundant.
  - Add a lightweight SRV/DNS helper to docker compose to simplify SRV/TLS reproduction flows.

- Runtime & API Quality
  - Align session TTL math with express-session: prefer `cookie.maxAge`, then `cookie.expires`, then `ttl` in both `set()` and `touch()` so rolling sessions retain their intended lifetime.
  - Avoid closing user-supplied MongoClient instances in `close()`; only shut down clients created by the store and always clear timers.

- Tooling & CI
  - Rework integration helpers: replace the broken `check-cli`/`diff-integration-tests`, document a safe reset workflow, and migrate `test:integration` to mongodb-memory-server.
  - CI matrix should cover MongoDB driver ranges via temp `yarn add --no-lockfile --dev mongodb@x`, exercise MongoDB 7.x containers with health checks, and always run `docker compose down` in a finally step.
  - Expand coverage for crypto, autoRemove, touchAfter, and transformId using mongodb-memory-server; continue the started live-Mongo upgrade compat test (5.1.0 ➜ current) exposed as `yarn test:compat`.
  - Automate releases with standard-version + GitHub Actions to build, test, publish, upload coverage, and tag.

- Docs & Community
  - Refresh README badges/compatibility matrix to match supported Node 20/22/24, MongoDB server 4.4–8.0, driver >=5<8, and express support; link to CI results.
  - Add a v5/v6 migration guide (TTL math, client ownership, ESM/dual builds) and update the example app to mirror current APIs and tooling.
  - Keep the changelog current and document the automated release flow once it exists.
  - Replace boilerplate community files with real CONTRIBUTING guidelines, modern issue/feature templates, and a SECURITY.md; ensure the stale bot behavior is contributor-friendly.

Next steps: focus on the runtime fixes (TTL math, client ownership), then shore up CI/coverage with mongodb-memory-server-based flows, and finally tighten docs/release automation.
