import { assertEquals } from "@std/assert";
import {
  classifyExpoPushHttpStatus,
  classifyExpoPushTerminalStatus,
  parseExpoTickets,
  resolveExpoPushChannel,
} from "../_shared/expo-push-ticket.ts";

Deno.test("Expo ticket parser accepts only a complete documented 2xx envelope", () => {
  assertEquals(
    parseExpoTickets({
      data: [
        { status: "ok", id: "provider-id-is-not-retained" },
        { status: "error", details: { error: "DeviceNotRegistered" } },
      ],
    }, 2),
    [
      { status: "ok" },
      { status: "error", details: { error: "DeviceNotRegistered" } },
    ],
  );
});

Deno.test("malformed or incomplete Expo 2xx tickets are an unknown outcome", () => {
  assertEquals(parseExpoTickets({ data: [{ status: "ok" }] }, 2), null);
  assertEquals(parseExpoTickets({ data: [null] }, 1), null);
  assertEquals(parseExpoTickets({ data: [{}] }, 1), null);
  assertEquals(parseExpoTickets({ data: [{ status: "accepted" }] }, 1), null);
  assertEquals(parseExpoTickets({ tickets: [{ status: "ok" }] }, 1), null);
});

Deno.test("Expo HTTP authentication rejection is a configuration error", () => {
  assertEquals(classifyExpoPushHttpStatus(200), "tickets");
  assertEquals(classifyExpoPushHttpStatus(299), "tickets");
  assertEquals(classifyExpoPushHttpStatus(400), "request_error");
  assertEquals(classifyExpoPushHttpStatus(401), "configuration_error");
  assertEquals(classifyExpoPushHttpStatus(403), "configuration_error");
  assertEquals(classifyExpoPushHttpStatus(429), "request_error");
  assertEquals(classifyExpoPushHttpStatus(500), "unknown_outcome");
});

Deno.test("Expo Android channel follows the truthful notification category", () => {
  assertEquals(resolveExpoPushChannel("climate_risk_educational"), "climate-risk");
  assertEquals(resolveExpoPushChannel("transactional"), "general");
});

Deno.test("terminal push contract accepts sent/partial and rejects failed replay", () => {
  assertEquals(classifyExpoPushTerminalStatus("sent"), "delivered");
  assertEquals(classifyExpoPushTerminalStatus("partial"), "delivered");
  assertEquals(classifyExpoPushTerminalStatus("failed"), "new_notification_id_required");
  assertEquals(classifyExpoPushTerminalStatus("pending"), "invalid");
  assertEquals(classifyExpoPushTerminalStatus(null), "invalid");
});
