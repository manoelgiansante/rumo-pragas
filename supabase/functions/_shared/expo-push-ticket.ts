export interface ExpoTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

export type ExpoPushCategory = "transactional" | "climate_risk_educational";

export type ExpoPushHttpDisposition =
  | "tickets"
  | "configuration_error"
  | "request_error"
  | "unknown_outcome";

export type ExpoPushTerminalDisposition =
  | "delivered"
  | "new_notification_id_required"
  | "invalid";

export function classifyExpoPushHttpStatus(status: number): ExpoPushHttpDisposition {
  if (!Number.isInteger(status) || status < 100 || status > 599) return "unknown_outcome";
  if (status >= 200 && status < 300) return "tickets";
  if (status === 401 || status === 403) return "configuration_error";
  if (status >= 500) return "unknown_outcome";
  return "request_error";
}

export function classifyExpoPushTerminalStatus(status: unknown): ExpoPushTerminalDisposition {
  if (status === "sent" || status === "partial") return "delivered";
  if (status === "failed") return "new_notification_id_required";
  return "invalid";
}

export function resolveExpoPushChannel(category: ExpoPushCategory): "general" | "climate-risk" {
  return category === "climate_risk_educational" ? "climate-risk" : "general";
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
