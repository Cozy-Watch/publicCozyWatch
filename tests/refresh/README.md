# Refresh reproduction and approval-delta tests

This suite covers the package 1 characterization and package 2 approval delta. It executes the real
`getPullRequests` entry point, query orchestration, pagination, request hooks,
cache/diff helpers, PAT client initialization and the locked Octokit throttling
plugin. It requires no PAT, GitHub account, cloned repository or running Electron.

Only desktop side effects, credential/persistent storage, and HTTP are mocked.
The Electron testing boundary keeps main-process business logic real. `ipcMain`
is an in-process event emitter; this is **not** a renderer or IPC end-to-end test.
Package 1's historical measurements remain in `BASELINE.md`. Package 2 preserves
the earlier work and adds a review sweep plus the coordinator and regression tests.

## Package 2: REST approval delta

The scheduler starts with the full refresh, then runs review sweeps on 60-second
start-to-start intervals and full refreshes at five minutes. A busy full/manual
refresh blocks the sweep; long requests skip missed sweep slots without a catch-up
storm. If a full refresh takes five minutes or longer, the next automatic full
refresh is scheduled five minutes after completion so sweeps can run in between.
Sign-out/stop invalidates pending work. Rate-limit backoff applies to manual
refreshes too. These are scheduling targets, not guaranteed detection deadlines.

The sweep reads every enabled repository's open-PR list pages, compares metadata,
and checks at most 100 changed, already-known PRs (newest update first, repository
ID and PR number as tie-breakers). Deferred/failed items survive list 304s. Reviews
are aggregated across pages; at most 200 review-page requests run in a sweep and
incomplete PRs retain their last good data for retry/full reconciliation. HTTP
concurrency is four, with the existing Octokit throttling/retries still active.

For the reported 208-PR fixture, an unchanged sweep issues seven list requests and
one quota check. A changed approval adds one review request: **9 total**, compared
with the existing full refresh's **429**. This is a difference in request count for
different jobs, not a claim of a 48× wall-clock improvement. The full refresh still
fetches comments and CI and detects approvals whose metadata never changed.

The quota reserve estimates the next full refresh from cached PR/review/comment
counts, ten workflow pages per repository, 25% headroom and 100 spare requests.
The sweep stops dispatching when its budget is exhausted or response quota drops.
This is a conservative estimate, not a guarantee about newly grown data or other
apps sharing the token. List work still scales with open-PR pages: only review
fanout is capped. A 10,000-PR profile skips the sweep with a normal 5,000 quota;
the traversal test separately uses synthetic capacity to verify bounded fanout.

The legacy persisted cache uses repository names. To avoid adding cross-owner
cache writes, the sweep excludes ambiguous same-named repositories. Their existing
full-refresh behavior is unchanged; repository identity migration remains future work.
New/closed PR membership and comments/CI stay owned by the full refresh. Reviews
and requested-reviewer updates publish through the existing shared snapshot IPC.

Full review reconciliation now aggregates all pages, continues past a first-page
304 and replaces empty review lists. Review validators live with their complete
response bodies in a client-scoped memory cache, so the first full refresh after
restart re-fetches review bodies. Warm full refreshes retain conditional requests.
Conditional responses use fresh pagination links, including newly appended pages.
If a 304 omits Link on a full 100-item page, both review reconciliation and the PR
list sweep probe the next page; this can add an empty-page request at a boundary.
Both paths use the same notification formatter and respect the separate new-review
and changed-review preferences.

```sh
npm run test:refresh -- --silent delta.test.ts
npm test -- --runInBand --silent src/mainProcess/polling
```

The delta suite includes 1,000- and 10,000-PR seeded snapshots, failed later pages,
permission/offline/quota recovery, in-flight cancellation and repository disabling,
full/manual overlap, notification deduplication and metadata-independent fallback.
Scheduler tests use a fake clock to validate the minute/five-minute cadence and
ensure successful or failed overlong full refreshes do not starve sweeps.
Synthetic timings exclude live GitHub propagation, encrypted storage and renderer
paint. A live PAT smoke test is still required to assess typical approval detection
latency: approve a known PR, observe its next sweep, then exercise dismissal and
re-request. Do not describe 60 seconds or five minutes as an SLA.

## Run

Use the project's Node 22 version and install the locked dependencies. Install
scripts can be disabled for these Node-only tests:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:refresh
npm run types
npm run lint
npm test -- --runInBand
```

The normal unit suite is unchanged. CI runs this additional suite explicitly.
The dedicated Jest transform compiles the real ESM dependencies to CommonJS for
the project's Node/Jest combination; it does not replace Octokit or Bottleneck.

Compare against committed production sources without overwriting the worktree:

```sh
COZYWATCH_REFRESH_BASELINE=60d6d607909b62f4e8d05f458dd0bae8611e038b COZYWATCH_REFRESH_REPORT=.cache/refresh/baseline.json npm run test:refresh
COZYWATCH_REFRESH_REPORT=.cache/refresh/working-tree.json npm run test:refresh
```

The transform reads **all imported production files under `src/`** from the
specified commit using `git show`, in memory. Tests, dependencies and configuration
are the same for both runs. It resolves the commit once and includes it in the
transform cache key. `HEAD` is also accepted, but use a pinned commit for a durable
comparison. These initial characterization assertions target the above commit and
the current experimental edits; arbitrary older/newer revisions may differ.

Run timing comparisons sequentially, not alongside other benchmarks. Repeat the
reported scenario to distinguish noise from improvement:

```sh
COZYWATCH_REFRESH_REPORT=.cache/refresh/repeat.json npm run test:refresh -- -t 'reported workload'
```

JSON reports are optional and ignored by Git when stored under `.cache/`. Only use
a report when its test command exits successfully; a failing run may leave a
partial report. Reports identify the commit, production diff, lockfile, runtime,
platform and per-scenario observations. No credentials or customer content are
recorded. Dependency versions remain those of the installed lockfile, even when
replaying old production source; this is not a historical binary benchmark.

## Workloads

| Profile | Repositories | Open PRs | Detail/history assumptions |
| --- | ---: | ---: | --- |
| `reported` | 6 | 208 | Main repo 158; **assumed** 10 in each smaller repo |
| `organisation` | 20 | 1,000 | 50 PRs per repo |
| `dense` | 6 | 1,050 | 1,000 PRs in one repo; 10 in each smaller repo |
| `stress` | 100 | 10,000 | 100 PRs per repo |
| pagination scenario | 1 | 1 | 101 reviews, 101 comments, 201 workflow runs |

Scale profiles default to one review and comment per PR, 1,000 workflow runs in
the first repository and 100 in each other repository. Fixtures are generated
on demand, with fixed dates, IDs and content. They provide the fields exercised by
this pipeline; they are not a comprehensive GitHub OpenAPI conformance fixture.

Opt into larger profiles, optionally combined with `COZYWATCH_REFRESH_BASELINE`:

```sh
COZYWATCH_REFRESH_PROFILE=organisation COZYWATCH_REFRESH_REPORT=.cache/refresh/organisation.json npm run test:refresh -- -t 'opt-in'
COZYWATCH_REFRESH_PROFILE=dense COZYWATCH_REFRESH_REPORT=.cache/refresh/dense.json npm run test:refresh -- -t 'opt-in'
COZYWATCH_REFRESH_PROFILE=stress COZYWATCH_REFRESH_REPORT=.cache/refresh/stress.json npm run test:refresh -- -t 'opt-in'
```

The mock serves real `Link` pagination headers, JSON bodies, final response URLs,
ETags and `304` responses. Unknown endpoints, origins, methods and query parameters
fail closed; there is no live-network fallback. When a later package introduces
a filter, model and test its actual semantics here before measuring it.

We do not generate the reported 48k commits or 32k closed PRs: the current PR list
requests `state=open` and does not traverse commits. Workflow history is generated
because that endpoint **is** requested. Filtered workflow pagination models the
[GitHub 1,000-result cap](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository).

## Measurements and limitations

- Request count, operation breakdown, response-body bytes, conditional requests,
  `304` count, and maximum active mocked HTTP calls.
- First published snapshot, first published approval, total refresh duration,
  snapshot count, and cumulative request-hook registrations.
- Default HTTP delay: 20 ms **per call**, plus real fixture, parsing, scheduling,
  cache and notification-diff overhead. The slow-comments scenario uses 150 ms.
- Timing is observational. Tests assert counts, ordering and bounds, not a claimed
  end-user speedup. The secondary-limit test checks the protocol's one-second wait.
- Approval timing begins when a refresh is explicitly invoked after injecting an
  approval. It **excludes polling wait, GitHub propagation and screen rendering**.
- User/repository metadata and authentication are primed before measurement. Cold
  means an empty **PR** cache, not first launch/account onboarding.
- Storage uses in-memory clones, not encrypted disk writes. No renderer paint,
  Electron startup, CPU/memory SLA, or end-to-end menubar latency is measured.
- Normal quota is fixed at 5,000 remaining to expose the complete workload.
  **It is not decremented per request.** Large successful mock runs do not prove
  the workload fits GitHub's real quota. Separate cases inject low quota, a primary
  `429`, a secondary `403` with `Retry-After`, and a comments endpoint `500`.
- Successful retries are real plugin retries. The primary reset timestamp is
  deliberately in the past to avoid waiting an hour in a test. Fake desktop and
  storage modules cannot read a real token or send a real notification.

## Historical characterization and remaining defects

The tests retain the historical baseline while asserting package 2's corrected review behavior:

1. The current refresh publishes the PR list first, followed by the completed
   detail snapshot. Renderer startup now reads the existing shared snapshot before
   either publication and does not initiate GitHub I/O.
2. The baseline registered eight hooks per poll. The current full refresh registers
   six (6, 12, 18 after three polls); non-review hook accumulation remains unresolved.
   The approval sweep registers no request hooks.
3. The original committed baseline shares review ETags across PRs. Accidental `304` matches
   depend on completion order; tests assert bounds rather than an exact count.
4. The baseline replaced page one of reviews with page two. Package 2 now retains
   all 101 reviews, tests later-page changes after a first-page 304, and replaces
   emptied review lists. Comments retain both pages as before.
5. Later workflow pages displace the newest runs from the 100-entry cache.
6. A comments `500` is swallowed while the refresh still returns other data.

As later packages fix these defects, replace the characterization assertions with
the intended correctness guarantees. Do not preserve a bug just to keep this suite
green. Other planned regressions (same-name repositories, forks, deletion, polling
lifecycle, snapshot races) belong to their implementation packages.
