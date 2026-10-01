import { Badge, Button, Flex, TabNav } from "@radix-ui/themes";
import { Link, useLocation } from "@tanstack/react-router";
import { usePullRequest } from "../../../../hooks/usePullRequests";

const MAX_BADGE_COUNT = 99;

const formatCount = (count: number) =>
  count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : count;

const CountBadge = ({
  count,
  isLoading,
}: {
  count?: number;
  isLoading: boolean;
}) => {
  if (count === undefined && !isLoading) return null;

  return (
    <Badge ml="1" size="1" variant="solid" className="navigation-count-badge">
      {count === undefined ? "…" : formatCount(count)}
    </Badge>
  );
};

type PullRequestScope = "my" | "relevant";
type PullRequestFilter =
  | "all"
  | "fullyApproved"
  | "pendingReviews"
  | "reviewed";

const getPullRequestScope = (pathname: string): PullRequestScope | null => {
  if (pathname === "/myPullRequests" || pathname.startsWith("/myPullRequests/")) {
    return "my";
  }

  if (
    pathname === "/teamPullRequest" ||
    pathname.startsWith("/teamPullRequest/")
  ) {
    return "relevant";
  }

  return null;
};

const getPullRequestFilter = (pathname: string): PullRequestFilter => {
  if (pathname.endsWith("/fullyApproved")) return "fullyApproved";
  if (pathname.endsWith("/pendingReviews")) return "pendingReviews";
  if (pathname.endsWith("/reviewed")) return "reviewed";
  return "all";
};

const getFilterPath = (
  scope: PullRequestScope,
  filter: PullRequestFilter,
) => {
  const basePath = scope === "my" ? "/myPullRequests" : "/teamPullRequest";
  if (filter === "all") return basePath;
  return `${basePath}/${filter}` as
    | "/myPullRequests/fullyApproved"
    | "/myPullRequests/pendingReviews"
    | "/myPullRequests/reviewed"
    | "/teamPullRequest/fullyApproved"
    | "/teamPullRequest/pendingReviews"
    | "/teamPullRequest/reviewed";
};

interface ApplicationNavigationProps {
  className?: string;
}

export const ApplicationNavigation = ({
  className,
}: ApplicationNavigationProps) => {
  const { pathname } = useLocation();
  const { data, isFetching } = usePullRequest();
  const scope = getPullRequestScope(pathname);
  const filter = getPullRequestFilter(pathname);
  const isMyPullRequests = scope === "my";
  const isRelevantPullRequests = scope === "relevant";
  const mentionsCount = data
    ? data.mentionsInMyPr.length + data.mentionsInTeamsPr.length
    : undefined;
  const filters =
    scope === "my"
      ? [
          { value: "all" as const, label: "All", count: data?.myPullRequests.length },
          {
            value: "fullyApproved" as const,
            label: "Fully Approved",
            count: data?.fullyApproved.length,
          },
          {
            value: "pendingReviews" as const,
            label: "Pending Review",
            count: data?.waitingReview.length,
          },
          { value: "reviewed" as const, label: "Reviewed", count: data?.reviewed.length },
        ]
      : scope === "relevant"
        ? [
            {
              value: "all" as const,
              label: "All",
              count: data?.teamPullRequests.length,
            },
            {
              value: "pendingReviews" as const,
              label: "Awaiting My Review",
              count: data?.waitingMyReview.length,
            },
            {
              value: "fullyApproved" as const,
              label: "Fully Approved",
              count: data?.teamFullyApproved.length,
            },
            {
              value: "reviewed" as const,
              label: "Reviewed by Me",
              count: data?.reviewedByMe.length,
            },
          ]
        : [];

  return (
    <Flex className={`desktop-classic-navigation ${className ?? ""}`} direction="column" flexShrink="0">
      <TabNav.Root className="desktop-classic-tabs" aria-label="Primary navigation" size="2">
        <TabNav.Link asChild active={pathname === "/overview"}>
          <Link className="desktop-classic-tab" to="/overview" aria-current={pathname === "/overview" ? "page" : undefined}>
            Overview
          </Link>
        </TabNav.Link>
        <TabNav.Link asChild active={isMyPullRequests}>
          <Link className="desktop-classic-tab" to="/myPullRequests" aria-current={isMyPullRequests ? "page" : undefined}>
            My Pull Requests
            <CountBadge count={data?.myPullRequests.length} isLoading={isFetching} />
          </Link>
        </TabNav.Link>
        <TabNav.Link asChild active={isRelevantPullRequests}>
          <Link className="desktop-classic-tab" to="/teamPullRequest" aria-current={isRelevantPullRequests ? "page" : undefined}>
            Relevant Pull Requests
            <CountBadge count={data?.teamPullRequests.length} isLoading={isFetching} />
          </Link>
        </TabNav.Link>
        <TabNav.Link asChild active={pathname === "/mentions"}>
          <Link className="desktop-classic-tab" to="/mentions" aria-current={pathname === "/mentions" ? "page" : undefined}>
            Mentions
            <CountBadge count={mentionsCount} isLoading={isFetching} />
          </Link>
        </TabNav.Link>
      </TabNav.Root>

      {scope && (
        <Flex className="desktop-classic-filters" aria-label="Pull request filters" gap="2" role="group" wrap="nowrap" p="3">
          {filters.map(({ count, label, value }) => {
            const isActive = filter === value;

            return (
              <Button
                key={value}
                asChild
                aria-pressed={isActive}
                radius="full"
                size="1"
                variant={isActive ? "solid" : "soft"}
              >
                <Link to={getFilterPath(scope, value)}>
                  {label}
                  <CountBadge count={count} isLoading={isFetching} />
                </Link>
              </Button>
            );
          })}
        </Flex>
      )}
    </Flex>
  );
};
