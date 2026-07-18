import { assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import {
  isCompletePragasExportManifest,
  PRAGAS_LOCATION_CONSENT_DECISION_RETENTION_ROWS,
  PRAGAS_LOCATION_CONSENT_DECISIONS_EXPORT_COLUMNS,
  PRAGAS_LOCATION_PREFERENCES_EXPORT_COLUMNS,
  PRAGAS_USER_DATA_EXPORT_MAX_RESPONSE_BYTES,
  PRAGAS_USER_DATA_EXPORT_MAX_ROWS_PER_DATASET,
  PRAGAS_USER_DATA_EXPORT_MAX_TOTAL_ROWS,
  PRAGAS_USER_DATA_EXPORT_MEMBERSHIP_CUTOFF,
  PRAGAS_USER_DATA_EXPORT_PAGINATION,
  PRAGAS_USER_DATA_EXPORT_SCHEMA_VERSION,
} from "../_shared/user-data-export-contract.ts";

const COMPLETE_CONSISTENCY = {
  snapshotAt: "2026-07-14T12:00:00.000Z",
  pagination: PRAGAS_USER_DATA_EXPORT_PAGINATION,
  membershipCutoff: PRAGAS_USER_DATA_EXPORT_MEMBERSHIP_CUTOFF,
  accountStateRevalidated: true,
} as const;

Deno.test("shared user-data export v2 fixture matches the backend contract", async () => {
  const fixture = JSON.parse(
    await Deno.readTextFile(
      new URL("../../../contracts/pragas-user-data-export-v2.json", import.meta.url),
    ),
  ) as Record<string, unknown>;
  assertEquals(fixture.schemaVersion, PRAGAS_USER_DATA_EXPORT_SCHEMA_VERSION);
  assertEquals(fixture.app, "rumo-pragas");
  assertEquals(isCompletePragasExportManifest(fixture.manifest), true);

  const manifest = fixture.manifest as Record<string, unknown>;
  const includedColumns = manifest.includedColumns as Record<string, unknown>;
  assertEquals(
    includedColumns.preferences,
    [...PRAGAS_LOCATION_PREFERENCES_EXPORT_COLUMNS],
  );
  assertEquals(
    includedColumns.locationConsentDecisions,
    [...PRAGAS_LOCATION_CONSENT_DECISIONS_EXPORT_COLUMNS],
  );

  const data = fixture.data as Record<string, unknown>;
  assertEquals(data.preferences, []);
  assertEquals(data.locationConsentDecisions, []);

  const retention = (manifest.retentionWindows as Record<string, unknown>)
    .locationConsentDecisions as Record<string, unknown>;
  assertEquals(retention.maximumRowsPerUser, PRAGAS_LOCATION_CONSENT_DECISION_RETENTION_ROWS);
  assertEquals(retention.ordering, "created_at DESC, decision_id DESC");
  assertEquals(retention.currentStateDataset, "preferences");
});

Deno.test("location consent export is explicit, bounded and excludes internal-only fields", async () => {
  assertEquals(PRAGAS_USER_DATA_EXPORT_MAX_ROWS_PER_DATASET, 10_000);
  assertEquals(PRAGAS_USER_DATA_EXPORT_MAX_TOTAL_ROWS, 25_000);
  assertEquals(PRAGAS_USER_DATA_EXPORT_MAX_RESPONSE_BYTES, 20 * 1024 * 1024);

  assertEquals([...PRAGAS_LOCATION_CONSENT_DECISIONS_EXPORT_COLUMNS], [
    "user_id",
    "decision_id",
    "observed_revision",
    "applied_revision",
    "share_location",
    "purpose",
    "consented_at",
    "outcome",
    "resulting_share_location",
    "created_at",
  ]);
  for (const internalField of ["request_hash", "jwt", "access_token", "updated_at"]) {
    assertFalse(
      (PRAGAS_LOCATION_CONSENT_DECISIONS_EXPORT_COLUMNS as readonly string[]).includes(
        internalField,
      ),
    );
  }

  assertEquals(
    isCompletePragasExportManifest({
      complete: true,
      truncated: false,
      totalRows: PRAGAS_USER_DATA_EXPORT_MAX_TOTAL_ROWS + 1,
      totalBytes: 0,
      consistency: COMPLETE_CONSISTENCY,
    }),
    false,
  );
  assertEquals(
    isCompletePragasExportManifest({
      complete: true,
      truncated: false,
      totalRows: 0,
      totalBytes: PRAGAS_USER_DATA_EXPORT_MAX_RESPONSE_BYTES + 1,
      consistency: COMPLETE_CONSISTENCY,
    }),
    false,
  );

  const source = await Deno.readTextFile(
    new URL("../pragas-export-user-data/index.ts", import.meta.url),
  );
  assertStringIncludes(source, 'key: "locationConsentDecisions"');
  assertStringIncludes(source, 'table: "pragas_location_consent_decisions"');
  assertStringIncludes(source, "columns: PRAGAS_LOCATION_CONSENT_DECISIONS_EXPORT_COLUMNS");
  assertStringIncludes(source, "columns: PRAGAS_LOCATION_PREFERENCES_EXPORT_COLUMNS");
  assertFalse(source.includes('.select("*")'));
});

Deno.test("export uses snapshot-bounded keyset pagination and never labels deleted state complete", async () => {
  const source = await Deno.readTextFile(
    new URL("../pragas-export-user-data/index.ts", import.meta.url),
  );
  assertFalse(source.includes(".range("));
  assertStringIncludes(source, ".order(descriptor.cursorColumn, { ascending: true })");
  assertStringIncludes(source, ".gt(descriptor.cursorColumn, after)");
  assertStringIncludes(source, ".lte(descriptor.snapshotColumn, snapshotCutoff)");
  assertStringIncludes(source, "snapshotAt");
  assertStringIncludes(source, "accountStateRevalidated: true");
  assertStringIncludes(source, 'error: "deleted_reactivation_required"');
  assertStringIncludes(source, "{ status: 409, headers: cors, requestId }");
  assertFalse(
    /deleted_reactivation_required[\s\S]{0,800}complete:\s*true/.test(source),
  );
});

Deno.test("notification queue export delegates one immutable owner-scoped snapshot to SQL", async () => {
  const source = await Deno.readTextFile(
    new URL("../pragas-export-user-data/index.ts", import.meta.url),
  );
  const runtimeSql = await Deno.readTextFile(
    new URL("../../migrations/20260715171000_pragas_prod_compat_runtime.sql", import.meta.url),
  );
  const exportSql = await Deno.readTextFile(
    new URL("../../migrations/20260715172000_pragas_prod_compat_export.sql", import.meta.url),
  );
  assertStringIncludes(source, 'source: "notification_queue_snapshot_rpc"');
  assertStringIncludes(source, 'admin.rpc("export_pragas_notification_queue_snapshot"');
  assertStringIncludes(source, "p_limit: requested + 1");
  assertFalse(source.includes('.eq("is_active", true)'));
  assertFalse(source.includes('.eq("notifications_enabled", true)'));
  assertStringIncludes(runtimeSql, "pragas_notification_queue_legacy_owner_ambiguous");
  assertStringIncludes(runtimeSql, "pragas_notification_queue_owner_guard");
  assertStringIncludes(runtimeSql, "WHERE owner_user_id = p_user_id");
  assertStringIncludes(exportSql, "queue_row.owner_user_id = $1");
  assertStringIncludes(exportSql, "column_info.column_name = 'owner_user_id'");
  assertFalse(exportSql.includes("current_owner.is_active"));
  assertFalse(exportSql.includes("v_owned_tokens"));
});
