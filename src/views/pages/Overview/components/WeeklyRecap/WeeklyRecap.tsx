import { TrophyIcon } from "@primer/octicons-react";
import { Card, Flex, Skeleton, Text } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import { getLastCompletedWeekStart } from "../../../../../weeklyRecap/metrics";
import type { PersonalWeeklyRecap } from "../../../../../weeklyRecap/types";

const formatWeek = (weekStart: string, weekEnd: string) => {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(`${weekEnd}T12:00:00`);
  const month = new Intl.DateTimeFormat(undefined, { month: "short" });

  return start.getFullYear() === end.getFullYear()
    ? `${month.format(start)} ${start.getDate()} - ${month.format(end)} ${end.getDate()}, ${end.getFullYear()}`
    : `${month.format(start)} ${start.getDate()}, ${start.getFullYear()} - ${month.format(end)} ${end.getDate()}, ${end.getFullYear()}`;
};

const plural = (count: number, word: string, pluralWord = `${word}s`) =>
  `${count} ${count === 1 ? word : pluralWord}`;

const headline = ({ mergedCount, reviewedCount }: PersonalWeeklyRecap) => {
  if (mergedCount === 0 && reviewedCount === 0) {
    return "A quiet week";
  }
  if (mergedCount === 0) {
    return `${plural(reviewedCount, "review")} given`;
  }
  return `You shipped ${plural(mergedCount, "PR")}`;
};

const momentum = ({
  mergedCount,
  previousMergedCount,
}: PersonalWeeklyRecap) => {
  if (mergedCount === previousMergedCount) {
    return "Steady vs last week";
  }
  if (previousMergedCount === 0) {
    return mergedCount === 0
      ? "Steady vs last week"
      : `+${mergedCount} vs last week`;
  }
  const delta = mergedCount - previousMergedCount;
  return delta > 0 ? `+${delta} vs last week` : `${delta} vs last week`;
};

export const WeeklyRecap = () => {
  const [recap, setRecap] = useState<PersonalWeeklyRecap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.electronAPI.weeklyRecap
      .personal(getLastCompletedWeekStart())
      .then(setRecap)
      .catch(() =>
        setError(
          "Your weekly recap will appear here with PRs you merged and reviews you gave.",
        ),
      );
  }, []);

  const trend = recap ? momentum(recap) : null;

  return (
    <Flex direction="column">
      <Card
        className="accent-shadow-low"
        style={{
          background:
            "linear-gradient(135deg, var(--accent-a1), var(--accent-a4), var(--accent-a1))",
          width: "100%",
        }}
      >
        <Flex direction="column" gap="3">
          <Flex
            justify="between"
            align="center"
            style={{ color: "var(--accent-10)" }}
          >
            <Flex direction="column">
              <Text size="1" style={{ color: "var(--white-a11)" }}>
                Your week on CozyWatch
              </Text>
              {recap ? (
                <Text
                  size="5"
                  weight="bold"
                  style={{ color: "var(--accent-12)" }}
                >
                  {headline(recap)}
                </Text>
              ) : null}
            </Flex>
            <TrophyIcon size={20} />
          </Flex>
          {error ? (
            <Text size="2" color="gray">
              {error}
            </Text>
          ) : !recap ? (
            <Flex gap="3">
              <Skeleton height="62px" width="180px" />
              <Skeleton height="62px" width="120px" />
            </Flex>
          ) : (
            <Flex direction="column" gap="1">
              <Text size="2" style={{ color: "var(--gray-11)" }}>
                {formatWeek(recap.weekStart, recap.weekEnd)}
              </Text>
              <Text size="2" style={{ color: "var(--gray-11)" }}>
                {plural(recap.mergedCount, "PR")} merged across{" "}
                {plural(recap.repositoryCount, "repository", "repositories")},{" "}
                {plural(recap.reviewedCount, "review")} given
              </Text>
              {trend ? (
                <Text
                  size="2"
                  weight="medium"
                  style={{ color: "var(--accent-11)" }}
                >
                  {trend}
                </Text>
              ) : null}
            </Flex>
          )}
        </Flex>
      </Card>
    </Flex>
  );
};
