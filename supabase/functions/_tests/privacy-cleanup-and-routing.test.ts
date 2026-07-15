import { assertEquals, assertFalse, assertRejects, assertStringIncludes } from "@std/assert";
import {
  AccountCleanupError,
  extractLegacyPragasAvatarPath,
  isMissingStorageBucketError,
  purgeStoragePrefix,
} from "../_shared/account-cleanup.ts";
import { BoundedBodyError, readBoundedJson } from "../_shared/bounded-body.ts";
import {
  retiredBillingWebhook,
  retiredFreeProductEndpoint,
} from "../_shared/retired-pragas-endpoint.ts";
import { authenticateServiceBearer, constantTimeEqualSecret } from "../_shared/service-auth.ts";
import { scrubSentryValueForTest } from "../_shared/pragas-sentry.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

Deno.test("bounded JSON rejects declared and streamed overflow before parsing", async () => {
  await assertRejects(
    () =>
      readBoundedJson(
        new Request("https://example.test", {
          method: "POST",
          headers: { "Content-Length": "1000" },
          body: "{}",
        }),
        10,
      ),
    BoundedBodyError,
    "payload_too_large",
  );
  await assertRejects(
    () =>
      readBoundedJson(
        new Request("https://example.test", {
          method: "POST",
          body: JSON.stringify({ content: "x".repeat(100) }),
        }),
        16,
      ),
    BoundedBodyError,
    "payload_too_large",
  );
  await assertRejects(
    () =>
      readBoundedJson(
        new Request("https://example.test", { method: "POST", body: "not-json" }),
        100,
      ),
    BoundedBodyError,
    "invalid_json",
  );
});

Deno.test("service bearer verification handles wrong lengths without string early-return logic", async () => {
  assertEquals(await constantTimeEqualSecret("service-secret", "service-secret"), true);
  assertEquals(await constantTimeEqualSecret("x", "service-secret"), false);
  assertEquals(
    await authenticateServiceBearer(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer service-secret" },
      }),
      "service-secret",
    ),
    true,
  );
  assertEquals(
    await authenticateServiceBearer(
      new Request("https://example.test", { headers: { Authorization: "Bearer short" } }),
      "service-secret",
    ),
    false,
  );
  assertEquals(
    await authenticateServiceBearer(
      new Request("https://example.test", { headers: { Authorization: "Basic service-secret" } }),
      "service-secret",
    ),
    false,
  );
});

Deno.test("legacy avatar cleanup accepts only one exact same-project object", () => {
  const base = "https://jxcnfyeemdltdfqtgbcl.supabase.co";
  const valid =
    `${base}/storage/v1/object/public/avatars/${USER_ID}/avatar-profile.webp?t=1720000000`;
  assertEquals(
    extractLegacyPragasAvatarPath(valid, USER_ID, base),
    `${USER_ID}/avatar-profile.webp`,
  );
  for (
    const unsafe of [
      `https://attacker.test/storage/v1/object/public/avatars/${USER_ID}/avatar-profile.webp`,
      `${base}/storage/v1/object/public/avatars/${USER_ID}/avatar-profile.webp?download=1`,
      `${base}/storage/v1/object/public/avatars/${USER_ID}/avatar-profile.webp?t=1&t=2`,
      `${base}/storage/v1/object/sign/avatars/${USER_ID}/avatar-profile.webp`,
      `${base}/storage/v1/object/public/avatars/${USER_ID}/nested/avatar-profile.webp`,
      `${base}/storage/v1/object/public/avatars/${USER_ID}/not-owned.webp`,
    ]
  ) {
    assertEquals(extractLegacyPragasAvatarPath(unsafe, USER_ID, base), null);
  }
});

Deno.test("storage cleanup paginates, batches files and recursively removes folders", async () => {
  const rootFirstPage = [
    ...Array.from({ length: 99 }, (_, index) => ({ id: `id-${index}`, name: `file-${index}` })),
    { id: null, name: "nested" },
  ];
  const listCalls: Array<{ prefix: string; offset: number }> = [];
  const removed: string[][] = [];
  const admin = {
    storage: {
      from(bucket: string) {
        assertEquals(bucket, "pragas-images");
        return {
          list(prefix: string, options: { offset: number }) {
            listCalls.push({ prefix, offset: options.offset });
            if (prefix === USER_ID && options.offset === 0) {
              return Promise.resolve({ data: rootFirstPage, error: null });
            }
            if (prefix === USER_ID && options.offset === 100) {
              return Promise.resolve({
                data: [{ id: "id-100", name: "file-100" }],
                error: null,
              });
            }
            if (prefix === `${USER_ID}/nested` && options.offset === 0) {
              return Promise.resolve({
                data: [{ id: "nested-id", name: "inside.webp" }],
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: null });
          },
          remove(paths: string[]) {
            removed.push(paths);
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  } as unknown as Parameters<typeof purgeStoragePrefix>[0];

  const state = { visited: 0 };
  await purgeStoragePrefix(admin, "pragas-images", USER_ID, state);
  assertEquals(state.visited, 102);
  assertEquals(listCalls.some((call) => call.prefix === USER_ID && call.offset === 100), true);
  assertEquals(
    removed.flat().includes(`${USER_ID}/nested/inside.webp`),
    true,
  );
  assertEquals(removed.flat().length, 101);
});

Deno.test("storage cleanup fails closed when the bounded inventory is exceeded", async () => {
  const fullPage = Array.from({ length: 100 }, (_, index) => ({
    id: `id-${index}`,
    name: `file-${index}`,
  }));
  const admin = {
    storage: {
      from() {
        return {
          list() {
            return Promise.resolve({ data: fullPage, error: null });
          },
          remove() {
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  } as unknown as Parameters<typeof purgeStoragePrefix>[0];
  await assertRejects(
    () => purgeStoragePrefix(admin, "pragas-images", USER_ID, { visited: 0 }),
    AccountCleanupError,
    "storage_entry_limit_pragas-images",
  );
});

Deno.test("storage cleanup treats only an exact missing bucket as already empty", async () => {
  const missingBucket = {
    name: "StorageApiError",
    message: "Bucket not found",
    status: 404,
    statusCode: "404",
  };
  assertEquals(isMissingStorageBucketError(missingBucket), true);
  assertEquals(
    isMissingStorageBucketError({ ...missingBucket, message: "Object not found" }),
    false,
  );
  assertEquals(
    isMissingStorageBucketError({ ...missingBucket, status: 403, statusCode: "403" }),
    false,
  );

  const missingAdmin = {
    storage: {
      from() {
        return {
          list() {
            return Promise.resolve({ data: null, error: missingBucket });
          },
          remove() {
            throw new Error("remove should not run for a missing bucket");
          },
        };
      },
    },
  } as unknown as Parameters<typeof purgeStoragePrefix>[0];
  await purgeStoragePrefix(missingAdmin, "pragas-images", USER_ID, { visited: 0 });

  const object404Admin = {
    storage: {
      from() {
        return {
          list() {
            return Promise.resolve({
              data: null,
              error: { ...missingBucket, message: "Object not found" },
            });
          },
        };
      },
    },
  } as unknown as Parameters<typeof purgeStoragePrefix>[0];
  await assertRejects(
    () => purgeStoragePrefix(object404Admin, "pragas-images", USER_ID, { visited: 0 }),
    AccountCleanupError,
    "storage_list_pragas-images",
  );
});

Deno.test("Sentry scrubber removes content, PII, coordinates, tokens and raw errors", async () => {
  const rawUuid = "22222222-2222-4222-8222-222222222222";
  const scrubbed = await scrubSentryValueForTest({
    requestId: "request-reference-safe",
    userId: rawUuid,
    email: "producer@example.test",
    crop: "soja",
    latitude: -23.55052,
    messages: [{ content: "private farm details" }],
    error: `failure for ${rawUuid} Bearer private-token location_lat=-23.55`,
  }) as Record<string, unknown>;
  const serialized = JSON.stringify(scrubbed);
  assertEquals(scrubbed.requestId, "request-reference-safe");
  for (
    const raw of [
      rawUuid,
      "producer@example.test",
      "private-token",
      "private farm details",
      "soja",
      "-23.55",
    ]
  ) {
    assertFalse(serialized.includes(raw));
  }
  assertStringIncludes(serialized, "[REDACTED]");
});

Deno.test("retired dedicated billing slugs are deterministic and body-blind", async () => {
  const clientResponse = retiredFreeProductEndpoint(
    new Request("https://example.test", { method: "POST", body: "sensitive" }),
    "request-id",
  );
  assertEquals(clientResponse.status, 410);
  assertEquals((await clientResponse.json()).code, "RUMO_PRAGAS_FREE_PRODUCT");

  const webhookResponse = retiredBillingWebhook(
    new Request("https://example.test", { method: "POST", body: "provider-secret-payload" }),
    "request-id",
  );
  assertEquals(webhookResponse.status, 200);
  const body = await webhookResponse.text();
  assertStringIncludes(body, "RUMO_PRAGAS_BILLING_DISABLED");
  assertFalse(body.includes("provider-secret-payload"));
});

Deno.test("dedicated route/model and deletion-worker contracts cannot drift to shared legacy paths", async () => {
  const [client, config, dedicated, generic, worker, cleanup, exportSource, push] = await Promise
    .all([
      Deno.readTextFile(new URL("../../../expo-app/services/ai-chat.ts", import.meta.url)),
      Deno.readTextFile(new URL("../../config.toml", import.meta.url)),
      Deno.readTextFile(new URL("../ai-chat-pragas/index.ts", import.meta.url)),
      Deno.readTextFile(new URL("../ai-chat/index.ts", import.meta.url)),
      Deno.readTextFile(new URL("../pragas-process-deletions/index.ts", import.meta.url)),
      Deno.readTextFile(new URL("../_shared/account-cleanup.ts", import.meta.url)),
      Deno.readTextFile(new URL("../pragas-export-user-data/index.ts", import.meta.url)),
      Deno.readTextFile(new URL("../pragas-send-push/index.ts", import.meta.url)),
    ]);

  assertStringIncludes(client, "/functions/v1/ai-chat-pragas");
  assertFalse(client.includes("/functions/v1/ai-chat`"));
  assertStringIncludes(config, "[functions.ai-chat-pragas]");
  assertStringIncludes(dedicated, '"gemini-3.1-flash-lite"');
  assertStringIncludes(dedicated, '"gemini-3.5-flash"');
  assertFalse(dedicated.includes("gemini-2.0-flash"));
  assertStringIncludes(dedicated, "safetySettings");
  // Shared generic function is intentionally N/A for Pragas and unmodified by
  // this isolation work, even though its own legacy fallback still exists.
  assertStringIncludes(generic, "gemini-2.0-flash");

  for (
    const field of [
      "appScopedProcessed",
      "globalIdentityRetained",
      "retryScheduled",
      "leaseLost",
    ]
  ) assertStringIncludes(worker, field);
  assertFalse(worker.includes("processed++;\n      blocked++"));
  assertStringIncludes(worker, "{ status: 200, headers: cors, requestId }");

  assertStringIncludes(cleanup, 'const STORAGE_BUCKETS = ["pragas-images", "pragas-avatars"]');
  assertFalse(cleanup.includes("STORAGE_BUCKETS="));
  assertFalse(cleanup.includes('Deno.env.get("PRAGAS_STORAGE'));

  assertFalse(exportSource.includes('.select("*")'));
  assertFalse(exportSource.includes("UNVERIFIED_REMOTE_DATASETS"));
  assertFalse(exportSource.includes("export_schema_review_required"));
  assertStringIncludes(exportSource, 'table: "pragas_notification_queue"');
  assertStringIncludes(exportSource, 'source: "notification_queue_snapshot_rpc"');
  assertStringIncludes(exportSource, 'admin.rpc("export_pragas_notification_queue_snapshot"');
  assertFalse(exportSource.includes('.eq("is_active", true)'));
  assertFalse(exportSource.includes('.eq("notifications_enabled", true)'));
  assertStringIncludes(exportSource, 'table: "pragas_subscriptions"');
  assertStringIncludes(exportSource, "truncated: false");
  assertFalse(push.includes("device_fingerprint"));
  assertFalse(push.includes("device_model"));
  assertStringIncludes(push, 'channelId: "climate-risk"');
  assertFalse(push.includes('channelId: "pest-alerts"'));
  assertStringIncludes(push, '"mark_pragas_push_provider_started"');
  assertStringIncludes(push, '"mark_pragas_push_unknown_outcome"');
  assertFalse(push.includes("MAX_ATTEMPTS"));
});
