# Package 1 baseline — 2026-09-10

## Conclusion

The existing experimental edits improve conditional review responses and some
cold-load scenarios, but do **not** reduce request volume. The repeated reported
workload shows essentially unchanged warm-refresh and approval-publication time.
There is no evidence here for the earlier suggested 2× overall speedup.

No production behavior was changed as part of package 1. The next package is
repository identity/cache isolation, followed by pagination/cache correctness.

## Comparison setup

- Committed source: `60d6d607909b62f4e8d05f458dd0bae8611e038b`.
- Experimental source: same commit plus the pre-existing edits to
  `registerPullListReviews.ts` and `getPullRequestQuery.ts`.
- Production diff SHA-256:
  `614146b10739c4c24965250b7cc430f86ee831b40eb0a79f54e1a2f9eedb77d8`.
- Lockfile SHA-256:
  `1f97d60cf44ff974fe76836ea356ffae5cb45b264dc94f7dfedcdb8771a9709d`.
- Node 22.13.1, macOS arm64; locked Octokit throttling 11.0.5.
- Artificial HTTP latency: 20 ms per call. Real client, parsing, fixture creation,
  cache processing and mocked persistence/publication cloning still take time.
- The reported scenario uses 158 PRs in the core repository and **assumes** 10 PRs
  in each of the other five repositories: 208 total.

These are local synthetic measurements, not predicted timings for Dmytro's
network or the app's actual screen. See [harness boundaries](README.md).

## Reported workload: three sequential paired runs

Times below are medians of three runs. Requests are identical in both versions.

| Phase | Requests | Committed total | Experimental total | Committed first publication | Experimental first publication |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cold PR cache | 439 | 1,911 ms | 1,552 ms | 1,897 ms | 1,539 ms |
| Unchanged refresh | 429 | 1,461 ms | 1,470 ms | 1,447 ms | 1,453 ms |
| Approval changed; PR metadata unchanged | 429 | 1,459 ms | 1,464 ms | 1,439 ms | 1,446 ms |

Total-duration ranges, committed versus experimental:

- Cold: 1,803–1,973 ms versus 1,549–1,594 ms.
- Unchanged: 1,354–1,535 ms versus 1,400–1,479 ms.
- Approval: 1,407–1,526 ms versus 1,415–1,493 ms.

The cold median improved about 19% in this fixture. The warm/approval differences
are within the observed run variation. The approval is published in the only
snapshot, after the whole refresh; this excludes the wait until the next poll.

On unchanged refreshes, the experiment returned 428 `304`s out of 429 requests,
versus 225 in these committed runs. The baseline's shared review ETags make its
exact match count completion-order dependent. All three polls still issue a call
for each PR's reviews and comments. Observed HTTP concurrency stayed at or below
10; separate application queues did not produce 45 simultaneous HTTP calls.

## Larger profiles: one paired run each

These are exploratory timings, not repeat-sampled speedup estimates.

| Profile / phase | Open PRs | Requests (both) | Committed total | Experimental total |
| --- | ---: | ---: | ---: | ---: |
| 20 repositories / cold | 1,000 | 2,050 | 6.270 s | 6.061 s |
| 20 repositories / unchanged | 1,000 | 2,041 | 5.672 s | 5.638 s |
| Dense core repository / cold | 1,050 | 2,131 | 8.185 s | 6.788 s |
| Dense core repository / unchanged | 1,050 | 2,113 | 6.971 s | 5.784 s |
| 100 repositories / cold | 10,000 | 20,210 | 59.458 s | 61.285 s |
| 100 repositories / unchanged | 10,000 | 20,201 | 61.412 s | 60.353 s |

The dense profile puts 1,000 PRs in one repository, plus 10 in each of five others.
The 10,000-PR profile distributes 100 PRs per repository. Both retain all expected
open PRs in the returned list. This does **not** imply all detail caches are correct.

Normal mock quota is fixed rather than consumed. The 20,000+ calls demonstrate
request demand; a successful synthetic run must not be presented as proof of
real GitHub quota compatibility. Workflow history is capped at the modeled API's
1,000 filtered results per repository.

## Correctness observations

The real pipeline reproduced these issues without altering its implementation:

- With 101 reviews across two HTTP pages, only the last review remains cached.
- Later workflow pages displace the newest workflow runs in the 100-entry cache.
- Refresh hooks accumulate: 8, 16 and 24 registrations after three polls.
- Slow comments hold up the only published snapshot.
- A comments `500` is swallowed while other data is returned.

Separate tests verify that low quota returns cached data without detail calls,
the real plugin retries primary/secondary rate limits, secondary retry respects
`Retry-After`, and unmodeled endpoints cannot escape to the network.

## Verification and artifacts

- Default refresh suite: 8 passing checks, one opt-in scale check skipped.
- Both source variants exercised at all three optional scale profiles.
- Existing unit suite: 66 passing tests across 13 suites.
- Type checking and repository-wide lint pass.
- CI now runs `npm run test:refresh`; no live GitHub credentials are needed.

Local ignored JSON reports are under `.cache/refresh/`: the six
`reported-{baseline,working-tree}-{1,2,3}.json` files supply the repeated table;
`{organisation,dense,stress}-{baseline,working-tree}.json` supply the scale table.
The [README](README.md) documents commands to regenerate them. These generated
files are not required to run tests and are not committed artifacts.
