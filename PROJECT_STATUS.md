# Project Status — where we left off

This is a plain-English recap for the team: what's actually built and working right now,
what's still missing, and what our professor's crypto checklist needs. The per-folder
`requirements.md` files (`backend/`, `frontend/`, `infrastructure/`, `.github/workflows/`)
are the original task lists this project was built from — this file tells you how far
along each one actually is, as of 2026-07-26.

The short version: **infrastructure, backend, and frontend are all functionally built**
end-to-end (real Google login, real DB, real Cloud Run scanner job, real AI matching,
real PDF/JSON reports). What's left is mostly hardening (security/CI pipeline, rate
limiting, dark theme) plus the two "nice to have" AI/SIEM pieces from the original vision
(anomaly detection, Chronicle) that were never started. We're also mid-way through the
first live end-to-end smoke test, and just found + fixed two real bugs — see the bottom
of this file.

---

## 1. Infrastructure (GCP / Terraform) — mostly done

**Done:**
- All core GCP resources are provisioned via Terraform in `infrastructure/gcp/` and
  applied: Cloud Run (backend + frontend), Cloud Run Jobs (scanner), Cloud SQL for
  Postgres, Firestore, Artifact Registry, Secret Manager, Vertex AI access, Workload
  Identity Federation for GitHub Actions (no service-account keys anywhere), Cloud
  Logging with a dedicated security-logs bucket, budget alerts, and Cloud Monitoring
  alert policies (backend 5xx spikes, failed scan jobs — both email the project owner).

**Left to do:**
- **Terraform has no CI/CD pipeline.** Every `terraform apply` so far has been run by
  hand from a laptop. There's no `infra.yml` GitHub Actions workflow (plan-on-PR,
  apply-on-merge, prod approval gate) like the other three services have. Anyone who
  wants to change infrastructure right now needs local `gcloud`/`terraform` access and
  needs to coordinate manually so two people don't apply at once.
- **Chronicle (SIEM) isn't actually turned on.** There's a Terraform scaffold for it
  (`enable_chronicle_export` in `infrastructure/gcp/logging.tf`, currently `false`) that
  would export logs to BigQuery, but the actual Chronicle console configuration and log
  ingestion was never set up. This is one of the two big items from the original
  architecture diagram that's still just a diagram.
- **Vertex AI Pipelines (anomaly detection) doesn't exist.** The README's architecture
  diagram shows a second Vertex AI branch for ML-based anomaly detection on scan logs,
  separate from the Gemini LLM CVE-matching we do have. Nobody has started this — no
  pipeline, no model, no training data plan.

## 2. Backend (FastAPI) — functionally complete, needs hardening

**Done:** all of it, end to end:
- Real Google ID-token verification (not the userinfo-endpoint shortcut, which is
  spoofable — see the comment in `app/core/security.py` for why)
- Postgres models + Alembic migrations for `users`, `targets`, `scan_configs`, `scans`
- Firestore wrapper + collections for scan logs, AI results, exploit results, audit events
- Full target/scan/report routes, all with per-user ownership checks
- SSRF guard on every target URL (rejects private/loopback/link-local/metadata addresses,
  re-checked at scan time in case DNS changed — see `app/core/ssrf.py`)
- Cloud Run Job orchestration (starts/polls/cancels scanner executions)
- ZAP-driven scanner worker + exploit-confirmation service, running in its own container
- Vertex AI (Gemini) integration for CVE/severity matching
- PDF + JSON report export
- 86 passing tests covering all routers and services (`backend/tests/`)
- Deploy pipeline (`deploy-backend.yml`) — test → build → push → deploy on every push to `main`

**Left to do:**
- **`role` on the `User` model is unused.** The column exists (`user`/presumably `admin`)
  but no route actually checks it — there's no admin-only functionality yet, even though
  §4 of `backend/requirements.md` calls for role-based access.
- **No rate limiting.** Anyone with a valid Google account can hit the API as fast as
  they want. `backend/requirements.md` §10 calls for per-user rate limiting; nothing
  implements it.
- **No structured/JSON logging or request-ID middleware.** Logs are whatever
  uvicorn/print output by default — not the JSON-with-`severity` format Cloud Logging
  parses natively, and there's no correlation ID tying an HTTP request to the scan_id
  it kicks off in Firestore.
- **`JWT_SIGNING_KEY` is dead config.** It's provisioned in Secret Manager and read into
  settings, but nothing in the code ever signs or verifies anything with it — we
  authenticate purely off Google's tokens. Either use it for something real or drop it.
- **No Celery/background-task framework** in the FastAPI-background-tasks sense — but
  this is arguably already solved differently: scans run as Cloud Run Job executions,
  which *is* the async/background mechanism, just at the infrastructure level instead of
  in-process. Worth a team discussion on whether that fully satisfies §9 or not.

## 3. Frontend (React) — functionally complete, one polish item

**Done:** essentially everything in `frontend/requirements.md` — Vite + TypeScript +
ESLint/Prettier, all listed packages (react-router-dom, @react-oauth/google, axios,
recharts, zustand, Ant Design for UI), dual-mode auth (mock login for demoing without a
backend, real Google OAuth for the live site), all 6 pages (Login, Dashboard, New Scan,
Scan Status with polling, Report with charts, Settings), all listed components, a typed
API layer, protected routing, and a mock/live data toggle via `VITE_USE_MOCKS`.

**Left to do:**
- **No dark theme.** The requirements ask for a "dark theme (cyber look)" — the app is
  currently Ant Design's light theme only. Purely cosmetic, lowest priority item in this
  whole document.

## 4. CI/CD & repo security — the biggest real gap

The original plan (`.github/workflows/requirements.md`) called for five workflow
categories. Only the deploy pipelines exist:

**Done:** `deploy-backend.yml`, `deploy-frontend.yml`, `deploy-scanner.yml` — each runs
tests, builds a container, pushes to Artifact Registry, and deploys to Cloud Run via
Workload Identity Federation (no long-lived keys). Dependabot is on for npm, pip, and
GitHub Actions (weekly).

**Left to do — this is where most of the remaining CI/CD work is:**
- No security pipeline at all: no Gitleaks (secret scanning), no CodeQL (SAST), no
  `pip-audit`/`npm audit` gating, no Trivy (container image scanning), no Checkov
  (Terraform/Dockerfile scanning).
- No branch protection on `main` — right now anyone with push access can push straight
  to `main` with no review, no required status checks, no signed-commit requirement.
  Confirmed via GitHub API: `main` has zero protection rules.
- No `CODEOWNERS` file.
- No GitHub Environments (`dev`/`prod` separation with a required reviewer for prod) —
  everything deploys straight to the one environment that exists today.

If the team is dividing up work, **this section is the best place for someone who isn't
touching backend/frontend code to contribute** — it's self-contained and doesn't require
understanding the scan pipeline.

---

## 5. Professor's crypto checklist

The ask was: Symmetric encryption, Asymmetric encryption, a symmetric key, an asymmetric
key, a Hash, a Salt, and TLS — not necessarily all of them, but most.

**Already satisfied, no extra work needed — just make sure whoever presents this knows
where to point:**
- **TLS** — every hop is already encrypted: Cloud Run terminates HTTPS for both the
  frontend and backend URLs, the Cloud SQL connector encrypts all database traffic
  (the instance has `ssl_mode=ENCRYPTED_ONLY` and no plain connections are even
  possible), and every call to Google's APIs (Firestore, Vertex AI, Cloud Run Jobs) goes
  over TLS by default via the Google client libraries.
- **Asymmetric key + Hash (partially)** — Google ID-token login (`app/core/security.py`)
  is RS256: Google signs each login token with their RSA *private* key, and our backend
  verifies it with Google's *public* key (`google.oauth2.id_token.verify_oauth2_token`).
  RS256 internally hashes the token with SHA-256 before signing. **Caveat for whoever
  presents this:** this is a digital *signature* (proves the token is genuine and
  untampered), not *encryption* (hiding data) — worth being precise about that
  distinction if asked. It's also Google's keypair, not one we generated ourselves,
  which a strict grader might not count as "our own" use of asymmetric crypto.

**Not present anywhere yet — genuine gaps:**
- **Salt** and a from-scratch **Hash** use, and **Symmetric encryption / symmetric key**,
  and a from-scratch **Asymmetric encryption / asymmetric key** (as opposed to just
  verifying Google's signature) don't exist in our own code at all. There's no local
  password storage (all auth is Google OAuth), so there's currently nowhere in the app
  that naturally needs a salted hash or a symmetric key.

**Suggested places to add the missing ones — pick 2, don't need all of these:**
1. **Hash + Salt, cheaply:** the frontend's Settings page already has an unbuilt "API key
   management" placeholder (`frontend/requirements.md` §4). Building it for real — issue
   a random API key, show it once, store only `salt + hash(key)` in Postgres (bcrypt or
   argon2), verify by re-hashing on each request — closes an already-planned feature gap
   *and* the hash/salt requirement in one piece of work.
2. **Symmetric encryption + symmetric key:** the `exploit_results` Firestore collection
   stores raw proof-of-concept evidence from confirmed vulnerabilities (e.g. actual
   injected payloads, sometimes extracted data) — encrypting that at rest with AES-GCM,
   using a symmetric key pulled from Secret Manager, before writing it to Firestore, is a
   real security improvement (that data is sensitive) and a direct, honest use of the
   primitive — not encryption for its own sake.
3. **Asymmetric encryption or a from-scratch asymmetric key:** sign each exported PDF/JSON
   report with our own RSA or ECDSA private key and publish the matching public key, so
   anyone (a grader, a teammate, a future auditor) can verify a report actually came from
   our system and wasn't edited after export. This is a from-scratch asymmetric keypair
   we generate and control — unlike the Google ID-token case above — and it's a genuine
   integrity feature for a report meant to be shared outside the app.

None of the three suggestions above are built yet — this is a proposal for the team to
pick from, not a decision already made.

---

## 6. Where we are right now (live smoke test, in progress)

We just pushed all of the backend build-out (target/scan/report routes, the scanner
container, the 86-test suite) live and started the first real end-to-end smoke test:
log in for real, add `testphp.vulnweb.com` as a target (a deliberately-vulnerable public
test site, not a teammate's infrastructure), and run a real scan through the real
pipeline.

Two real, live-only bugs turned up in the first attempt, both now fixed and redeployed:

1. **The deployed frontend was silently running in mock mode.** The `VITE_USE_MOCKS`
   setting that controls this was never set as a GitHub repo variable, so it defaulted
   to `true` at build time — meaning the "live" site never actually talked to the real
   backend, even though everything looked normal in the browser. Fixed by setting the
   variable and redeploying.
2. **A real backend bug**: the Cloud SQL connector was crashing with
   `RuntimeError: ... attached to a different loop` on its first use per cold start,
   which 500'd the very first authenticated request after login. Root cause and fix are
   in `backend/app/db/session.py` (commit `a46c2c8`) — the connector needs to be told
   which asyncio event loop to use, or it spins up its own and the two loops fight.

Both fixes are live. The smoke test itself is paused mid-retry — next step for whoever
picks this up is: sign in on the live frontend again, add a target, start a scan, and
confirm it makes it all the way through (Cloud Run Job execution → ZAP → Vertex AI →
Firestore → report) without a manual walkthrough from here.

---

## Suggested priority order if picking this up fresh

1. Finish the live smoke test (see §6) — this is the one thing standing between "looks
   done" and "confirmed working."
2. CI/CD security pipeline + branch protection (§4) — biggest gap, safest for a second
   person to own in parallel without touching scan logic.
3. Rate limiting + role enforcement + structured logging (§2) — hardening, not blocking.
4. Pick 2 of the 3 crypto suggestions (§5) for the professor's requirement.
5. Dark theme (§3) — cosmetic, do whenever.
6. Chronicle + Vertex AI Pipelines (§1) — biggest remaining scope item, but the least
   urgent: the platform works end-to-end without them, they were always the "advanced"
   half of the original architecture diagram.
