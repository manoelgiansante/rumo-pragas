# MCP server — Rumo Pragas

The Vercel endpoint `/api/mcp/server` implements MCP Streamable HTTP with
JSON-RPC 2.0 and protocol version `2025-11-25`. It is a stateless JSON-response
server: clients use `POST`; `GET` returns `405` because this deployment does not
offer a server-initiated SSE stream.

## Required environment

- `EXPO_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY`
- `MCP_ALLOWED_ORIGINS`: optional comma-separated replacement for the fixed
  production and local-development Origin allowlist

The server does not use a Supabase service-role key. It verifies the caller's
Supabase access token with `auth.getUser` and performs every tool query through
that same user's JWT, leaving RLS as the authorization boundary. Tool handlers
also bind `user_id` to the verified identity as defense in depth.

Do not configure `MCP_API_TOKEN` or `SUPABASE_SERVICE_ROLE_KEY` for this route.

## HTTP and lifecycle contract

Every `POST` requires:

```http
Authorization: Bearer <supabase-user-access-token>
Content-Type: application/json
Accept: application/json, text/event-stream
```

After `initialize`, every request and notification also requires:

```http
MCP-Protocol-Version: 2025-11-25
```

Browser requests with an `Origin` not in `MCP_ALLOWED_ORIGINS` are rejected
with `403`. `OPTIONS` returns `204`. The server emits `Cache-Control: no-store`
and does not place tokens or tool arguments in logs.

Initialize with a JSON-RPC request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": { "name": "release-smoke", "version": "1.0.0" }
  }
}
```

The result declares the negotiated protocol, server information and
`tools.listChanged=false`. Then send the notification below; a successful
notification returns `202` with no body.

```json
{ "jsonrpc": "2.0", "method": "notifications/initialized" }
```

## Tools

| Name                  | Purpose                                            | Input                         |
| --------------------- | -------------------------------------------------- | ----------------------------- |
| `list_diagnoses`      | List diagnoses owned by the authenticated user     | `status?`, `limit?`           |
| `get_diagnosis`       | Read one diagnosis owned by the authenticated user | `diagnosisId`                 |
| `search_pest_library` | Search the public educational pest catalog         | `query`, `culture?`, `limit?` |
| `get_pest_history`    | Summarize the authenticated user's pest history    | `sinceDays?`                  |

All published tools declare read-only, non-destructive and idempotent MCP
annotations. `diagnose_photo` is intentionally absent because provider-backed
mutation is outside this read-only MCP surface. Diagnosis results omit
`user_id`, raw-photo URLs and exact coordinates; ownership is enforced without
echoing identity or image handles to the MCP client.

List tools:

```json
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }
```

Call a tool:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "list_diagnoses",
    "arguments": { "limit": 10 }
  }
}
```

Tool results use the standard MCP content envelope, for example
`result.content[]`; tool-level failures set `result.isError=true`. Protocol and
transport failures use JSON-RPC `error` objects.

## Rate limit and idempotency

`tools/list` and `tools/call` share a durable Postgres limit of 30 executions
per minute per authenticated user. Each execution uses a server nonce and a
SHA-256 hash of the JSON-RPC method and params; retries are counted, and
database failure returns `503` rather than bypassing protection.

The current tools are read-only, so clients must not send an
`Idempotency-Key`. Any future mutating tool must first be added to the server's
mutating allowlist and require a caller-supplied UUID key bound to the request
hash.

## Verification

Run the real SDK compatibility test and TypeScript gate from `expo-app`:

```bash
npm run validate:mcp-sdk
npm run typecheck
```

`validate:mcp-sdk` starts a local HTTP adapter and connects with the official
`@modelcontextprotocol/sdk` `Client` and `StreamableHTTPClientTransport`. It
proves initialize/initialized, protocol negotiation, tool listing and call
envelopes, per-user query binding, response minimization, Origin rejection,
durable rate-limit arguments and the intentional `GET 405` path.
