# EasyCart CI/CD — explained simply

**CI** checks code automatically. **CD** deploys a checked version so people can use it. GitHub Actions runs the pipeline; Cloudflare runs the backend; Supabase stores data and, when enabled, handles passwords. Prisma is not required.

```text
Push a branch or open a PR
  → detect changed apps
  → run their checks
  → one final “CI” result

Successful backend CI on main
  → run database integration tests
  → deploy dev, if enabled
  → check the deployed health endpoint
  → manually promote the same artifact to QA, then prod
```

## Files and checks

| File | What it does |
| --- | --- |
| `ci.yml` | Starts on pushes, pull requests, and manual runs; selects affected apps and produces the final `CI` result |
| `frontend-ci.yml` | Installs packages, runs ESLint and TypeScript, and builds the website |
| `backend-ci.yml` | Runs database-independent tests, tests the real local Workers runtime against a mock Supabase API, and builds a Worker artifact |
| `mobile-ci.yml` | Checks TypeScript, reads Expo configuration, and exports the web app |
| `backend-integration.yml` | Runs real database tests on a dedicated Supabase CI project; requires secrets and trusted `main` code |
| `deploy-backend.yml` | Deploys or promotes a successful main-branch CI artifact to dev, QA, or prod |

Frontend and mobile have CI only for now. Mobile web export does not prove Android or iOS native builds work. Only the backend has a deployment workflow.

The frontend production build requires `VITE_API_BASE_URL`. CI reads it from the GitHub repository variable of the same name, falling back to `https://api.example.invalid` for build validation only. This reserved placeholder does not contact a backend and must not be used for a deployed frontend. To supply a real address, open **Settings → Secrets and variables → Actions → Variables → New repository variable** and set `VITE_API_BASE_URL` to your backend origin. This URL is public configuration, not a secret. A future frontend deployment must require the correct environment-specific URL instead of using this CI fallback.

## When checks run

All branches, including `feature/*`, receive CI. The top-level workflow always starts, so there is one reliable status to require before merging.

- A change inside `frontend/`, `backend/`, or `mobile-app/` runs that app's checks.
- Changes to `.github/`, `scripts/ci/`, or `skill.md` run all app checks.
- A root README-only change needs no app job, but the final `CI` result still runs.
- Manual CI and initial branch pushes check all apps.
- Outdated runs on the same branch are cancelled to save runner time.

Each app has its own job. If one fails, the other app jobs can still finish. The final `CI` job fails if change detection or any selected app fails. In GitHub branch protection, require **CI**, rather than requiring path-dependent app jobs individually. Integration tests and deployments are separate checks.

## What the YAML means

| Keyword | Meaning |
| --- | --- |
| `on` | Events that start the workflow |
| `jobs` | Groups of work |
| `needs` | Work that must finish first |
| `if` | Condition deciding whether to run |
| `runs-on` | The machine GitHub provides |
| `steps` | Ordered tasks inside a job |
| `uses` | Run a reusable action or workflow |
| `run` | Run a shell command |
| `env` | Settings supplied to commands |
| `secrets` | Private credentials stored in GitHub |
| `vars` | Non-secret GitHub settings |
| `environment` | A deployment target with its own settings and protection rules |
| `concurrency` | Prevent overlapping or outdated work |

Indentation defines the structure. `npm ci` installs exactly from the lockfile. Node.js 22 is used in CI. ESLint parses TypeScript with a compatible parser; TypeScript performs undefined-name and unused-code checks. Existing React compiler and Fast Refresh diagnostics remain visible as warnings, while rules of hooks and type errors block CI.

## Backend tests without exposing credentials

`npm run test:unit` runs files explicitly listed in `backend/vitest-unit-files.json` with hosted credentials blanked out. This works for fork PRs too. New tests not listed there belong to the integration suite until deliberately classified. `npm run test:integration` runs the remaining tests against Supabase. `npm test` still runs the complete suite.

The local Worker smoke test starts a fake Supabase server and verifies health, CORS, password login, app token claims, authentication guards, and error responses. It does not connect to your Supabase account or prove live integration works.

Real database tests create and change data. In GitHub, create an environment named **ci**, restrict its deployment branches to `main`, and add these secrets:

- `CI_SUPABASE_URL`
- `CI_SUPABASE_SERVICE_ROLE_KEY`

Use a dedicated test project with the required database schema, migrations, and Storage setup. Never point these tests at production. Run **Backend Supabase integration** manually from `main`, or let the deployment workflow run it before deployment. Runs sharing the CI database are serialized. Secrets are never supplied to ordinary PR checks.

## Dev, QA, and prod

These are three separate Worker configurations, not three VMs. They become hosted services only when deployed.

| Environment | Worker name | Release rule |
| --- | --- | --- |
| Dev | `easycart-api-dev` | Automatic after successful main CI only when explicitly enabled; also supports manual deployment |
| QA | `easycart-api-qa` | Manually promote an artifact that successfully deployed to dev |
| Prod | `easycart-api-prod` | Manually promote an artifact that successfully deployed to QA |

The same bundled JavaScript artifact is used in each environment. It is not rebuilt during promotion. Artifacts are retained for seven days and uploaded only for main-branch backend builds to limit free storage use. If an artifact expires, create a new backend CI release and promote it again. Re-deploying an earlier retained artifact is also the rollback path.

### One-time setup

1. Create a Cloudflare account on the Workers Free plan. Activate your provided `workers.dev` subdomain; no purchased domain is needed. Create an API token scoped to the intended account with Workers Scripts edit permission. Do not commit it.
2. Create GitHub environments named `dev`, `qa`, and `prod`. Restrict their deployment branches to `main`. Configure required reviewers for QA/prod where your GitHub plan supports it. Choosing an environment in YAML alone does not create approval protection.
3. In each environment you intend to enable, add **secrets**: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a random `JWT_SECRET` of at least 32 characters. Use different JWT secrets and database credentials for each environment.
4. Add **variables**: `BACKEND_URL` (for example, `https://easycart-api-dev.YOUR-SUBDOMAIN.workers.dev`) and `CORS_ORIGIN` (a comma-separated list of browser origins allowed to call that backend, without trailing slashes).
5. Prepare and test the Supabase Auth migration described below. Only then set the environment variables `SUPABASE_AUTH_MIGRATED=true` and `DEPLOYMENT_ENABLED=true`.
6. Start with dev only. To allow automatic dev deployments, add the **repository variable** `ENABLE_DEV_DEPLOY=true`. Leave it unset to keep deployment manual. Leave QA/prod disabled until you have isolated databases and have completed readiness checks.
7. For manual deployment, open **Actions → Deploy backend → Run workflow**, select `main`, choose the environment, and provide the numeric run ID of a successful **EasyCart CI** push run on `main` that produced a backend artifact. Use that same ID to promote it to the next environment.

All deployment switches default to disabled. A run from a feature branch cannot deploy. Only successful main push CI artifacts are accepted. Deployments must pass the real Supabase integration suite first. Wrangler uploads code and temporary-file secrets together, then the workflow checks `/api/health` and records the commit and CI run ID for the next promotion gate. A failed health check fails deployment; it does not automatically roll back a Worker already uploaded. After a deployment failure, inspect the logs and re-deploy the previous known-good artifact if necessary.

GitHub Environments are configuration boundaries, not extra free database instances. Supabase's free allowance includes two active projects. For the first free setup, use one for dev and one for CI; keep QA/prod disabled rather than sharing production data. Cloudflare's request/CPU limits and GitHub's runner/storage allowances still apply. No paid resource is provisioned by these files.

## Password migration before enabling Workers

The backend supports `AUTH_PROVIDER=supabase`; local Node installations default to bcrypt. The Worker requires Supabase for both its database and passwords because local bcrypt is too CPU-intensive for the Workers Free request budget.

In Supabase mode, passwords are verified remotely. The verified Auth UUID must match the application UUID. Roles, tenant ownership, and our existing 12-hour app tokens still come from the application; Supabase role metadata cannot grant app privileges. New accounts store an Auth reference instead of a local bcrypt hash. Profile email changes for remote accounts are temporarily blocked until a coordinated verified email-change flow is implemented.

Use a dedicated test project first:

1. Back up application users. Configure that project's `DB_PROVIDER=supabase`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` outside Git. Leave `AUTH_PROVIDER=bcrypt` during preparation.
2. From `backend/`, run `node scripts/migrate-supabase-passwords.js` to preview eligible accounts. This does not import or modify them.
3. After reviewing the target project, run `node scripts/migrate-supabase-passwords.js --apply` manually. It imports existing bcrypt hashes and UUIDs into Auth. It retains application rows/hashes, skips identities previously marked by this importer, and stops on unrelated conflicts. Earlier imports remain if a later import fails. Passwords and hashes are not printed.
4. Set `AUTH_PROVIDER=supabase` in the test backend, restart it, and test new and existing accounts for every role. Test wrong passwords, inactive accounts, and cross-tenant access. Unmigrated accounts cannot log in in this mode; there is no local bcrypt fallback.
5. Review Supabase Auth public signup settings, rate limits, and email policy before enabling a hosted environment. Existing immediate-access signup behavior is preserved by confirming provisioned emails; this does not prove email ownership.

Provisioning Auth credentials and saving the app profile are separate operations. Failed profile creation attempts remove new credentials when safe; partial saves or failed cleanup require administrator review. Accounts created remotely continue using remote verification if the default provider is later switched back to bcrypt.

No migration runs automatically during CI or deployment. Schema changes and account imports require a reviewed migration process; these files do not overwrite live data.

## Worker behavior and remaining limits

The Worker has its own entry point, uses Supabase Storage rather than local uploads, and runs delivery-offer cleanup through a scheduled trigger every minute. Cloudflare rate-limit bindings enforce per-location read/write budgets. They are not globally exact counters. Node's process-local limits remain active outside Workers.

The existing event bus is process-local. On Workers, authenticated live streams also send refresh hints every 25 seconds, so screens eventually re-read changes made on other instances. This is a polling-style fallback through the stream, not instant distributed broadcasting. Queries still enforce their normal permissions. User metadata caching and Storage-based status writes also need concurrency review before a production rollout.

Bundling and local runtime success do not prove the app fits the deployed free CPU budget. Before QA/prod, verify live signup/login, uploads, checkout, delivery, cross-instance updates, concurrency, and CPU metrics in dev. Keep production disabled until those checks pass.

## Validate changes, including AI-written pipelines

From the repository root:

```sh
node --test scripts/ci/*.test.mjs
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm --prefix backend run test:unit
npm --prefix backend run worker:smoke
npm --prefix backend run worker:check
npm --prefix mobile-app run typecheck
npm --prefix mobile-app run export:web
```

Run `actionlint` to check GitHub-specific YAML rules; CI does this too. For Expo configuration, run `npx expo config --type public` from `mobile-app/`. Run real backend integration tests only against the dedicated CI project.

Check trigger behavior in a PR, inspect logs to confirm checks really ran, and temporarily introduce a failing test/type error on a test branch to prove failures turn CI red; then revert it. A green check means only the configured checks passed. AI-written YAML needs exactly the same validation as human-written YAML.
