- Platform & Dependencies
  - Bring the published compatibility story in sync with reality: engines.node must track the active LTS baseline, MongoDB is capped to <7, and the README claims MongoDB server 3.6+ (EOL for years) while also saying “mongodb is not a peer dependency” even though it now is (package.json:56-63, README.md:45-55). Bump the
    engine floor so the metadata and docs explicitly cover the currently maintained Node releases (20, 22, 24), extend the peer range to cover MongoDB driver >=5 and <8 plus server 4.4-8.0 (and add corresponding tests), and fix the user-facing docs/badges so consumers aren't misled.
    - [done 2025-11-15] Refine compatibility statements + CI matrix for Node 18/20/22/24, MongoDB server 4.4-8.0, driver >=5<8 (agent: Codex)
    - [done 2025-11-16] Drop Node 18 baseline and require Node >=20.8.0 so Ava/@ava/typescript latest releases remain supported (agent: Codex)
    - TODO(agent): drop src/types/async-disposable.d.ts once tsconfig enables the built-in esnext.disposable lib and the shim is redundant.
  - Refresh the tooling stack: virtually every dev dependency is from 2020 (TypeScript 4.0, Ava 3, ESLint 7, Husky 4, Prettier 2, commitlint 11, etc.), which misses hundreds of bug fixes and no longer understands Node 20/22 typings (package.json:67-107). Plan an across-the-board upgrade (TS ≥5.6, Ava 6, ESLint 9,
    Prettier 3, Husky 9/Lint‑Staged 15, latest @types/*) and run yarn dedupe afterwards.
    - [done 2025-11-15] Upgrade TS/AVA/ESLint/prettier/husky stacks while keeping Node 18 compatibility (agent: Codex)
    - TODO(agent): migrate from .eslintrc.yml to an eslint.config.js flat config so ESLINT_USE_FLAT_CONFIG shim can be removed.
  - Examples and fixtures lag far behind: the sample app still consumes connect-mongo@^4.4.0, forces MongoDB 3.6 via Yarn resolutions, and docker-compose.yaml spins up Mongo 4.4 (example/package.json:12-23, docker-compose.yaml:1-11). Update those to your current major, exercise Mongo server 7+, and document SRV/TLS
    flows so contributors can reproduce issues without pinning to obsolete builds.
    - [done 2025-11-16] Refresh example deps/fixtures, add TLS profile + docs for SRV/TLS workflows (agent: Codex)
    - TODO(agent): add a local SRV/DNS helper once we can run a lightweight resolver inside docker compose.
  - Modernize packaging: you only emit CommonJS (main + typings) yet advertise a non-existent build/module artifact and lack an exports map or dual entry points (package.json:5-8, 28-33, 109-118). Add a build:module/Rollup step (or at least exports: { ".": { "require": "./build/main/index.js", "import": "./build/main/
    index.mjs", "types": "./build/main/index.d.ts" } }) and fix the repository/bugs URLs which still point at jdesboeufs (package.json:20-26).

- Runtime & API Quality
  - store.clear() issues collection.drop(), which wipes the TTL index required for autoRemove: 'native' and throws NamespaceNotFound for empty stores (src/lib/MongoStore.ts:530-535). Switch to deleteMany({}) (keeping indexes) and swallow the namespace error so clear() is idempotent.
  - Decryption failures call the callback twice because the rejection handler just invokes callback(err) and then execution continues to the success path (src/lib/MongoStore.ts:314-326). Re-throw inside the catch or guard against multiple invocations to avoid “callback was already called” regressions.
  - Session TTL math ignores cookie.maxAge; it only respects cookie.expires or a global default in both set() and touch(), so rolling sessions expire too early (src/lib/MongoStore.ts:355-368, 435-439). Mirror express-session's logic: prefer maxAge, fall back to expires, then to ttl.
  - close() always shuts down the underlying MongoClient, even if the user supplied their own client/promise, which can tear down the rest of the app's DB connections (src/lib/MongoStore.ts:188-210, 541-543). Track whether the store created the client and only close in that case; otherwise just clear timers.
  - Interval-based cleanup leaks and relies on deprecated write concern: the timer created in setAutoRemove() is never cleared on shutdown and writes with w:0/j:false, which newer clusters reject (src/lib/MongoStore.ts:217-247). Store the handle, clearInterval it in close(), and use the configured write concern or
    default majority-safe options.
  - Type safety is paper-thin: option hooks (serialize, transformId, crypto) stay typed as any and defaultSerializeFunction is littered with @ts-ignore (src/lib/MongoStore.ts:61-124). Once you enable the stricter compiler flags below, refactor this class into generics (MongoStore<T extends SessionData>) so public
    types match reality.
    - [done 2025-11-16] Improve type safety with generics/typed hooks (agent: Codex)

- Tooling & CI
  - Tighten the compiler and target modern runtimes: tsconfig.json still emits ES2018/CommonJS, disables strictFunctionTypes, noImplicitAny, and noUnused*, and forces inline source maps that bloat npm tarballs (tsconfig.json:2-44). Move to target: es2022, enable the strict diagnostics, emit external .map files, and
    adopt moduleResolution: node16 so future ESM builds behave.
    - [done 2025-11-16] Tighten the compiler and target modern runtimes (agent: Codex)
  - Several npm scripts are broken or dangerous. check-cli/diff-integration-tests copy a top-level test folder that no longer exists, so they fail immediately, and reset-hard runs git clean -dfx && git reset --hard, which can nuke a contributor's worktree (package.json:38-55). Replace these with working integration-
    test helpers (perhaps building to build/test) and document a safer reset flow.
    - [todo] Rework integration scripts and provide a safe reset flow; earlier attempt was reset (agent: Codex)
    - TODO(agent): test:integration currently depends on host MongoDB (docker compose); migrate to mongodb-memory-server to make the helper self-contained.
  - CI mutates the repo (yarn add mongodb@6 && yarn test) and relies on docker compose up -d without health checks or teardown, all while testing only Mongo 4.4 ( .github/workflows/sanity.yml:15-32, docker-compose.yaml:1-11). Introduce a job matrix that pins Mongo driver versions via yarn add --no-lockfile --dev
    mongodb@x in a temporary workspace, waits for Mongo 7.x containers to report ready, and always runs docker compose down in a finally step.
  - Critical behaviors lack automated coverage: the unit/integration suites don't cover crypto, autoRemove, touchAfter, or transformId at all—only the happy-path AVA specs exist (src/lib/MongoStore.spec.ts:1-154, src/test/integration.spec.ts:1-72). Add targeted tests using mongodb-memory-server to keep CI fast and
    remove the hard-coded mongodb://root:example@127.0.0.1 dependency.
  - Publishing still relies on humans running yarn build && yarn test && npm publish; there's no prepublishOnly hook or release workflow (README.md:318-336). Wire up standard-version + GitHub Actions to cut releases, publish to npm, upload coverage (since you already call codecov), and tag automatically.

- Docs & Community
  - Visible docs are stale: README badges still point to Coveralls even though CI uploads to Codecov, and the compatibility table claims support for MongoDB 3.6+ and Express ≤5 without mentioning the actual versions you verify (README.md:7-10, 45-55). Update the badges, compatibility ranges, and add a short “Supported
    combinations” matrix linked to CI results.
  - Migration guidance stops at v4 and still tells users to install @types/connect-mongo, while the example app depends on your old major (MIGRATION_V4.md:3-59, example/package.json:12-23). Write a v5/v6 migration doc (covering breaking changes like TTL math, client ownership, ESM builds) and refresh the example to
    match the latest API and tooling.
  - Project history isn't reflected: the “Unreleased” changelog entry just says “Drop Node 12/14/16” even though that shipped in 2023, and the release docs assume manual CLI pushes (CHANGELOG.md:7-18, README.md:318-340). Keep the changelog current and point contributors to the automated release flow once it exists.
  - Community files are placeholders: .github/CONTRIBUTING.md is boilerplate, the single issue template predates GitHub forms, and the stale bot labels issues as wontfix—which can sour legitimate bug reporters (.github/CONTRIBUTING.md:1-3, .github/ISSUE_TEMPLATE.md:1-9, .github/stale.yml:9-16). Replace these with real
    contribution guidelines (prerequisites, how to run Mongo), structured bug/feature templates, and a SECURITY.md so disclosures have a home.

Next steps: prioritize the dependency/platform upgrades first, then tackle the runtime fixes (clear, TTL math, client ownership) since they're potential bug sources, and finally modernize CI/docs so contributors have a smooth path. Once you touch the store internals, rerun yarn test (after replacing Mongo with a memory server) to keep regressions in check.
