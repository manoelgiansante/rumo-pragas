export interface ExpoTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

/**
 * Parse only the documented one-ticket-per-message Expo response. Returning
 * null is intentionally conservative: a malformed 2xx can still mean that the
 * provider accepted bytes, so callers must record an unknown outcome instead
 * of treating it as a safe failure and retrying.
 */
export function parseExpoTickets(payload: unknown, expectedCount: number): ExpoTicket[] | null {
  if (
    typeof payload !== "object" || payload === null || Array.isArray(payload) ||
    !Array.isArray((payload as Record<string, unknown>).data) ||
    ((payload as Record<string, unknown>).data as unknown[]).length !== expectedCount
  ) {
    return null;
  }

  const tickets: ExpoTicket[] = [];
  for (const candidate of (payload as { data: unknown[] }).data) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      return null;
    }
    const raw = candidate as Record<string, unknown>;
    if (raw.status === "ok") {
      tickets.push({ status: "ok" });
      continue;
    }
    if (raw.status !== "error") return null;
    const rawDetails = raw.details;
    const error = typeof rawDetails === "object" && rawDetails !== null &&
        !Array.isArray(rawDetails) &&
        typeof (rawDetails as Record<string, unknown>).error === "string"
      ? String((rawDetails as Record<string, unknown>).error)
      : undefined;
    tickets.push(error ? { status: "error", details: { error } } : { status: "error" });
  }
  return tickets;
}
