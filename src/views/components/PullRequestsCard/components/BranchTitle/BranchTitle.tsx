import { LinkExternalIcon } from "@primer/octicons-react";
import { GitHubLink } from "../../../ActivityContent/GitHubLink";

interface Props {
  title: string;
  htmlUrl: string;
}

export const BranchTitle = ({ title, htmlUrl }: Props) => (
  <GitHubLink href={htmlUrl} className="pr-card-title">
    <span>{title}</span>
    <LinkExternalIcon size={14} aria-hidden="true" />
  </GitHubLink>
);
