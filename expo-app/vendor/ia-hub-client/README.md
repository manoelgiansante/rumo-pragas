# @agrorumo/ia-hub-client

Universal SDK for the **Rumo IA Hub** — one client used by every AgroRumo product (RN apps, Next.js web, Vercel Edge functions, Node scripts).

Pattern modeled after Stripe / OpenAI / Anthropic SDKs: small surface, predictable errors, zero heavy deps.

```
npm i @agrorumo/ia-hub-client
```

## Quickstart

```ts
import { RumoIAHub } from "@agrorumo/ia-hub-client";

const ia = new RumoIAHub({
  apiKey: process.env.RUMO_IA_HUB_API_KEY!,
  appSlug: "rumo-pragas",
});

const r = await ia.chat({
  messages: [{ role: "user", content: "Quais máquinas estão paradas?" }],
});

console.log(r.text);
```

## Why a SDK and not raw `fetch`?

- One place to evolve auth headers (`Authorization`, `X-App-Slug`, `X-Rumo-User-Id`).
- Built-in retries (5xx + 429 with `Retry-After` honoured, exponential backoff with jitter).
- Typed errors (`RumoIAAuthError`, `RumoIARateLimitError`, `RumoIANetworkError`, …) — single `instanceof RumoIAError` check.
- SSE streaming parser that works on RN Hermes (where `response.body` is sometimes absent).
- File uploads accept three shapes (`Blob`, `File`, RN-style `{ uri, type, name }`) — same call works on every platform.
- Tree-shakeable ESM + CJS dual build. Tiny: zero runtime deps beyond `fetch`.

## Constructor

```ts
new RumoIAHub({
  apiKey: string;            // required, scoped per app
  appSlug: AppSlug;          // required, e.g. "rumo-pragas"
  baseUrl?: string;          // defaults to https://hub.agrorumo.com
  timeoutMs?: number;        // defaults to 60_000
  maxRetries?: number;       // defaults to 3
  userAgentSuffix?: string;
  fetch?: typeof fetch;      // inject for tests / older runtimes
  userId?: string;           // sent as X-Rumo-User-Id
  defaultHeaders?: Record<string, string>;
  debug?: boolean;
})
```

## Endpoints

### `chat(input, opts?)` — non-streaming

```ts
const r = await ia.chat({
  messages: [
    { role: "user", content: "Quanto rendeu hoje no L01?" },
  ],
  conversationId: "conv-uuid-or-undefined",
});

r.text;            // assistant text
r.conversationId;  // server-assigned
r.toolCalls?;      // breadcrumbs for the UI
r.usage?;          // tokens
```

### `chatStream(input, opts?)` — streaming

Returns an `AsyncGenerator<ChatChunk>`. Iterate to receive `text-delta`, `tool-call`, `tool-result`, `finish`, `error` events.

```ts
for await (const c of ia.chatStream({ messages })) {
  if (c.type === "text-delta") process.stdout.write(c.text);
  if (c.type === "tool-call")  console.log("→ tool:", c.toolName);
  if (c.type === "finish")     break;
}
```

The parser handles both standard SSE (`data: {...}\n\n`), NDJSON (`{...}\n`), naked text frames, and the legacy `{ delta: "..." }` shape. On React Native runtimes where `response.body` is not exposed, the SDK falls back to a single full-text chunk.

### `diagnose(input, opts?)`

Vision + text triage. Accepts up to N images per request.

```ts
const r = await ia.diagnose({
  prompt: "Manchas amarelas em folha de soja R3",
  context: { crop: "soja", phase: "R3" },
  images: [
    { uri: "file:///tmp/leaf.jpg", type: "image/jpeg", name: "leaf.jpg" },
  ],
});
r.diagnosis;
r.confidence;
r.candidates;       // [{ label, confidence, rationale? }]
r.recommendations?; // [string, ...]
```

### `forecast(input, opts?)`

Time-series prediction. `kind` is product-defined (`"gmd"`, `"yield"`, `"milk"`, …).

```ts
const r = await ia.forecast({
  kind: "gmd",
  horizonDays: 30,
  features: { loteId: "L01", weighings: [...] },
});
r.points; // [{ t, value, lo?, hi? }, ...]
```

### `recommend(input, opts?)`

Ranked suggestions for a domain.

```ts
const r = await ia.recommend({
  domain: "input-protocol",
  context: { crop: "soja", phase: "R3" },
  topK: 5,
});
r.items; // [{ id, title, score, rationale?, payload? }, ...]
```

### `validate(input, opts?)`

Schema + semantic validation. Server may return a corrected `suggested` payload.

```ts
const r = await ia.validate({
  kind: "tank-level",
  payload: { current: 80, capacity: 100 },
});
if (!r.ok) console.error(r.errors);
```

## Per-request options

Every method accepts an optional second argument:

```ts
{
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  appSlug?: AppSlug;
  idempotencyKey?: string;
}
```

`idempotencyKey` is sent as the `Idempotency-Key` header so retries on the wire (mobile networks, captive portals) never double-insert.

## Errors

```ts
try {
  await ia.chat({ messages });
} catch (err) {
  if (err instanceof RumoIARateLimitError) backoff(err.retryAfterSec);
  else if (err instanceof RumoIAAuthError)  refreshKey();
  else if (err instanceof RumoIANetworkError) showOffline();
  else throw err;
}
```

| Class                    | When                                         |
| ------------------------ | -------------------------------------------- |
| `RumoIANetworkError`     | DNS / TLS / fetch threw / timeout            |
| `RumoIAAuthError`        | 401 / 403                                    |
| `RumoIAClientError`      | 4xx (other)                                  |
| `RumoIARateLimitError`   | 429 — exposes `retryAfterSec`                |
| `RumoIAServerError`      | 5xx (after retries exhausted)                |
| `RumoIAStreamError`      | SSE stream interrupted mid-flight            |
| `RumoIAAbortError`       | Caller-supplied `signal` aborted             |
| `RumoIAError` (base)     | Anything else SDK-originated                 |

## React Native specifics

- `fetch` + `AbortController` are global in Hermes ≥ RN 0.71 — no polyfill needed.
- File uploads use the canonical `{ uri, type, name }` shape; pass it directly to `images: [...]` and the SDK builds the `FormData`.
- Streaming: when `response.body` is not exposed (some RN runtimes), the SDK falls back to a single full-text chunk so calls still complete. For real streaming on RN, install `react-native-fetch-api` or `expo-fetch`.

## Examples

See [`examples/`](./examples) — runnable TypeScript stubs for Pragas (vision), Confinamento (forecast), Vet (streaming + vision).

## Build

```
pnpm install
pnpm build      # tsup → dist/{index.js,index.cjs,index.d.ts}
pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
```

## Versioning

`0.x` — surface may change without major bump while the IA Hub server is stabilising. From `1.0` onwards we follow strict semver.
