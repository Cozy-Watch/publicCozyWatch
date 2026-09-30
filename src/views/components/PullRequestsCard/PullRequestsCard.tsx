import { ChevronDownIcon, GitPullRequestIcon, RepoIcon } from "@primer/octicons-react";
import { Avatar, Badge, Flex, Text, Tooltip } from "@radix-ui/themes";
import { useId, useState } from "react";
import type { PullRequestList, PullsActions } from "../../../mainProcess/api/PullRequests/utils/getDefaultData";
import { LastActivity } from "../Review/components/LastActivity/LastActivity";
import { Review } from "../Review/Review";
import { BranchTitle } from "./components/BranchTitle/BranchTitle";
import { CIActions } from "./components/CIActions/CIActions";
import { Labels } from "./components/Labels/Labels";
import { LastUpdate } from "./components/LastUpdate/LastUpdate";
import { FeedbackTime } from "./components/FeedbackTime/FeedbackTime";
import { MergeInfo } from "./components/MergeInfo/MergeInfo";
import { MergePullRequestAction } from "../MergePullRequestAction/MergePullRequestAction";
import { RecentMention } from "./components/RecentMention/RecentMention";
import type { LatestMention } from "../../hooks/utils/getLatestMentions";

interface Props {
  isCompact?: boolean;
  pullRequest: PullRequestList[0];
  waitingReviews: number;
  reviewsGroupedbyUser?: Record<
    string,
    {
      state: string;
      userAvatar: string;
      userName: string;
      body: string;
      date: string;
      html_url?: string;
    }
  >;

  avatarUrl?: string;
  login?: string;

  title: string;
  htmlUrl: string;

  baseBranchName: string;
  branchName: string;
  repositoryName: string;

  updatedAt: string;
  latestFeedbackAt?: number;
  latestMention?: LatestMention;

  actionsByName: Record<string, PullsActions[0][]>;
  pullRequestLink: string;

  labels: {
    id: number;
    node_id: string;
    url: string;
    name: string;
    description: string;
    color: string;
    default: boolean;
  }[];

  assignees?: {
    login: string;
    name?: string | null;
    avatar: string;
  }[];
}

export const PullRequestCard = ({
  pullRequest,
  waitingReviews,
  reviewsGroupedbyUser,
  avatarUrl,
  login,
  title,
  htmlUrl,
  baseBranchName,
  branchName,
  repositoryName,
  updatedAt,
  latestFeedbackAt,
  latestMention,
  actionsByName,
  pullRequestLink,
  labels,
  assignees = [],
  isCompact = false,
}: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = useId();
  const titleId = useId();

  return (
    <article className="pr-card" data-density={isCompact ? "compact" : "standard"} aria-labelledby={titleId}>
      <div className="pr-card-meta">
        <div className="pr-card-repository" title={repositoryName}>
          <RepoIcon size={14} aria-hidden="true" />
          <span>{repositoryName}</span>
          <span className="pr-card-number">#{pullRequest.number}</span>
          <RecentMention mention={latestMention} />
        </div>
        {latestFeedbackAt ? (
          <FeedbackTime timestamp={latestFeedbackAt} />
        ) : (
          <LastUpdate updatedAt={updatedAt} />
        )}
      </div>

      <div className="pr-card-heading">
        <span className="pr-card-icon" data-draft={!!pullRequest.draft}>
          <GitPullRequestIcon size={20} aria-hidden="true" />
        </span>
        <h2 id={titleId}><BranchTitle title={title} htmlUrl={htmlUrl} /></h2>
        <Tooltip content={login ? `Opened by ${login}` : "Unknown author"}>
          <Avatar src={avatarUrl} fallback={login?.slice(0, 2) || "?"} size="2" radius="full" />
        </Tooltip>
      </div>

      <div className="pr-card-footer">
        <div className="pr-card-statuses">
          {pullRequest.draft && <Badge color="gray" variant="soft">Draft</Badge>}
          <Review reviewsGroupedbyUser={reviewsGroupedbyUser} waitingReviews={waitingReviews} />
          <CIActions actionsByName={actionsByName} pullRequestLink={pullRequestLink} />
        </div>
        <div className="pr-card-actions">
          <button
            type="button"
            className="pr-card-details-toggle"
            aria-expanded={isExpanded}
            aria-controls={detailsId}
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            Details <ChevronDownIcon size={14} aria-hidden="true" />
          </button>
          <MergePullRequestAction pullRequest={pullRequest} className="pr-card-merge" />
        </div>
      </div>

      <div id={detailsId} hidden={!isExpanded}>
        {isExpanded && (
          <div className="pr-card-details">
            <MergeInfo baseBranchName={baseBranchName} branchName={branchName} />
            <Labels items={labels} />
            {assignees.length > 0 && (
              <Flex align="center" gap="2" wrap="wrap">
                <Text size="1" color="gray">Assigned to</Text>
                {assignees.map(({ login, name, avatar }) => (
                  <Tooltip key={login} content={name || login}>
                    <Flex align="center" gap="1">
                      <Avatar src={avatar} fallback={login.slice(0, 2)} size="1" radius="full" />
                      <Text size="1">{login}</Text>
                    </Flex>
                  </Tooltip>
                ))}
              </Flex>
            )}
            <LastActivity reviewsGroupedbyUser={reviewsGroupedbyUser} pullRequestUrl={htmlUrl} inline />
          </div>
        )}
      </div>
    </article>
  );
};
