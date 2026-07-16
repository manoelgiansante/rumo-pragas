import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  appleIdentitySubject,
  type AppleSignInRevocationConfig,
  AppleSignInRevocationError,
  exchangeAppleAuthorizationCode,
  isAppleAuthorizationCode,
  revokeAppleAuthorizationCode,
  revokeAppleRefreshToken,
} from "../_shared/apple-sign-in-revocation.ts";

async function testConfig(): Promise<AppleSignInRevocationConfig> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const encoded = btoa(String.fromCharCode(...pkcs8));
  const lines = encoded.match(/.{1,64}/g) ?? [];
  return {
    clientId: "com.agrorumo.rumopragas",
    teamId: "5YW9UY5LXP",
    keyId: "ABCDEFGHIJ",
    privateKey: `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`,
  };
}

Deno.test("Apple identity detection fails closed when provider metadata lacks a subject", () => {
  assertEquals(appleIdentitySubject({ app_metadata: { providers: ["email"] } }), null);
  assertEquals(
    appleIdentitySubject({
      app_metadata: { providers: ["apple"] },
      identities: [{ provider: "apple", id: "apple-subject" }],
    }),
    "apple-subject",
  );
  assertEquals(
    appleIdentitySubject({ app_metadata: { providers: ["apple"] }, identities: [] }),
    "",
  );
});

Deno.test("authorization codes remain bounded opaque values", () => {
  assert(isAppleAuthorizationCode("opaque.apple.authorization.code"));
  assertEquals(isAppleAuthorizationCode("short"), false);
  assertEquals(isAppleAuthorizationCode("contains whitespace and is long"), false);
});

Deno.test("native Apple code is exchanged, identity-bound and revoked without persistence", async () => {
  const config = await testConfig();
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  const fakeFetch: typeof fetch = (input, init) => {
    const url = String(input);
    const requestInit = init as { body?: BodyInit | null } | undefined;
    const body = new URLSearchParams(String(requestInit?.body ?? ""));
    calls.push({ url, body });
    if (url.endsWith("/auth/token")) {
      return Promise.resolve(Response.json({
        refresh_token: "ephemeral-refresh-token",
        id_token: "ephemeral.identity.token",
      }));
    }
    return Promise.resolve(new Response(null, { status: 200 }));
  };

  await assertRejects(
    () =>
      revokeAppleAuthorizationCode(
        "opaque.apple.authorization.code",
        "expected-subject",
        config,
        {
          fetchImplementation: fakeFetch,
          verifyIdentityToken: () => Promise.resolve({ subject: "other-subject" }),
          now: new Date("2026-07-16T12:00:00Z"),
        },
      ),
    AppleSignInRevocationError,
    "apple_identity_mismatch",
  );
  assertEquals(calls.length, 1, "mismatched Apple identity must never be revoked");

  calls.length = 0;
  const result = await revokeAppleAuthorizationCode(
    "opaque.apple.authorization.code",
    "expected-subject",
    config,
    {
      fetchImplementation: fakeFetch,
      verifyIdentityToken: () => Promise.resolve({ subject: "expected-subject" }),
      now: new Date("2026-07-16T12:00:00Z"),
    },
  );
  assertEquals(result, { revoked: true });
  assertEquals(calls.map((call) => call.url), [
    "https://appleid.apple.com/auth/token",
    "https://appleid.apple.com/auth/revoke",
  ]);
  assertEquals(calls[0]?.body.get("code"), "opaque.apple.authorization.code");
  assertEquals(calls[1]?.body.get("token"), "ephemeral-refresh-token");
  assertEquals(calls[1]?.body.get("token_type_hint"), "refresh_token");
});

Deno.test("token exchange has no unsafe automatic retry, revocation is retryable", async () => {
  const config = await testConfig();
  let exchangeCalls = 0;
  await assertRejects(
    () =>
      revokeAppleAuthorizationCode(
        "opaque.apple.authorization.code",
        "expected-subject",
        config,
        {
          fetchImplementation: () => {
            exchangeCalls += 1;
            return Promise.resolve(new Response(null, { status: 503 }));
          },
          verifyIdentityToken: () => Promise.resolve({ subject: "expected-subject" }),
        },
      ),
    AppleSignInRevocationError,
    "apple_token_exchange_failed",
  );
  assertEquals(exchangeCalls, 1);

  let revokeCalls = 0;
  const result = await revokeAppleAuthorizationCode(
    "opaque.apple.authorization.code",
    "expected-subject",
    config,
    {
      fetchImplementation: (input) => {
        if (String(input).endsWith("/auth/token")) {
          return Promise.resolve(Response.json({
            refresh_token: "ephemeral-refresh-token",
            id_token: "ephemeral.identity.token",
          }));
        }
        revokeCalls += 1;
        return Promise.resolve(new Response(null, { status: revokeCalls === 1 ? 503 : 200 }));
      },
      verifyIdentityToken: () => Promise.resolve({ subject: "expected-subject" }),
    },
  );
  assertEquals(result.revoked, true);
  assertEquals(revokeCalls, 2);
});

Deno.test("exchange and revocation can be separated by a durable Vault boundary", async () => {
  const config = await testConfig();
  const exchange = await exchangeAppleAuthorizationCode(
    "opaque.apple.authorization.code",
    "expected-subject",
    config,
    {
      fetchImplementation: () =>
        Promise.resolve(Response.json({
          refresh_token: "vault-bound-refresh-token",
          id_token: "ephemeral.identity.token",
        })),
      verifyIdentityToken: () => Promise.resolve({ subject: "expected-subject" }),
    },
  );
  assertEquals(exchange, { refreshToken: "vault-bound-refresh-token" });

  let revocationCalls = 0;
  await revokeAppleRefreshToken(exchange.refreshToken, config, {
    fetchImplementation: (input) => {
      assertEquals(String(input), "https://appleid.apple.com/auth/revoke");
      revocationCalls += 1;
      return Promise.resolve(new Response(null, { status: 200 }));
    },
  });
  assertEquals(revocationCalls, 1);
});
