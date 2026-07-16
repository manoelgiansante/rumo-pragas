export const GLOBAL_DELETION_CONFIRMATION = "DELETE_MY_ENTIRE_AGRORUMO_ACCOUNT";
export const GLOBAL_DELETION_CONFIRMATION_VERSION = "agrorumo-global-account-deletion/2026-07-16.1";
export const GLOBAL_DELETION_SCOPE_VERSION = "agrorumo-entire-account/2026-07-16.1";
export const GLOBAL_DELETION_RECEIPT_PREFIX = "AGR-DEL-";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_64_PATTERN = /^[0-9a-f]{64}$/;

export type GlobalDeletionReauthenticationMethod =
  | "password"
  | "oauth"
  | "otp"
  | "sso"
  | "mfa";

export interface ValidatedSessionClaims {
  sessionId: string;
  issuedAt: Date;
  reauthenticationMethod: GlobalDeletionReauthenticationMethod | null;
  authenticationAt: Date | null;
}

interface AuthenticationMethodReference {
  method?: unknown;
  timestamp?: unknown;
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - normalized.length % 4) % 4);
    return atob(normalized + padding);
  } catch {
    return null;
  }
}

function mapAuthenticationMethod(value: string): GlobalDeletionReauthenticationMethod | null {
  switch (value.toLowerCase()) {
    case "password":
      return "password";
    case "oauth":
    case "id_token":
      return "oauth";
    case "otp":
    case "magiclink":
    case "email_otp":
      return "otp";
    case "sso":
      return "sso";
    case "mfa":
    case "totp":
    case "phone":
      return "mfa";
    default:
      return null;
  }
}

/**
 * Decodes only claims from a JWT that has already passed auth.getUser().
 * This helper never verifies a token and must not be used before server-side
 * authentication. The deletion endpoint enforces that ordering.
 */
export function parseValidatedSessionClaims(token: string): ValidatedSessionClaims | null {
  const segments = token.split(".");
  if (segments.length !== 3 || !segments[1]) return null;
  const decoded = decodeBase64Url(segments[1]);
  if (!decoded) return null;

  let claims: Record<string, unknown>;
  try {
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    claims = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const sessionId = claims.session_id;
  const issuedAtSeconds = claims.iat;
  if (
    typeof sessionId !== "string" || !UUID_PATTERN.test(sessionId) ||
    typeof issuedAtSeconds !== "number" || !Number.isSafeInteger(issuedAtSeconds) ||
    issuedAtSeconds <= 0
  ) return null;

  const issuedAt = new Date(issuedAtSeconds * 1_000);
  if (Number.isNaN(issuedAt.getTime())) return null;

  let reauthenticationMethod: GlobalDeletionReauthenticationMethod | null = null;
  let authenticationAt: Date | null = null;
  const amr = Array.isArray(claims.amr) ? claims.amr as AuthenticationMethodReference[] : [];
  for (const reference of amr) {
    if (!reference || typeof reference !== "object") continue;
    if (typeof reference.method !== "string" || typeof reference.timestamp !== "number") {
      continue;
    }
    const mapped = mapAuthenticationMethod(reference.method);
    if (!mapped || !Number.isSafeInteger(reference.timestamp) || reference.timestamp <= 0) {
      continue;
    }
    const timestamp = new Date(reference.timestamp * 1_000);
    if (Number.isNaN(timestamp.getTime())) continue;
    if (!authenticationAt || timestamp > authenticationAt) {
      reauthenticationMethod = mapped;
      authenticationAt = timestamp;
    }
  }

  return { sessionId: sessionId.toLowerCase(), issuedAt, reauthenticationMethod, authenticationAt };
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isHexSecret(value: unknown): value is string {
  return typeof value === "string" && HEX_64_PATTERN.test(value);
}

export function formatGlobalDeletionReceipt(receiptId: string): string {
  return `${GLOBAL_DELETION_RECEIPT_PREFIX}${receiptId.toLowerCase()}`;
}

export function parseGlobalDeletionReceipt(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(GLOBAL_DELETION_RECEIPT_PREFIX)) {
    return null;
  }
  const receiptId = value.slice(GLOBAL_DELETION_RECEIPT_PREFIX.length);
  return isUuid(receiptId) ? receiptId.toLowerCase() : null;
}

export function randomHexSecret(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
