interface UserIdRow {
  user_id: unknown;
}

interface ProfileRow extends UserIdRow {
  id?: unknown;
}

interface DeletionRow extends UserIdRow {
  status: unknown;
}

export interface PragasPushEligibilityRows {
  links: readonly UserIdRow[];
  profiles: readonly ProfileRow[];
  subscriptions: readonly UserIdRow[];
  deletions: readonly DeletionRow[];
}

export function resolveEligibleTargetUserIds(
  targetUserIds: readonly string[],
  rows: PragasPushEligibilityRows,
): Set<string> {
  const linkIds = new Set(rows.links.map((row) => String(row.user_id)));
  const profileIds = new Set(rows.profiles.map((row) => String(row.user_id)));
  const subscriptionIds = new Set(rows.subscriptions.map((row) => String(row.user_id)));
  const blockedIds = new Set(
    rows.deletions
      .filter((row) => row.status !== "reactivated")
      .map((row) => String(row.user_id)),
  );
  return new Set(
    targetUserIds.filter((id) =>
      linkIds.has(id) && profileIds.has(id) && subscriptionIds.has(id) && !blockedIds.has(id)
    ),
  );
}
