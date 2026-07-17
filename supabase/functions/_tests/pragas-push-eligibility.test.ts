import { assertEquals } from "@std/assert";
import { resolveEligibleTargetUserIds } from "../pragas-send-push/eligibility.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GENERATED_PROFILE_ID = "22222222-2222-4222-8222-222222222222";

function activeRows() {
  return {
    links: [{ user_id: USER_ID }],
    profiles: [{ id: GENERATED_PROFILE_ID, user_id: USER_ID }],
    subscriptions: [{ user_id: USER_ID }],
    deletions: [],
  };
}

Deno.test("push eligibility uses profile user_id when the row id is generated", () => {
  assertEquals(
    [...resolveEligibleTargetUserIds([USER_ID], activeRows())],
    [USER_ID],
  );
});

Deno.test("push eligibility remains fail-closed across every app-access gate", () => {
  const rows = activeRows();
  assertEquals([...resolveEligibleTargetUserIds([USER_ID], { ...rows, links: [] })], []);
  assertEquals([...resolveEligibleTargetUserIds([USER_ID], { ...rows, profiles: [] })], []);
  assertEquals([...resolveEligibleTargetUserIds([USER_ID], { ...rows, subscriptions: [] })], []);
  assertEquals(
    [...resolveEligibleTargetUserIds([USER_ID], {
      ...rows,
      deletions: [{ user_id: USER_ID, status: "requested" }],
    })],
    [],
  );
  assertEquals(
    [...resolveEligibleTargetUserIds([USER_ID], {
      ...rows,
      deletions: [{ user_id: USER_ID, status: "reactivated" }],
    })],
    [USER_ID],
  );
});
