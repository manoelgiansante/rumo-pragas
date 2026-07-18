const URL_IN_TEXT = /(?:https?|rumopragas):\/\/[^\s"'<>]+/gi;
const SECRET_ASSIGNMENT =
  /\b(access_token|refresh_token|id_token|authorization|token|code)\s*[:=]\s*([^\s&,;]+)/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

export function stripUrlQueryAndFragment(value: string): string {
  return value.split(/[?#]/, 1)[0] ?? '';
}

/** Scrubs secrets without returning any fragment of their value. */
export function scrubSensitiveTelemetryText(value: string): string {
  return value
    .replace(URL_IN_TEXT, (url) => stripUrlQueryAndFragment(url))
    .replace(SECRET_ASSIGNMENT, (_match, key: string) => `${key}=[REDACTED]`)
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(JWT, '[REDACTED_JWT]');
}
