import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const APPLE_ISSUER = "https://appleid.apple.com";
const DEFAULT_CLIENT_ID = "com.agrorumo.rumopragas";
const DEFAULT_TEAM_ID = "5YW9UY5LXP";
const EXPECTED_SIGN_IN_KEY_ID = "S7F5NF2BN7";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_APPLE_RESPONSE_BYTES = 32 * 1024;

const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"), {
  timeoutDuration: REQUEST_TIMEOUT_MS,
  cooldownDuration: 5 * 60 * 1_000,
  cacheMaxAge: 60 * 60 * 1_000,
});

export interface AppleSignInRevocationConfig {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}

export type AppleSignInRevocationErrorCode =
  | "apple_revocation_not_configured"
  | "apple_authorization_code_invalid"
  | "apple_token_exchange_failed"
  | "apple_identity_verification_failed"
  | "apple_identity_mismatch"
  | "apple_token_revocation_failed";

export class AppleSignInRevocationError extends Error {
  constructor(
    public readonly code: AppleSignInRevocationErrorCode,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "AppleSignInRevocationError";
  }
}

export interface AppleIdentityCarrier {
  app_metadata?: { provider?: unknown; providers?: unknown } | null;
  identities?:
    | Array<{
      id?: unknown;
      provider?: unknown;
      identity_data?: Record<string, unknown> | null;
    }>
    | null;
}

export interface AppleRevocationDependencies {
  fetchImplementation?: typeof fetch;
  verifyIdentityToken?: (
    idToken: string,
    expectedAudience: string,
  ) => Promise<{ subject: string }>;
  now?: Date;
}

export interface AppleAuthorizationExchangeResult {
  /** Sensitive: caller must place this in Supabase Vault before revocation. */
  refreshToken: string;
}

function normalizedPrivateKey(value: string): string {
  return value.includes("\\n") ? value.replaceAll("\\n", "\n") : value;
}

function containsAsciiControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function loadAppleSignInRevocationConfig(): AppleSignInRevocationConfig | null {
  const clientId = Deno.env.get("APPLE_SIGN_IN_CLIENT_ID")?.trim() || DEFAULT_CLIENT_ID;
  const teamId = Deno.env.get("APPLE_SIGN_IN_TEAM_ID")?.trim() || DEFAULT_TEAM_ID;
  // App Store Connect API keys are categorically not valid here. Only a key
  // created for Sign in with Apple and associated with the primary App ID may
  // sign this client secret.
  const keyId = Deno.env.get("APPLE_SIGN_IN_KEY_ID")?.trim() ?? "";
  const privateKeyValue = Deno.env.get("APPLE_SIGN_IN_PRIVATE_KEY") ?? "";
  const privateKey = normalizedPrivateKey(privateKeyValue.trim());
  if (
    !/^[A-Za-z0-9.-]{3,128}$/.test(clientId) ||
    !/^[A-Z0-9]{10}$/.test(teamId) ||
    keyId !== EXPECTED_SIGN_IN_KEY_ID ||
    !privateKey.startsWith("-----BEGIN PRIVATE KEY-----") ||
    !privateKey.endsWith("-----END PRIVATE KEY-----")
  ) return null;
  return { clientId, teamId, keyId, privateKey };
}

export function isAppleAuthorizationCode(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 4_096 &&
    /^[\x21-\x7e]+$/.test(value);
}

export function appleIdentitySubject(user: AppleIdentityCarrier): string | null {
  const providers = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers
    : [user.app_metadata?.provider];
  const declaresApple = providers.some((provider) => provider === "apple");
  const identity = user.identities?.find((candidate) => candidate.provider === "apple");
  if (!declaresApple && !identity) return null;
  const subject = identity?.identity_data?.sub ?? identity?.id;
  return typeof subject === "string" && subject.length >= 1 && subject.length <= 512 ? subject : "";
}

async function createClientSecret(
  config: AppleSignInRevocationConfig,
  now: Date,
): Promise<string> {
  try {
    const key = await importPKCS8(config.privateKey, "ES256");
    const issuedAt = Math.floor(now.getTime() / 1_000);
    return await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: config.keyId })
      .setIssuer(config.teamId)
      .setSubject(config.clientId)
      .setAudience(APPLE_ISSUER)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 5 * 60)
      .sign(key);
  } catch {
    throw new AppleSignInRevocationError("apple_revocation_not_configured", false);
  }
}

async function readBoundedAppleJson(response: Response): Promise<Record<string, unknown>> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_APPLE_RESPONSE_BYTES) {
    throw new AppleSignInRevocationError("apple_token_exchange_failed", true);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_APPLE_RESPONSE_BYTES) {
    throw new AppleSignInRevocationError("apple_token_exchange_failed", true);
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    throw new AppleSignInRevocationError("apple_token_exchange_failed", true);
  }
}

async function postAppleForm(
  url: string,
  body: URLSearchParams,
  fetchImplementation: typeof fetch,
): Promise<Response> {
  try {
    return await fetchImplementation(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AppleSignInRevocationError(
      url === APPLE_TOKEN_URL ? "apple_token_exchange_failed" : "apple_token_revocation_failed",
      true,
    );
  }
}

async function verifyAppleIdentityToken(
  idToken: string,
  expectedAudience: string,
): Promise<{ subject: string }> {
  try {
    const { payload } = await jwtVerify(idToken, appleJwks, {
      issuer: APPLE_ISSUER,
      audience: expectedAudience,
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new Error("apple_subject_missing");
    }
    return { subject: payload.sub };
  } catch {
    throw new AppleSignInRevocationError("apple_identity_verification_failed", false);
  }
}

/** Exchange and bind a single-use code to the already authenticated identity. */
export async function exchangeAppleAuthorizationCode(
  authorizationCode: string,
  expectedSubject: string,
  config: AppleSignInRevocationConfig | null = loadAppleSignInRevocationConfig(),
  dependencies: AppleRevocationDependencies = {},
): Promise<AppleAuthorizationExchangeResult> {
  if (!config) {
    throw new AppleSignInRevocationError("apple_revocation_not_configured", false);
  }
  if (!isAppleAuthorizationCode(authorizationCode)) {
    throw new AppleSignInRevocationError("apple_authorization_code_invalid", false);
  }
  if (!expectedSubject) {
    throw new AppleSignInRevocationError("apple_identity_verification_failed", false);
  }

  const fetchImplementation = dependencies.fetchImplementation ?? fetch;
  const verifyIdentityToken = dependencies.verifyIdentityToken ?? verifyAppleIdentityToken;
  const clientSecret = await createClientSecret(config, dependencies.now ?? new Date());
  const exchangeResponse = await postAppleForm(
    APPLE_TOKEN_URL,
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: clientSecret,
      code: authorizationCode,
      grant_type: "authorization_code",
    }),
    fetchImplementation,
  );
  if (!exchangeResponse.ok) {
    throw new AppleSignInRevocationError(
      "apple_token_exchange_failed",
      exchangeResponse.status === 429 || exchangeResponse.status >= 500,
    );
  }
  const exchange = await readBoundedAppleJson(exchangeResponse);
  const refreshToken = exchange.refresh_token;
  const idToken = exchange.id_token;
  if (
    typeof refreshToken !== "string" || refreshToken.length < 16 ||
    typeof idToken !== "string" || idToken.length < 16
  ) {
    throw new AppleSignInRevocationError("apple_token_exchange_failed", true);
  }

  const verified = await verifyIdentityToken(idToken, config.clientId);
  if (verified.subject !== expectedSubject) {
    throw new AppleSignInRevocationError("apple_identity_mismatch", false);
  }

  return { refreshToken };
}

/**
 * Revoke a refresh token that has already been durably encrypted in Supabase
 * Vault. Retrying this call after a process crash is safe under the token
 * revocation contract; no token value is ever attached to an error or log.
 */
export async function revokeAppleRefreshToken(
  refreshToken: string,
  config: AppleSignInRevocationConfig | null = loadAppleSignInRevocationConfig(),
  dependencies: AppleRevocationDependencies = {},
): Promise<{ revoked: true }> {
  if (!config) {
    throw new AppleSignInRevocationError("apple_revocation_not_configured", false);
  }
  if (
    typeof refreshToken !== "string" || refreshToken.length < 16 ||
    refreshToken.length > 8_192 || containsAsciiControl(refreshToken)
  ) {
    throw new AppleSignInRevocationError("apple_token_revocation_failed", false);
  }
  const fetchImplementation = dependencies.fetchImplementation ?? fetch;
  const clientSecret = await createClientSecret(config, dependencies.now ?? new Date());

  const revokeBody = new URLSearchParams({
    client_id: config.clientId,
    client_secret: clientSecret,
    token: refreshToken,
    token_type_hint: "refresh_token",
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const revokeResponse = await postAppleForm(
        APPLE_REVOKE_URL,
        revokeBody,
        fetchImplementation,
      );
      if (revokeResponse.ok) return { revoked: true };
      if (revokeResponse.status !== 429 && revokeResponse.status < 500) {
        throw new AppleSignInRevocationError("apple_token_revocation_failed", false);
      }
    } catch (error) {
      if (
        !(error instanceof AppleSignInRevocationError) || !error.retryable || attempt === 2
      ) throw error;
    }
  }
  throw new AppleSignInRevocationError("apple_token_revocation_failed", true);
}

/** Backward-compatible composition used by focused unit tests and callers. */
export async function revokeAppleAuthorizationCode(
  authorizationCode: string,
  expectedSubject: string,
  config: AppleSignInRevocationConfig | null = loadAppleSignInRevocationConfig(),
  dependencies: AppleRevocationDependencies = {},
): Promise<{ revoked: true }> {
  const { refreshToken } = await exchangeAppleAuthorizationCode(
    authorizationCode,
    expectedSubject,
    config,
    dependencies,
  );
  return revokeAppleRefreshToken(refreshToken, config, dependencies);
}
