export const FIXTURE_DATE = "2026-09-01T12:00:00Z";
const API = "https://api.github.com";
const WEB = "https://github.com";

export interface RepositoryFixture {
  id: number;
  owner: string;
  name: string;
  openPulls: number;
  workflowRuns: number;
  reviewsPerPull: number;
  commentsPerPull: number;
}

export const userFixture = (id = 1) => ({
  id, login: `engineer-${id}`, node_id: `user-${id}`, type: "User",
  avatar_url: `${WEB}/avatars/${id}`, gravatar_id: "", site_admin: false,
  url: `${API}/users/engineer-${id}`, html_url: `${WEB}/engineer-${id}`,
  followers_url: `${API}/users/engineer-${id}/followers`,
  following_url: `${API}/users/engineer-${id}/following{/other_user}`,
  gists_url: `${API}/users/engineer-${id}/gists{/gist_id}`,
  starred_url: `${API}/users/engineer-${id}/starred{/owner}{/repo}`,
  subscriptions_url: `${API}/users/engineer-${id}/subscriptions`,
  organizations_url: `${API}/users/engineer-${id}/orgs`,
  repos_url: `${API}/users/engineer-${id}/repos`,
  events_url: `${API}/users/engineer-${id}/events{/privacy}`,
  received_events_url: `${API}/users/engineer-${id}/received_events`,
});

export const repositoryFixture = (repo: RepositoryFixture) => ({
  id: repo.id, node_id: `repo-${repo.id}`, name: repo.name,
  full_name: `${repo.owner}/${repo.name}`, private: true, fork: false,
  owner: { ...userFixture(500), login: repo.owner },
  url: `${API}/repos/${repo.owner}/${repo.name}`,
  html_url: `${WEB}/${repo.owner}/${repo.name}`,
  description: "Synthetic repository; no customer data", default_branch: "main",
});

export const pullFixture = (repo: RepositoryFixture, number: number) => {
  const repository = repositoryFixture(repo);
  const url = `${repository.url}/pulls/${number}`;
  const htmlUrl = `${repository.html_url}/pull/${number}`;
  const branch = { repo: repository, user: repository.owner, sha: `sha-${repo.id}-${number}` };
  return {
    id: repo.id * 100000 + number, node_id: `pull-${repo.id}-${number}`, number,
    url, html_url: htmlUrl, diff_url: `${htmlUrl}.diff`, patch_url: `${htmlUrl}.patch`,
    issue_url: `${repository.url}/issues/${number}`, title: `Synthetic PR ${number}`,
    body: "Generated refresh workload", state: "open", locked: false, draft: false,
    user: userFixture(), assignee: null, assignees: [], requested_reviewers: [userFixture(2)],
    requested_teams: [], labels: [], milestone: null, active_lock_reason: null,
    created_at: "2024-01-01T00:00:00Z", updated_at: FIXTURE_DATE,
    closed_at: null, merged_at: null, merge_commit_sha: null,
    base: { ...branch, ref: "main", label: `${repo.owner}:main` },
    head: { ...branch, ref: `feature-${number}`, label: `${repo.owner}:feature-${number}` },
    comments_url: `${repository.url}/issues/${number}/comments`,
    review_comments_url: `${url}/comments`, review_comment_url: `${url}/comments{/number}`,
    commits_url: `${url}/commits`, statuses_url: `${repository.url}/statuses/${branch.sha}`,
    author_association: "MEMBER", auto_merge: null,
    _links: Object.fromEntries(["self", "html", "issue", "comments", "review_comments", "review_comment", "commits", "statuses"]
      .map((key) => [key, { href: url }])),
  };
};

export const reviewFixture = (repo: RepositoryFixture, pull: number, index: number, state = "COMMENTED") => ({
  id: index + 1, node_id: `review-${repo.id}-${pull}-${index}`, user: userFixture(index + 2),
  body: "Synthetic review", state, submitted_at: FIXTURE_DATE,
  html_url: `${WEB}/${repo.owner}/${repo.name}/pull/${pull}#pullrequestreview-${index + 1}`,
  pull_request_url: `${API}/repos/${repo.owner}/${repo.name}/pulls/${pull}`,
  commit_id: `sha-${repo.id}-${pull}`, author_association: "MEMBER",
  _links: { html: { href: `${WEB}/${repo.owner}/${repo.name}/pull/${pull}` },
    pull_request: { href: `${API}/repos/${repo.owner}/${repo.name}/pulls/${pull}` } },
});

export const commentFixture = (repo: RepositoryFixture, pull: number, index: number) => ({
  id: index + 1, node_id: `comment-${repo.id}-${pull}-${index}`, user: userFixture(2),
  body: "Synthetic comment", created_at: FIXTURE_DATE, updated_at: FIXTURE_DATE,
  url: `${API}/repos/${repo.owner}/${repo.name}/issues/comments/${index + 1}`,
  html_url: `${WEB}/${repo.owner}/${repo.name}/pull/${pull}#issuecomment-${index + 1}`,
  issue_url: `${API}/repos/${repo.owner}/${repo.name}/issues/${pull}`,
  author_association: "MEMBER",
});

export const workflowFixture = (repo: RepositoryFixture, index: number) => ({
  id: repo.id * 100000 + index, node_id: `run-${repo.id}-${index}`, name: "CI",
  workflow_id: 1, run_number: repo.workflowRuns - index, event: "pull_request",
  status: "completed", conclusion: "success", head_branch: "feature-1", head_sha: `sha-${repo.id}-1`,
  created_at: new Date(Date.parse(FIXTURE_DATE) - index * 86400000).toISOString(),
  updated_at: new Date(Date.parse(FIXTURE_DATE) - index * 86400000).toISOString(),
  url: `${API}/repos/${repo.owner}/${repo.name}/actions/runs/${index}`,
  html_url: `${WEB}/${repo.owner}/${repo.name}/actions/runs/${index}`,
  pull_requests: [{ id: repo.id * 100000 + 1, number: 1 }],
  repository: repositoryFixture(repo), head_repository: repositoryFixture(repo),
});

export const createProfile = (profile: "reported" | "organisation" | "stress" | "dense" | "small") => {
  const count = { reported: 6, organisation: 20, stress: 100, dense: 6, small: 1 }[profile];
  return Array.from({ length: count }, (_, index): RepositoryFixture => ({
    id: index + 1, owner: "synthetic-company", name: `service-${index + 1}`,
    openPulls: profile === "reported" ? (index === 0 ? 158 : 10)
      : profile === "dense" ? (index === 0 ? 1000 : 10)
      : { organisation: 50, stress: 100, small: 3 }[profile],
    workflowRuns: index === 0 ? 1000 : 100,
    reviewsPerPull: 1, commentsPerPull: 1,
  }));
};
