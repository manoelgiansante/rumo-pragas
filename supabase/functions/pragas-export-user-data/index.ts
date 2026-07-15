import type { SupabaseClient } from "@supabase/supabase-js";
import {
  consumeDurableRateLimit,
  fingerprintRateLimitRequest,
  rateLimitHeaders,
  resolveIdempotencyKey,
} from "../_shared/durable-rate-limit.ts";
import {
  authenticatePragasRequest,
  createPragasAdminClient,
  getPragasAppAccessState,
  getPragasCorsHeaders,
  jsonResponse,
} from "../_shared/pragas-edge.ts";
import { captureException, withSentry } from "../_shared/pragas-sentry.ts";
import {
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

const RATE_LIMIT = 2;
const PAGE_SIZE = 250;
const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205"]);

interface DatasetDescriptor {
  key: string;
  table: string;
  columns: readonly string[];
  /** Immutable unique cursor inside the descriptor's ownership/partition filters. */
  cursorColumn: string;
  /** Immutable membership cutoff used to exclude rows created after this export began. */
  snapshotColumn?: string;
  snapshotValue?: "timestamp" | "utc_month";
  /** Split composite primary keys into fixed, independently keyset-paginated partitions. */
  partitions?: { column: string; values: readonly string[] };
  source?: "table" | "notification_queue_snapshot_rpc";
  appScoped?: boolean;
  optional?: boolean;
}

interface ExportBudget {
  rows: number;
  bytes: number;
}

const VERIFIED_DATASETS: readonly DatasetDescriptor[] = [
  {
    key: "profile",
    table: "pragas_profiles",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    columns: [
      "id",
      "user_id",
      "full_name",
      "city",
      "state",
      "crops",
      "avatar_path",
      "avatar_url",
      "phone",
      "created_at",
      "updated_at",
    ],
  },
  {
    key: "diagnoses",
    table: "pragas_diagnoses",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    columns: [
      "id",
      "user_id",
      "crop",
      "pest_id",
      "pest_name",
      "confidence",
      "notes",
      "location_lat",
      "location_lng",
      "location_name",
      "created_at",
    ],
  },
  {
    key: "preferences",
    table: "pragas_user_preferences",
    cursorColumn: "user_id",
    columns: PRAGAS_LOCATION_PREFERENCES_EXPORT_COLUMNS,
  },
  {
    key: "locationConsentDecisions",
    table: "pragas_location_consent_decisions",
    cursorColumn: "decision_id",
    snapshotColumn: "created_at",
    columns: PRAGAS_LOCATION_CONSENT_DECISIONS_EXPORT_COLUMNS,
  },
  {
    key: "subscription",
    table: "subscriptions",
    cursorColumn: "user_id",
    appScoped: true,
    columns: [
      "user_id",
      "app",
      "plan",
      "status",
      "provider",
      "updated_at",
    ],
  },
  {
    key: "chatUsage",
    table: "chat_usage",
    cursorColumn: "year_month",
    snapshotColumn: "year_month",
    snapshotValue: "utc_month",
    appScoped: true,
    columns: ["user_id", "app", "year_month", "count", "updated_at"],
  },
  {
    key: "aiContentReports",
    table: "pragas_ai_content_reports",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    columns: [
      "id",
      "user_id",
      "message_id",
      "content",
      "reason",
      "details",
      "status",
      "created_at",
      "resolved_at",
    ],
  },
  {
    key: "diagnosisFeedback",
    table: "pragas_diagnosis_feedback",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    columns: [
      "id",
      "user_id",
      "diagnosis_id",
      "verdict",
      "selected_alternative",
      "notes",
      "created_at",
      "updated_at",
    ],
  },
  {
    key: "pushRegistrations",
    table: "pragas_push_tokens",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    columns: [
      "id",
      "user_id",
      "token",
      "expo_token",
      "platform",
      "device_info",
      "notifications_enabled",
      "is_active",
      "consented_at",
      "revoked_at",
      "last_seen_at",
      "created_at",
      "updated_at",
    ],
  },
  {
    key: "analyticsEvents",
    table: "analytics_events",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    appScoped: true,
    columns: [
      "id",
      "user_id",
      "app",
      "pragas_event_id",
      "event",
      "properties",
      "platform",
      "timestamp",
      "created_at",
    ],
  },
  {
    key: "auditEntries",
    table: "audit_log",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    appScoped: true,
    columns: ["id", "user_id", "app", "action", "details", "ip_address", "created_at"],
  },
  {
    key: "aiConsents",
    table: "pragas_ai_consents",
    cursorColumn: "version",
    snapshotColumn: "accepted_at",
    partitions: { column: "purpose", values: ["chat", "diagnosis"] },
    columns: [
      "user_id",
      "purpose",
      "version",
      "accepted_at",
      "last_used_at",
      "revoked_at",
    ],
  },
  {
    key: "aiRequestHistory",
    table: "pragas_ai_idempotency_records",
    cursorColumn: "idempotency_key",
    snapshotColumn: "started_at",
    partitions: { column: "scope", values: ["chat", "diagnosis"] },
    columns: [
      "user_id",
      "scope",
      "idempotency_key",
      "state",
      "started_at",
      "completed_at",
      "response_expires_at",
      "updated_at",
    ],
  },
  {
    key: "legacySubscriptions",
    table: "pragas_subscriptions",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    optional: true,
    columns: [
      "id",
      "user_id",
      "plan",
      "status",
      "platform",
      "product_id",
      "store_transaction_id",
      "stripe_customer_id",
      "stripe_subscription_id",
      "asaas_customer_id",
      "asaas_subscription_id",
      "asaas_last_payment_id",
      "trial_ends_at",
      "current_period_start",
      "current_period_end",
      "cancel_at_period_end",
      "created_at",
      "updated_at",
    ],
  },
  {
    key: "legacyChatMessages",
    table: "pragas_chat_messages",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    optional: true,
    columns: ["id", "user_id", "role", "content", "created_at"],
  },
  {
    key: "communityPosts",
    table: "pragas_community_posts",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    optional: true,
    columns: [
      "id",
      "user_id",
      "title",
      "content",
      "category",
      "crop",
      "tags",
      "image_url",
      "diagnosis_id",
      "author_name",
      "author_badge",
      "is_answered",
      "is_solved",
      "solved",
      "like_count",
      "comments_count",
      "reply_count",
      "upvotes",
      "created_at",
      "updated_at",
    ],
  },
  {
    key: "outbreakConfirmations",
    table: "pragas_outbreak_confirmations",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    optional: true,
    columns: ["id", "user_id", "outbreak_id", "confirmed", "notes", "created_at"],
  },
  {
    key: "postLikes",
    table: "pragas_post_likes",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    optional: true,
    columns: ["id", "user_id", "post_id", "created_at"],
  },
  {
    key: "communityLikes",
    table: "pragas_community_likes",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    optional: true,
    columns: ["id", "user_id", "post_id", "created_at"],
  },
  {
    key: "diagnosisUsage",
    table: "pragas_diagnosis_usage",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    optional: true,
    columns: ["id", "user_id", "type", "crop", "plan", "result", "created_at"],
  },
  {
    key: "postReplies",
    table: "pragas_post_replies",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    optional: true,
    columns: [
      "id",
      "user_id",
      "post_id",
      "content",
      "author_name",
      "author_badge",
      "is_accepted",
      "like_count",
      "upvotes",
      "created_at",
      "updated_at",
    ],
  },
  {
    key: "postComments",
    table: "pragas_post_comments",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    optional: true,
    columns: [
      "id",
      "user_id",
      "post_id",
      "content",
      "is_answer",
      "upvotes",
      "created_at",
    ],
  },
  {
    key: "replyLikes",
    table: "pragas_reply_likes",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    optional: true,
    columns: ["id", "user_id", "reply_id", "created_at"],
  },
  {
    key: "outbreaks",
    table: "pragas_outbreaks",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    optional: true,
    columns: [
      "id",
      "user_id",
      "pest_id",
      "pest_name",
      "crop",
      "description",
      "severity",
      "status",
      "verified",
      "verified_by",
      "confirmed_count",
      "upvotes",
      "city",
      "state",
      "region",
      "location_name",
      "latitude",
      "longitude",
      "location_lat",
      "location_lng",
      "image_url",
      "created_at",
      "updated_at",
    ],
  },
  {
    key: "legacyAnalytics",
    table: "pragas_analytics",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    optional: true,
    columns: [
      "id",
      "user_id",
      "event_name",
      "event_data",
      "screen",
      "platform",
      "created_at",
    ],
  },
  {
    key: "errorLogs",
    table: "pragas_error_logs",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    optional: true,
    columns: [
      "id",
      "user_id",
      "error_message",
      "error_stack",
      "component",
      "platform",
      "app_version",
      "created_at",
    ],
  },
  {
    key: "notificationQueue",
    table: "pragas_notification_queue",
    cursorColumn: "id",
    snapshotColumn: "created_at",
    source: "notification_queue_snapshot_rpc",
    optional: true,
    columns: ["id", "title", "body", "data", "sent", "created_at"],
  },
] as const;

class ExportTooLargeError extends Error {
  constructor() {
    super("export_too_large");
    this.name = "ExportTooLargeError";
  }
}

class ExportQueryError extends Error {
  constructor() {
    super("export_query_failed");
    this.name = "ExportQueryError";
  }
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

type ExportCursor = string | number;

function nextPageLimit(rowsInDataset: number, budget: ExportBudget): {
  requested: number;
  limit: number;
} {
  const remainingDataset = PRAGAS_USER_DATA_EXPORT_MAX_ROWS_PER_DATASET - rowsInDataset;
  const remainingGlobal = PRAGAS_USER_DATA_EXPORT_MAX_TOTAL_ROWS - budget.rows;
  const requested = Math.min(
    PAGE_SIZE,
    Math.max(0, remainingDataset),
    Math.max(0, remainingGlobal),
  );
  return { requested, limit: requested > 0 ? requested : 1 };
}

function appendPageToBudget(
  target: Record<string, unknown>[],
  page: readonly Record<string, unknown>[],
  requested: number,
  budget: ExportBudget,
): void {
  if (requested === 0 && page.length > 0) throw new ExportTooLargeError();
  if (page.length > requested) throw new ExportTooLargeError();
  for (const row of page) {
    const bytes = jsonBytes(row);
    if (budget.bytes + bytes > PRAGAS_USER_DATA_EXPORT_MAX_RESPONSE_BYTES) {
      throw new ExportTooLargeError();
    }
    target.push(row);
    budget.rows += 1;
    budget.bytes += bytes;
  }
}

function readExportCursor(row: Record<string, unknown>, column: string): ExportCursor {
  const cursor = row[column];
  if (
    (typeof cursor !== "string" || cursor.length === 0) &&
    (typeof cursor !== "number" || !Number.isFinite(cursor))
  ) {
    throw new ExportQueryError();
  }
  return cursor;
}

function descriptorSnapshotCutoff(
  descriptor: DatasetDescriptor,
  snapshotAt: string,
): string | null {
  if (!descriptor.snapshotColumn) return null;
  return descriptor.snapshotValue === "utc_month" ? snapshotAt.slice(0, 7) : snapshotAt;
}

async function fetchTableDataset(
  admin: SupabaseClient,
  descriptor: DatasetDescriptor,
  userId: string,
  budget: ExportBudget,
  snapshotAt: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const partitions = descriptor.partitions?.values ?? [null];

  for (const partitionValue of partitions) {
    let after: ExportCursor | null = null;
    while (true) {
      const { requested, limit } = nextPageLimit(rows.length, budget);
      let query = admin
        .from(descriptor.table)
        .select(descriptor.columns.join(","))
        .order(descriptor.cursorColumn, { ascending: true })
        .limit(limit)
        .eq("user_id", userId);
      if (descriptor.appScoped) query = query.eq("app", "rumo-pragas");
      if (descriptor.partitions && partitionValue !== null) {
        query = query.eq(descriptor.partitions.column, partitionValue);
      }
      const snapshotCutoff = descriptorSnapshotCutoff(descriptor, snapshotAt);
      if (descriptor.snapshotColumn && snapshotCutoff !== null) {
        query = query.lte(descriptor.snapshotColumn, snapshotCutoff);
      }
      if (after !== null) query = query.gt(descriptor.cursorColumn, after);

      const { data, error } = await query;
      if (error) {
        const code = String((error as { code?: string }).code ?? "");
        if (descriptor.optional && MISSING_RELATION_CODES.has(code)) return [];
        throw new ExportQueryError();
      }
      const page = (data ?? []) as unknown as Record<string, unknown>[];
      appendPageToBudget(rows, page, requested, budget);
      if (page.length === 0 || page.length < limit) break;

      const next = readExportCursor(page[page.length - 1]!, descriptor.cursorColumn);
      if (next === after) throw new ExportQueryError();
      after = next;
    }
  }
  return rows;
}

async function fetchNotificationQueueDataset(
  admin: SupabaseClient,
  userId: string,
  budget: ExportBudget,
  snapshotAt: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const requested = Math.min(
    PRAGAS_USER_DATA_EXPORT_MAX_ROWS_PER_DATASET,
    Math.max(0, PRAGAS_USER_DATA_EXPORT_MAX_TOTAL_ROWS - budget.rows),
  );
  // The RPC returns one JSON array so its advisory locks and SQL snapshot span
  // the entire legacy queue read. `requested + 1` is the overflow sentinel.
  const { data, error } = await admin.rpc("export_pragas_notification_queue_snapshot", {
    p_user_id: userId,
    p_snapshot_at: snapshotAt,
    p_limit: requested + 1,
  });
  if (error || !Array.isArray(data)) throw new ExportQueryError();
  const page = data.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new ExportQueryError();
    }
    return entry as Record<string, unknown>;
  });
  appendPageToBudget(rows, page, requested, budget);
  return rows;
}

function fetchDataset(
  admin: SupabaseClient,
  descriptor: DatasetDescriptor,
  userId: string,
  budget: ExportBudget,
  snapshotAt: string,
): Promise<Record<string, unknown>[]> {
  return descriptor.source === "notification_queue_snapshot_rpc"
    ? fetchNotificationQueueDataset(admin, userId, budget, snapshotAt)
    : fetchTableDataset(admin, descriptor, userId, budget, snapshotAt);
}

Deno.serve(withSentry("pragas-export-user-data", async (req, { requestId }) => {
  const cors = getPragasCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405, headers: cors, requestId });
  }

  const admin = createPragasAdminClient();
  const user = await authenticatePragasRequest(req, admin);
  if (!user) {
    return jsonResponse({ error: "unauthorized" }, { status: 401, headers: cors, requestId });
  }
  const access = await getPragasAppAccessState(admin, user.id);
  if (access.state === "unavailable") {
    return jsonResponse({ error: "app_access_unavailable" }, {
      status: 503,
      headers: cors,
      requestId,
    });
  }
  if (access.state === "deletion_pending" || access.state === "unlinked") {
    return jsonResponse({ error: access.state }, { status: 409, headers: cors, requestId });
  }
  if (access.state === "deleted_reactivation_required") {
    return jsonResponse({
      error: "deleted_reactivation_required",
      deletion: {
        appDataDeletionComplete: false,
        appScopedDataDeletionComplete: true,
        completedAt: access.completedAt,
        globalIdentityDeleted: false,
        sharedUnscopedRecordsRetained: ["analytics_events", "audit_log", "user_preferences"],
      },
    }, { status: 409, headers: cors, requestId });
  }

  const idempotencyKey = resolveIdempotencyKey(req.headers.get("Idempotency-Key"), requestId);
  const requestHash = await fingerprintRateLimitRequest(req, 1024);
  if (!requestHash) {
    return jsonResponse({ error: "payload_too_large" }, { status: 413, headers: cors, requestId });
  }
  const rate = await consumeDurableRateLimit(admin, {
    userId: user.id,
    scope: "export_user_data",
    limit: RATE_LIMIT,
    windowSeconds: 3600,
    idempotencyKey,
    requestHash,
  });
  if (!rate) {
    return jsonResponse({ error: "temporarily_unavailable" }, {
      status: 503,
      headers: { ...cors, "Retry-After": "30" },
      requestId,
    });
  }
  const headers = { ...cors, ...rateLimitHeaders(RATE_LIMIT, rate) };
  if (rate.conflict) {
    return jsonResponse({ error: "idempotency_key_conflict" }, { status: 409, headers, requestId });
  }
  if (!rate.allowed) {
    return jsonResponse({ error: "rate_limit_exceeded" }, {
      status: 429,
      headers: { ...headers, "Retry-After": String(Math.max(1, rate.retryAfterSeconds)) },
      requestId,
    });
  }

  try {
    // A same-body replay is intentionally re-executed because this endpoint is
    // read-only. Every execution still consumes the durable rate-limit budget.
    const budget: ExportBudget = { rows: 0, bytes: 0 };
    const snapshotAt = new Date().toISOString();
    const data: Record<string, Record<string, unknown>[]> = {};
    for (const descriptor of VERIFIED_DATASETS) {
      data[descriptor.key] = await fetchDataset(
        admin,
        descriptor,
        user.id,
        budget,
        snapshotAt,
      );
    }

    // A deletion/account transition racing the export must never result in a
    // stale document labelled complete. The row queries are discarded unless
    // the exact app account remains active after the final page.
    const finalAccess = await getPragasAppAccessState(admin, user.id);
    if (finalAccess.state === "unavailable") {
      return jsonResponse({ error: "app_access_unavailable" }, {
        status: 503,
        headers,
        requestId,
      });
    }
    if (finalAccess.state !== "active") {
      return jsonResponse({ error: finalAccess.state }, { status: 409, headers, requestId });
    }

    const payload = {
      schemaVersion: PRAGAS_USER_DATA_EXPORT_SCHEMA_VERSION,
      app: "rumo-pragas",
      exportedAt: snapshotAt,
      manifest: {
        truncated: false,
        complete: true,
        replayed: rate.replayed,
        totalRows: budget.rows,
        totalBytes: budget.bytes,
        includedColumns: Object.fromEntries(
          VERIFIED_DATASETS.map((descriptor) => [descriptor.key, descriptor.columns]),
        ),
        excludedBinaryFields: ["pragas_diagnoses.image_url"],
        ownershipJoins: {
          notificationQueue:
            "historical owned token under pragas-push-token advisory lock; an active other owner wins",
        },
        consistency: {
          snapshotAt,
          pagination: PRAGAS_USER_DATA_EXPORT_PAGINATION,
          membershipCutoff: PRAGAS_USER_DATA_EXPORT_MEMBERSHIP_CUTOFF,
          accountStateRevalidated: true,
        },
        retentionWindows: {
          locationConsentDecisions: {
            maximumRowsPerUser: PRAGAS_LOCATION_CONSENT_DECISION_RETENTION_ROWS,
            ordering: "created_at DESC, decision_id DESC",
            currentStateDataset: "preferences",
          },
        },
      },
      data,
      scope: {
        excludesLegacyRowsWithoutAppDiscriminator: ["analytics_events", "audit_log"],
        excludesSharedGenericDatasets: ["user_preferences"],
        reason:
          "Registros sem discriminador de aplicativo não são exportados para evitar dados de outros apps AgroRumo.",
      },
    };
    const serialized = JSON.stringify({ ...payload, requestId });
    if (
      new TextEncoder().encode(serialized).byteLength > PRAGAS_USER_DATA_EXPORT_MAX_RESPONSE_BYTES
    ) {
      throw new ExportTooLargeError();
    }
    return new Response(serialized, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="rumo-pragas-export-${
          new Date().toISOString().slice(0, 10)
        }.json"`,
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    if (error instanceof ExportTooLargeError) {
      return jsonResponse({
        error: "export_too_large",
        maxRows: PRAGAS_USER_DATA_EXPORT_MAX_TOTAL_ROWS,
        maxBytes: PRAGAS_USER_DATA_EXPORT_MAX_RESPONSE_BYTES,
      }, { status: 413, headers, requestId });
    }
    await captureException(new Error("pragas_export_build_failed"), {
      tags: { fn: "pragas-export-user-data", step: "build_export" },
    });
    return jsonResponse({ error: "export_unavailable" }, { status: 503, headers, requestId });
  }
}));
