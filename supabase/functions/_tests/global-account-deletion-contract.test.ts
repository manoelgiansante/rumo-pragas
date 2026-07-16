import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import {
  formatGlobalDeletionReceipt,
  GLOBAL_DELETION_RECEIPT_PREFIX,
  parseGlobalDeletionReceipt,
  parseValidatedSessionClaims,
  randomHexSecret,
  sha256Hex,
} from "../_shared/global-account-deletion-contract.ts";

function base64Url(value: string): string {
  return btoa(value).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function unsignedToken(payload: Record<string, unknown>): string {
  return `${base64Url('{"alg":"none"}')}.${base64Url(JSON.stringify(payload))}.signature`;
}

Deno.test("validated JWT claim parser requires a session id and preserves AMR auth time", () => {
  const token = unsignedToken({
    session_id: "11111111-1111-4111-8111-111111111111",
    iat: 1_784_200_000,
    amr: [
      { method: "password", timestamp: 1_784_199_999 },
      { method: "totp", timestamp: 1_784_200_001 },
    ],
  });
  const claims = parseValidatedSessionClaims(token);
  assertEquals(claims?.sessionId, "11111111-1111-4111-8111-111111111111");
  assertEquals(claims?.issuedAt.toISOString(), "2026-07-16T11:06:40.000Z");
  assertEquals(claims?.reauthenticationMethod, "mfa");
  assertEquals(claims?.authenticationAt?.toISOString(), "2026-07-16T11:06:41.000Z");
});

Deno.test("validated JWT claim parser fails closed on malformed or incomplete claims", () => {
  assertEquals(parseValidatedSessionClaims("not-a-jwt"), null);
  assertEquals(
    parseValidatedSessionClaims(unsignedToken({ iat: 1_784_200_000, amr: [] })),
    null,
  );
  assertEquals(
    parseValidatedSessionClaims(unsignedToken({
      session_id: "not-a-uuid",
      iat: 1_784_200_000,
      amr: [{ method: "password", timestamp: 1_784_200_000 }],
    })),
    null,
  );
});

Deno.test("unknown AMR methods never become a reauthentication proof", () => {
  const claims = parseValidatedSessionClaims(unsignedToken({
    session_id: "11111111-1111-4111-8111-111111111111",
    iat: 1_784_200_000,
    amr: [{ method: "refresh_token", timestamp: 1_784_200_000 }],
  }));
  assertEquals(claims?.reauthenticationMethod, null);
  assertEquals(claims?.authenticationAt, null);
});

Deno.test("receipt parsing is opaque, exact and contains no identity", () => {
  const id = "22222222-2222-4222-8222-222222222222";
  const receipt = formatGlobalDeletionReceipt(id);
  assertEquals(receipt, `${GLOBAL_DELETION_RECEIPT_PREFIX}${id}`);
  assertEquals(parseGlobalDeletionReceipt(receipt), id);
  assertEquals(parseGlobalDeletionReceipt(id), null);
  assertEquals(parseGlobalDeletionReceipt(`${receipt}x`), null);
  assertFalse(receipt.includes("@"));
});

Deno.test("challenge secrets use 256 random bits and stable SHA-256 digests", async () => {
  const secret = randomHexSecret();
  assertEquals(secret.length, 64);
  assertEquals(/^[0-9a-f]{64}$/.test(secret), true);
  assertEquals((await sha256Hex(secret)).length, 64);
  assertFalse(secret === randomHexSecret());
});

Deno.test("global request path stays manual, PII-minimized and handler-authenticated", async () => {
  const [migration, endpoint, appleRevocation, config] = await Promise.all([
    Deno.readTextFile(
      new URL(
        "../../migrations/20260715173000_agrorumo_global_account_deletion_requests.sql",
        import.meta.url,
      ),
    ),
    Deno.readTextFile(new URL("../pragas-global-account-deletion/index.ts", import.meta.url)),
    Deno.readTextFile(new URL("../_shared/apple-sign-in-revocation.ts", import.meta.url)),
    Deno.readTextFile(new URL("../../config.toml", import.meta.url)),
  ]);
  assertStringIncludes(migration, "manual_global_processing");
  assertStringIncludes(migration, "agrorumo_deletion_subject_ref");
  assertStringIncludes(migration, "fresh_reauthentication_required");
  assertStringIncludes(migration, "v_challenge.reauthentication_not_before_at");
  assertStringIncludes(
    migration,
    "date_trunc('second', v_now) + interval '1 second'",
  );
  assertStringIncludes(migration, "hashtextextended('pragas-account:' || p_user_id::text, 0)");
  assertStringIncludes(migration, "consume_agrorumo_deletion_status_rate_limit");
  assertStringIncludes(migration, "block_pragas_push_enable_during_global_deletion");
  assertStringIncludes(migration, "vault.create_secret(");
  assertStringIncludes(migration, "purge_agrorumo_account_deletion_ephemera");
  assertStringIncludes(migration, "pragas_link_account_global_deletion_precedence_v1");
  assertStringIncludes(migration, "block_pragas_service_write_during_global_deletion");
  assertStringIncludes(migration, "global_deletion_apple_revocation_incomplete");
  assertStringIncludes(migration, "global_deletion_app_cleanup_not_completed");
  assertStringIncludes(migration, "manual_evidence_recorded");
  assertStringIncludes(migration, "attempt_token");
  assertStringIncludes(migration, "PII-minimized durable queue");
  assertFalse(migration.includes("auth.admin.deleteUser"));
  assertFalse(migration.includes("DELETE FROM auth.users"));
  const queueDefinitions = migration.match(
    /CREATE TABLE IF NOT EXISTS public\.agrorumo_account_deletion_(?:requests|challenges|apple_revocations)[\s\S]*?\n\);/gu,
  ) ?? [];
  assertEquals(queueDefinitions.length, 3);
  for (const definition of queueDefinitions) {
    assertFalse(/\b(?:email|phone|name|user_id)\b/u.test(definition));
  }
  assertStringIncludes(endpoint, "admin.auth.getUser(token)");
  assertStringIncludes(endpoint, "parseValidatedSessionClaims(token)");
  assertStringIncludes(endpoint, 'admin.rpc("get_agrorumo_account_deletion_replay"');
  assertStringIncludes(endpoint, 'admin.rpc("reserve_agrorumo_account_deletion_request"');
  assertStringIncludes(endpoint, "exchangeAppleAuthorizationCode(");
  assertStringIncludes(endpoint, 'admin.rpc("store_agrorumo_apple_revocation_token"');
  assertStringIncludes(endpoint, "revokeAppleRefreshToken(claimed.data)");
  assertStringIncludes(endpoint, 'input.action === "resume_apple_revocation"');
  assertStringIncludes(endpoint, "p_attempt_token: attemptToken");
  assertStringIncludes(endpoint, 'admin.rpc("consume_agrorumo_deletion_status_rate_limit"');
  assertStringIncludes(endpoint, "manualGlobalProcessing: true");
  assert(
    endpoint.indexOf(
      'const reservation = await admin.rpc("reserve_agrorumo_account_deletion_request"',
    ) < endpoint.lastIndexOf("const appleResult = await processReservedAppleRevocation("),
    "durable deletion reservation must precede Apple's external token exchange",
  );
  assert(
    endpoint.indexOf('admin.rpc("consume_agrorumo_deletion_status_rate_limit"') <
      endpoint.indexOf('admin.rpc("get_agrorumo_account_deletion_status"'),
    "public receipt lookup must consume its durable rate limit first",
  );
  assertStringIncludes(appleRevocation, 'Deno.env.get("APPLE_SIGN_IN_KEY_ID")');
  assertStringIncludes(appleRevocation, 'Deno.env.get("APPLE_SIGN_IN_PRIVATE_KEY")');
  assertStringIncludes(appleRevocation, 'EXPECTED_SIGN_IN_KEY_ID = "S7F5NF2BN7"');
  assertFalse(appleRevocation.includes('Deno.env.get("ASC_API_'));
  assertStringIncludes(config, "[functions.pragas-global-account-deletion]\nverify_jwt = false");
});
