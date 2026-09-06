<h1 align="center">Rost</h1>

<p align="center">
  <strong>Workspaces, projects, and a kanban board — built to production standards rather than to a tutorial's.</strong><br>
  A full-stack project-management app whose interesting parts are the ones you can't see:
  refresh-token reuse detection, access enforced inside the SQL query, and a deletion model
  that can tell erasure from a purge.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/.NET-10-512BD4?logo=dotnet&logoColor=white" alt=".NET 10">
  <img src="https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white" alt="Angular 22">
  <img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 18">
  <img src="https://img.shields.io/badge/tests-817-34d399" alt="817 tests">
  <img src="https://img.shields.io/badge/CI-4%20gates-38bdf8" alt="CI: 4 jobs">
  <img src="https://img.shields.io/badge/i18n-EN%20%C2%B7%20RO-a78bfa" alt="Languages: English, Romanian">
</p>

<p align="center">
  <img src="docs/workspace-home.webp" width="900"
       alt="The workspace home in light theme with the default violet accent: a sidebar carrying the workspace switcher above Home, Projects, Tasks, Members, Settings and Trash; beside it a greeting for dev1, the local weather, a band reading 3 members, 2 projects and 6 open tasks, then dev1's own open tasks and the two most recently updated projects.">
</p>

> [!NOTE]
> **Runs locally, not yet deployed.** Everything below is real and tested, but the
> production story is deliberately unfinished: no TLS, no deploy target, and no email
> lifecycle yet. See [Status](#status).

**Contents** — [What it does](#what-it-does) · [Quick start](#quick-start) ·
[Architecture](#architecture) · [What it demonstrates](#what-it-demonstrates) ·
[The app](#the-app) · [Testing](#testing) · [Configuration](#configuration) ·
[Status](#status)

## What it does

You sign up and land in a **personal workspace** that already exists — nobody starts at an
empty state asking them to create a container before they can create anything. Projects live in
workspaces; tasks live in projects; a workspace shared with other people is the same entity with
more members in it.

Everything below the workspace is reached through it. A **sidebar** carries the workspace switcher
at its top and that workspace's destinations under it — Home, Projects, Tasks, Members, Settings,
Trash — so switching visibly repopulates what is beneath it. The home is a digest of _your_ work
rather than a company scoreboard: your open tasks, soonest due first, and the projects that moved
most recently. Nothing aggregates across workspaces, because the workspace is the tenant boundary.

Owners **invite by email**, and the two cases are genuinely different: an address that already has
an account joins immediately, an address that doesn't gets a redeemable token that is consumed the
moment they register. Members contribute; only owners can remove a project or move one out.

Each project opens on a **kanban board** — drag between To do, In progress and Done, or reach every
one of those outcomes from a card menu, because a board only reachable by dragging is a board some
people cannot use. A `?view=list` toggle swaps in a filterable, sortable table over the same data.

Deleting is reversible until it isn't: tasks, projects, workspaces and users all go to a **trash**
they can be restored from, and an admin can purge past that window. Every trash states that window
in days and counts each row down to its own expiry, rather than alluding to a policy the reader
cannot see. Deleting a task also offers **Undo** on the snackbar for the eight seconds after —
undo for the action that can be taken back, type-to-confirm for the one that can't, and never both
in front of the same click. Erasing a _user_ is a different operation from purging a project, and
the app treats it as one.

## Quick start

Requires Docker or Podman with Compose. No local .NET or Node install is needed.

```bash
git clone <this repo> && cd rost
cp .env.example .env      # then fill in the blanks — see below
docker compose up -d      # or: podman compose up -d
```

Two values in `.env` need attention: `POSTGRES_PASSWORD` must match the password inside
`DB_CONNECTION_STRING`, and the JWT signing key wants at least 64 characters —
`openssl rand -base64 48` produces one. Migrations and seed data apply automatically on API
startup.

Then open:

|                                      |                                |
| ------------------------------------ | ------------------------------ |
| **The app** — start here             | <http://localhost:8000>        |
| **API reference** (Scalar, dev only) | <http://localhost:8000/scalar> |
| **Health check**                     | <http://localhost:8000/health> |

Seeded accounts, all with password `Password123!`:

| Account                                 | What it's for                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `dev1@example.com`                      | Owner of the shared **Acme Team** workspace, which holds the seeded board     |
| `dev2@example.com` · `dev3@example.com` | Members of it, so invitations and role changes have someone to act on         |
| `admin@example.com`                     | Administrator — sees the admin area, and deliberately owns no projects at all |

Everything the browser touches arrives through the reverse proxy on **one origin**, which is the
only port bound to every interface. Three more are published on `127.0.0.1` for debugging, and
nothing in the app uses them:

|                                       |                  |
| ------------------------------------- | ---------------- |
| Postgres, for a database client       | `127.0.0.1:5432` |
| The API, unproxied                    | `127.0.0.1:8080` |
| The Angular dev server, without nginx | `127.0.0.1:4200` |

`DB_CONNECTION_STRING` in `.env` is the API's route to Postgres, not yours: its `Host=db` is a compose
service name and will not resolve from your machine.

Those doors are safe because the trust is pinned to an address rather than resting on their absence:
`AuthProtection:TrustedProxyNetworks` names `10.99.0.10/32`, the proxy's fixed address on the compose
network, and a request through a published port reaches the container from somewhere else, so its
`X-Forwarded-For` is ignored and it keys on its own socket address. Widen that setting back to a
subnet and `:8080` turns into a bypass again — a caller could pick its own rate-limit partition.
`:4200` skips nginx, so the SSR server's `X-Forwarded-Host` there is whatever the caller sends —
harmless from your own machine, which is the only place any of the three answers.

## Architecture

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/architecture-dark.svg">
    <img src="docs/architecture-light.svg" width="1000"
         alt="Architecture: the browser reaches one origin, where nginx splits / and static assets to the Angular SSR server and /api and /health to the ASP.NET Core API, which reaches PostgreSQL through EF Core. A planned mobile client enters the same origin and uses the same bearer-token API. The three services sit behind the proxy and believe forwarded headers only from its pinned address.">
  </picture>
</p>

| Layer          | Technology                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Backend        | ASP.NET Core 10, EF Core + Npgsql, ASP.NET Identity, FluentValidation, Serilog                      |
| Frontend       | Angular 22 (standalone, signals, OnPush), Angular Material, hybrid SSR via `@angular/ssr` + Express |
| Database       | PostgreSQL 18                                                                                       |
| Testing        | xUnit v3, Vitest, Playwright                                                                        |
| Infrastructure | nginx, Docker / Podman Compose, GitHub Actions                                                      |

| Project                                         | What it is                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| [`backend/`](backend)                           | ASP.NET Core 10 API — controllers, services, EF Core data layer, migrations       |
| [`backend.Tests/`](backend.Tests)               | xUnit v3 suite, entirely EF InMemory so it needs no database                      |
| [`frontend-angular/`](frontend-angular)         | Angular 22 app — `core/` (guards, interceptors, services), `features/`, `shared/` |
| [`frontend-angular/e2e/`](frontend-angular/e2e) | Playwright specs, run against the live stack through the proxy                    |
| [`nginx/`](nginx)                               | The single-origin reverse proxy                                                   |
| [`compose.yaml`](compose.yaml)                  | Dev stack: api, db, frontend, proxy (+ an `e2e` profile)                          |

### What it demonstrates

- **Refresh tokens that assume they'll be stolen.** Access tokens are short-lived JWTs;
  refresh tokens are 64 bytes of CSPRNG, **stored only as a SHA-256 hash**, and rotated on every
  use. Presenting an _already-revoked_ token is the signature of a replay, so it doesn't just
  fail — it **revokes the user's entire token family**, on the reasoning that either the attacker
  or the victim is holding a token that must stop working. The client never holds anything the
  server keeps in plaintext.

- **Two halves of a brute-force defence, because they stop different attackers.** A per-IP
  **sliding**-window limiter runs _ahead of authentication_, so a rejected request never reaches
  password hashing — sliding rather than fixed, since a fixed window lets an attacker spend a full
  quota either side of the boundary for double the rate. Per-account **lockout** is the half that
  survives an attacker rotating addresses. Login answers identically whether the address is
  unknown, the password is wrong, or the account is locked; lockout state goes to the log and
  never to the caller, because anything more precise is an enumeration oracle.

- **Forwarded headers that fail closed.** Behind a proxy, an unconfigured `RemoteIpAddress` is the
  _proxy's_, so every caller shares one rate-limit partition and the limiter throttles the whole app
  as a single client. Trust is therefore pinned to one CIDR with `ForwardLimit = 1`. The subtlety
  that makes this worth writing down: ASP.NET's middleware treats an **empty** trust list as "don't
  check" rather than "trust nothing", so it would believe `X-Forwarded-For` from anyone — an empty
  list here switches forwarded headers off entirely instead.

- **Access enforced inside the query, not after it.** Workspace membership is an `EXISTS` subquery
  on every read, so an unreachable row is never fetched and then filtered. It is `EXISTS` rather
  than a join for a specific reason: a join through the soft-delete-filtered `Workspaces` set
  silently _drops_ projects, while `workspace_members` carries no filter. A non-member gets **404,
  not 403** — existence and access are deliberately indistinguishable.

- **A deletion model that knows erasure from a purge.** Soft delete is a global query filter with a
  trash area and a trash window. Projects can be hard-purged; **users cannot**, because audit
  foreign keys (`created_by`/`updated_by`) reference them with `Restrict`. GDPR erasure is therefore
  implemented as **anonymization** — PII scrubbed, password hash dropped, row retained so the audit
  trail stays valid — and it refuses outright if the account is the sole owner of a shared workspace,
  naming which ones. The one thing erasure does destroy outright is the account's **private**
  workspace, tasks and projects first: a personal workspace's name is derived from its owner's, so a
  soft-deleted row would keep the very name the erasure existed to remove — and offer a Restore in
  the admin trash that contradicts the promise the erasure just made.

- **A number the reader is shown is a number the server enforces.** The trash window has no default
  in code — `TrashWindow` binds one section, startup fails if it is missing or non-positive, and it
  fails just as loudly if the _old_ key name is still set rather than falling back to a 30 nobody
  chose. The API publishes it at `GET /api/config`, so the UI can say "restorable for 30 days" and
  count each row down to its own expiry instead of alluding to a policy it cannot see — and past the
  cutoff the same number refuses the restore, rather than a countdown running out on a row that
  would have come back anyway. A displayed deadline nothing enforces is worse than none, which is
  why the admin dashboard's workspace numbers carry no countdown at all: workspace purge, unlike
  project purge, is not cutoff-gated.

- **A query filter is not a privacy guarantee.** Every trash reads through `IgnoreQueryFilters()` to
  see soft-deleted rows — and that switch is query-**wide** in EF, so it also turned off the filter
  hiding soft-deleted _users_, printing a deleted person's real name during exactly the window
  between soft delete and erasure. Every projection now tests `IsDeleted` on the user navigation
  itself rather than trusting a filter that may not be on. The tests are the other half of the story:
  two rounds of them were **worthless**, because the fixtures seeded through the synchronous
  `SaveChanges()`, which skips the audit interceptor — the audit FKs stayed null, an earlier branch
  answered, and deleting the guards left the suite green. Guards are mutation-checked here for that
  reason.

- **Ordering that stays the server's business.** A card's position is an integer renumbered per
  column, but a move is expressed as **the neighbours it landed between**, so the client never
  learns the numbering scheme and it can be swapped for fractional ranks without touching the
  frontend. A neighbour that has since moved counts as absent rather than as an error. Drags are
  applied optimistically, then reconciled with the row the server actually wrote — and rolled back
  by _refetching_, because a snapshot taken before the optimistic apply would also erase whatever
  else arrived while the request was in flight.

- **Midnight is a state change, not a rendering detail.** _Overdue_ and _Due today_ are read from a
  signal holding the reader's calendar day, re-armed a second past each local midnight, so a page
  left open overnight re-bands itself instead of serving yesterday's answer until something
  unrelated happens to recompute. The server render schedules no timer — a pending one would hold
  the response open — and the rollover re-applies only the filter whose result actually depends on
  the day, since anything wider would throw a reader on page 3 back to page 1 at 00:00:01. The API
  half is the same argument: the workspace task query takes `dueBefore` as a **date the client
  sends**, not an `overdue=true` flag, because a due date is a calendar day and in UTC+3 the
  server's day is the previous one until 03:00 local — which used to drop genuinely late tasks from
  the Overdue filter for three hours a night.

- **Audit stamping that doesn't lie.** The `DbContext` stamps `UpdatedAt`/`UpdatedBy` on save — but
  rows that shift as a _consequence_ of someone else's edit are marked incidental and skipped.
  Without it, dragging one card leaves an entire column reading "updated by Bob, just now".

- **Constraints where they can actually be enforced.** Email uniqueness is a **partial unique index**
  filtered on `is_deleted = false`, so a deleted account stops reserving its address — and because
  the index is the only check atomic with the insert, it catches races no validator can. The
  violation is translated back into a business rule by an **exception filter** naming the exact
  constraint, which matters: filters run before the stack unwinds, so anything unmapped propagates
  with its original trace instead of being rethrown from the data layer.

- **Hybrid SSR, chosen for a reason and not for the checkbox.** Public pages are server-rendered for
  first paint and SEO; authenticated routes are client-rendered because the JWT lives in
  `localStorage`, which the server cannot read — serving an empty shell would be worse than not
  rendering at all. The payoff is that the API stays a **token-based, client-agnostic JSON contract**
  a mobile client can consume unchanged.

- **A board anyone can operate.** WCAG 2.2 SC 2.5.7 requires every drag outcome to be reachable
  without dragging, so each card carries a menu with move-to-column, move-up and move-down that call
  the same endpoint the drop handler does. The **menu** is what the e2e suite drives, deliberately:
  Playwright's drag against the CDK is flaky, and the accessible path is the one worth pinning —
  both routes converge on the same `/move` call one layer down. The same rule caught the tables: a
  row's click was the only route into a trashed item, and it was mouse-only in all four of them, so
  one directive gives every clickable row a tab stop, a button role, Enter/Space and a focus ring.

- **Theming that goes all the way down.** Light and dark are Material 3 `light-dark()` token pairs,
  so a palette is a set of colours and nothing else — no dark-only literals stranded in components.
  Five accent schemes, both choices independent and persisted, and re-applied before first paint so
  a reload never flashes. Switching animates as a circular reveal from the control you clicked (View
  Transitions API), and a reader who asks for reduced motion gets the instant swap.

- **Translated to the edges.** English and Romanian, 668 keys each, including the server's error
  codes — a failed request is mapped back to a translation key rather than shown whatever prose the
  API happened to return. The language is resolved in an app initializer, so it is settled before
  the first render on the server as well as in the browser.

- **An architecture test where a comment would have been ignored.** Admin services reach every row,
  so a `ICurrentUserService` in one of their constructors could only be a mistake — a test asserts
  none of them takes one, plus a second test asserting the namespace scan actually matches something,
  because a filter matching nothing would pass the first test forever.

<details>
<summary><b>Inside the API</b> — where each of the above lives</summary>

- **`Services/`** — the layer that owns the rules.
  - `RefreshTokenService.cs` — issue, rotate, revoke, and the family revocation on reuse.
  - `WorkspaceAccessService.cs` — the membership guard. Reads the **row**, not a projection:
    `FirstOrDefaultAsync` over a projected enum returns `default(WorkspaceRole)`, so a non-member
    would read as a Member.
  - `TaskService.cs` — the neighbour-based move, per-column renumbering, the incidental-change
    marking that keeps a drag from re-attributing a whole column, and the two trash reads. The
    workspace-wide one spells `!t.Project.IsDeleted` out inline, because the `IgnoreQueryFilters()`
    it needs to see deleted tasks would otherwise fill the list with rows that restore refuses.
  - `InvitationService.cs` — invite, revoke, accept, and the no-token redemption that runs at
    registration and is forbidden from throwing, because a stale invitation must not fail a signup.
  - `Admin/AdminUserService.cs` — anonymization, the sole-owner refusal, and the hard delete of the
    erased account's private workspace.
  - `Admin/AdminDashboardService.cs` — the aggregate counts and the lifecycle numbers the dashboard
    splits into a "needs attention" queue and a quieter context strip.
- **`Data/AppDbContext.cs`** — query filters, audit stamping, the partial unique indexes, and the
  Postgres error translation.
- **`Mappings/`** — the DTO projections, each testing `IsDeleted` on a user navigation itself rather
  than relying on a query filter the caller may have turned off.
- **`Config/TrashWindow.cs`** + **`Controllers/ConfigController.cs`** — the one retention window,
  bound with no code default and published anonymously, since a retention policy is not a secret.
- **`Data/*QueryExtensions.cs`** — the composable access predicates (`InWorkspacesOf`,
  `InProjectsOf`, `Pending`), each carrying the note on why it is an `EXISTS`.
- **`Extensions/ServiceExtensions.cs`** — Identity, JWT bearer, the rate-limit policies and the
  forwarded-headers trust, all in one place.
- **`Security/SecureToken.cs`** — the generate-and-hash pair used by both refresh tokens and
  invitation links.
- **`Middleware/`** — RFC 9457 ProblemDetails via `GlobalExceptionHandler`, the rate-limit rejection
  handler that supplies `Retry-After`, and request logging.

</details>

## The app

### The board

<p align="center">
  <img src="docs/board.webp" width="900"
       alt="The kanban board for Acme Website Redesign in light theme with the emerald accent: the workspace sidebar on the left, a project header with a Board/List toggle and a Recently deleted link, then three columns — To do with four cards, In progress with two, Done with two — cards carrying a title with a due date and assignee where they are set, one of them overdue in red.">
</p>

Three columns, drag between them, and a per-card menu carrying the same moves for anyone not using a
mouse. Cards show what a card has to: assignee, due date, and **overdue in red**. The project's own
"Recently deleted" sits in the view bar beside the Board/List toggle, one click from where a card was
lost. Trashing a project doesn't touch its tasks — they fall out of every query through the same
membership subquery and come back intact on restore.

### The list view

<p align="center">
  <img src="docs/task-list.webp" width="900"
       alt="The same project in list view, light theme with the indigo accent: a table of eight tasks with title, description, assignee, status chip and due date, below search, an Assigned to me filter and an Overdue filter, with pagination showing 1 to 8 of 8. One row's due date is red for overdue.">
</p>

The same tasks, one `?view=list` away — search, _assigned to me_, _overdue_, and a paginator. The
view lives in the URL rather than in stored preferences, which is what keeps it free of an SSR
problem: there is no per-user state to resolve before the first render.

### Recently deleted

<p align="center">
  <img src="docs/trash.webp" width="900"
       alt="The Acme Team trash in light theme with the slate accent: a Tasks tab and a Projects tab under the heading, and three deleted tasks in a table with title, project, status, deleted date and an Expires column reading in 28 days, in 19 days, and in 3 days in red.">
</p>

One trash per workspace, with a tab per kind. **Tasks is the tab both roles have** — any member may
delete a task, so any member must be able to restore one — while Projects is owner-only, and the
guard sits on that child route rather than on the page, so a member reaching `/trash` gets the tab
that belongs to them instead of a 403. The window is stated once in the subtitle and then per row:
each line counts down to its own expiry and turns red as it runs out, which is only honest because
the same number is the one the server enforces.

### Members and invitations

<p align="center">
  <img src="docs/members.webp" width="900"
       alt="The Members page for Acme Team in light theme with the rose accent: Dev User1 as Owner marked You, Dev User2 and Dev User3 as Members with editable role dropdowns and remove buttons, below a header carrying Invite people and Leave workspace, with the workspace sidebar alongside.">
</p>

Roles are editable in place, and the actions that aren't yours simply aren't there. A personal
workspace refuses members outright — it is the same entity, but "invite someone to your personal
workspace" is not a thing the model should permit.

### Theme and accent

<p align="center">
  <img src="docs/theming.webp" width="900"
       alt="The profile menu open over the workspace home in dark theme with the rose accent, showing the signed-in user and a row of five accent swatches — violet, indigo, emerald, rose and slate, rose selected — above My Profile and Sign Out.">
</p>

Five accents, two themes, independently chosen and both remembered. Untouched, the theme follows the
OS — including live, if the OS flips at sunset. The screenshots on this page run through all five
accents — violet on the workspace home, emerald on the board, indigo on the list, slate on the trash
and rose on Members. The last two, the admin dashboard and this one, are the dark theme; the rest are
light. Violet is the accent a new account gets.

### The admin area

<p align="center">
  <img src="docs/admin-dashboard.webp" width="900"
       alt="The admin dashboard in dark theme with the violet accent: a greeting for Admin beside the local weather, the heading Rost Administration with a DEVELOPMENT badge, a band reading 4 users, 1 shared workspace, 8 projects and 8 tasks, a Needs attention queue holding 9 projects past the window, recent signups, and a strip stating that projects are purgeable 30 days after deletion.">
</p>

An administrator administers, and holds no projects or workspaces of their own — enforced by an
authorization policy rather than by convention. The dashboard is the workspace home's skeleton with
admin nouns in it, sharing one stylesheet and one greeting rather than a second copy of each, which
is how the two drifted apart in the first place. Its band counts live rows; **"Needs attention"
holds only the numbers with a verb behind them** — projects past the purge window, accounts awaiting
erasure — and collapses to a single sentence when there is nothing to do. Locked-out accounts are
counted in the strip below rather than promoted into the queue, because `/admin/users` has no unlock
to send anyone to yet, and a card that promises a verb it cannot deliver is worse than a sentence.
Lifetime totals that only ever grow were dropped outright: a metric that cannot change what the
reader does next has not earned the screen.

Behind it, `/admin/users` lists accounts and the three trashes hold what has been deleted.
Destructive actions there are **type-to-confirm**: one row asks for its name, a batch asks for its
size, because a batch has no single name to type and the count is the blast radius.

## Testing

817 tests across three suites, all four CI jobs gating every push.

```bash
# Backend — xUnit v3, entirely EF InMemory, so no database needed
dotnet test

# Frontend unit — Vitest
docker compose exec frontend npm test -- --watch=false

# End-to-end — Playwright, in a container against the live stack, through the proxy
docker compose --profile e2e up --abort-on-container-exit
```

Run the e2e service rather than overriding its command: the service waits for the proxy to accept
connections and runs `npm install` first, and `e2e_node_modules` is an empty named volume mounted
over `/app/node_modules` on a fresh clone. `run --rm e2e npx playwright test` replaces that command,
so npx would fetch a Playwright that doesn't match the browsers baked into the image.

| Suite                   | Count   | Notes                                                                          |
| ----------------------- | ------- | ------------------------------------------------------------------------------ |
| Backend (xUnit v3)      | **395** | Services, controllers, validators, mappings, middleware, the architecture test |
| Frontend unit (Vitest)  | **340** | Services, guards, interceptors, components, and the signal-based table helpers |
| End-to-end (Playwright) | **82**  | 22 specs driving the real stack through nginx                                  |

CI runs four jobs: workflow lint (actionlint), backend, frontend, and e2e gated behind the two fast
suites. Both language gates are set to fail on warnings — `-warnaserror` on the .NET build,
`--max-warnings=0` on ESLint — so a rule demoted to "warn" still blocks rather than quietly
accumulating. `dotnet list package --vulnerable` is checked by its _output_, not its exit code,
which is 0 even when it reports a High advisory.

Two things worth knowing if you work on this repo. The frontend's `format:check` runs _inside_
`frontend-angular` and therefore never sees `backend/` or the root files — CI has a second Prettier
step for those, and `nginx/` is in `.prettierignore` (no parser for `.conf`), so it is format-gated
by nothing. And a Playwright run from the host against compose needs
`E2E_BASE_URL=http://localhost:8000`: the config's `localhost:4200` default is load-bearing for CI,
which runs the API and dev server directly on the runner with no proxy at all. Forgetting it used to
fail fast on a refused connection; now that `4200` is published, the suite runs green against the dev
server instead and nginx is never exercised, so a broken `default.conf` passes.

## Configuration

Set via `appsettings.json` or environment variables. **`.env` is not a general config file here** —
compose has no `env_file:`, and the api service forwards exactly six variables
(`ConnectionStrings__DefaultConnection`, `Jwt__Key`, `Jwt__Issuer`, `Jwt__Audience`,
`Jwt__DurationInMinutes`, plus `POSTGRES_PASSWORD` for the database). Anything else put in `.env` is
read by Compose for interpolation and never reaches the container, silently. To tune the rest, edit
`appsettings.Development.json` or add the variable to `compose.yaml`.

> **The trash window has no default in code.** `TrashWindow` binds the `TrashWindow` section and
> nothing else sets the number, so setting it to zero or below **fails startup** rather than
> quietly emptying every trash. The API publishes it at `GET /api/config`, which is how the UI can
> say "restorable for 30 days" and count each row down to its own expiry.

Defaults below are `appsettings.json`. The **Development** column is what the Quick start stack
actually runs with, since `appsettings.Development.json` overrides three of them:

| Setting                                                | Purpose                                                                                              | Default    | Development         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| `Jwt:Key`                                              | Signing key, **64 characters minimum** — validated on startup, not on first use                      | —          |                     |
| `Jwt:DurationInMinutes`                                | Access-token lifetime                                                                                | `15`       |                     |
| `Jwt:RefreshTokenDurationInDays`                       | Refresh-token lifetime                                                                               | `7`        |                     |
| `AuthProtection:WindowSeconds`                         | The window the two budgets below are measured over, and the `Retry-After` fallback                   | `60`       |                     |
| `AuthProtection:PermitPerWindow`                       | Requests per IP to login and register, per window                                                    | `10`       | **`200`**           |
| `AuthProtection:SessionPermitPerWindow`                | The looser budget for refresh, logout and `/me`, so session upkeep can't spend the login allowance   | `60`       | **`400`**           |
| `AuthProtection:MaxFailedAttempts` / `:LockoutMinutes` | Per-account lockout, per OWASP                                                                       | `5` / `15` |                     |
| `AuthProtection:TrustedProxyNetworks`                  | Proxy CIDRs whose `X-Forwarded-*` may be believed. **Empty switches forwarded headers off entirely** | `[]`       | **`10.99.0.10/32`** |
| `TrashWindow:Days`                                     | How long anything soft-deleted stays restorable — projects and tasks alike                           | `30`       |                     |
| `AllowedOrigins`                                       | CORS origins. **Required outside Development** — the API throws on startup without it                | —          | any origin          |

The dev budgets are raised because the e2e suite logs in on nearly every test from one container
address; don't read `10` as the limit you'll hit locally.

The trusted-proxy list and the compose network are a **silent pair**: `compose.yaml` pins the subnet
so the proxy can hold a fixed address, and `appsettings.Development.json` names exactly that address.
Change one and the other stops matching, with no error — everything just shares one rate-limit
partition again.

<details>
<summary><b>Running without containers</b> — the .NET SDK and Node directly</summary>

Requires the .NET 10 SDK (the version is pinned in `global.json`), Node 24, and a PostgreSQL 18 you
point `ConnectionStrings__DefaultConnection` at. Two terminals:

`proxy.conf.json` sends `/api` and `/health` to `http://api:8080` — a compose service name — so the
hostname has to resolve before the dev server can reach anything. Make it point at the loopback
rather than forking the proxy config, which is exactly what CI does:

```bash
echo "127.0.0.1 api" | sudo tee -a /etc/hosts

dotnet run --project backend                       # API on :8080
cd frontend-angular && npm install && npm start    # app on :4200 — open this one
```

The dev server then proxies both paths, so the single-origin contract holds here too. There is no
nginx in this mode, which is why `playwright.config.ts` defaults to `localhost:4200`.

This mode and compose cannot run at once: compose holds `127.0.0.1:8080` and `127.0.0.1:4200`, so
Kestrel and `ng serve` fail to bind. Worse quietly, the `127.0.0.1 api` line stays in `/etc/hosts`
afterwards — with compose up and the host API down, `proxy.conf.json` resolves `api:8080` to the
_containerized_ API, which has its own database and JWT key. Remove the line when you leave this
mode.

</details>

<details>
<summary><b>Adding a migration</b></summary>

`dotnet-ef` and `csharpier` are pinned in the repo's tool manifest, so restore them once and use the
manifest's version rather than whatever is installed globally:

```bash
dotnet tool restore
ConnectionStrings__DefaultConnection="Host=localhost;Database=app_db;Username=admin;Password=x" \
  dotnet dotnet-ef migrations add <Name> --project backend
```

The connection string only has to _exist_ — `AppDbContextFactory` instantiates the context without
connecting, which is what lets the tooling run without booting the web host or reaching a database.
Migrations apply automatically on API startup, ahead of seeding.

</details>

## Status

Actively developed. Workspaces, workspace-scoped access, tasks on a kanban board, recovery for
everything that can be deleted, the admin area, brute-force protection, the single-origin proxy and
the full CI pipeline are all in place.

What's deliberately not done yet, roughly in the order it's being attacked:

- **A production deployment target.** `compose.yaml` is dev-only — `dotnet watch`, `seccomp:unconfined`,
  a published database port. Production needs the backend Dockerfile's `final` stage, an SSR image,
  and a secrets story including a JWT key-rotation plan.
- **TLS and security headers.** No HTTPS redirect, HSTS or CSP anywhere. Deferring this in dev is
  deliberate: self-signed certs mean browser warnings and an `ignoreHTTPSErrors` flag in the
  Playwright config, which is friction with no payoff until `Secure` cookies are needed.
- **Rate limiting at the proxy.** The in-process limiter rejects only after a request reaches Kestrel,
  and its counters die with the process — a restart hands every attacker a fresh budget. A
  `limit_req` zone in nginx is complementary, and lands with the production config.
- **A sweeper, so the retention window is a deletion policy and not only a recovery one.** The
  window already filters every trash listing and refuses a restore past it, but nothing is destroyed
  without an admin clicking Purge — so a row the reader believes is gone at 30 days is retained until
  someone acts. That is a data-minimization problem before it is a storage one. The shape is a hosted
  service purging past-window rows, tasks before projects, because the FK is `Restrict`.
- **An audit log for admin actions.** Anonymizing a user and purging a project are irreversible, and
  the only trace today is a request log line that records the route but not the actor or the target.
- **The account lifecycle** — email confirmation, password reset, self-service email change.

The name is provisional.
