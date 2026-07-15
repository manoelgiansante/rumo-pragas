import { assertEquals } from "@std/assert";
import { parseExpoTickets } from "../_shared/expo-push-ticket.ts";

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
