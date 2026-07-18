# Rate limits and Edge deployment boundary — Rumo Pragas

Last updated: 2026-07-14
Supabase project: `jxcnfyeemdltdfqtgbcl`

Rumo Pragas launches as a free product. There is no plan-based quota, checkout,
subscription or billing entitlement in the active client. The limits below are
abuse and cost controls, not paid-plan enforcement.

## Durable limiter

Every public Rumo Pragas Edge endpoint uses the Postgres-backed
`consume_pragas_api_rate_limit(uuid,text,integer,integer,uuid,text)` contract.
The two storage tables force RLS and are available only to `service_role`.
The authenticated MCP wrapper fixes the caller identity, scope, limit and
window in the database.

The final argument is a lowercase SHA-256 hash of the exact request identity:
method, path, canonical query and body for Edge requests, or JSON-RPC method and
params for MCP. An idempotency key reused with a different hash is a `409`
conflict. Reusing the same key with the same request still increments the
counter for every execution; a retry never becomes a free rate-limit bypass.

The limiter takes a transaction-scoped advisory lock per user and scope, so
concurrent workers share one counter. If Postgres or the RPC is unavailable,
the endpoint fails closed with `503`.

| Scope | Endpoint | Limit |
| --- | --- | --- |
| `diagnose` | `diagnose-pragas` | 10/hour/user |
| `ai_chat` | `ai-chat-pragas` | 20/minute/user |
| `analytics` | `pragas-analytics` | 30/minute/user |
| `report_ai_content` | `report-ai-content` | 5/hour/user |
| `diagnosis_feedback` | `report-diagnosis-feedback` | 20/day/user |
| `admin_ai_reports` | `admin-ai-content-reports` | 120/minute/admin |
| `export_user_data` | `pragas-export-user-data` | 2/hour/user |
| `delete_user_account` | `pragas-delete-user-account` | 3/day/user |
| `reactivate_user_account` | `pragas-reactivate-account` | 3/hour/user |
| `mcp` | `/api/mcp/server` tools | 30/minute/user |

Rate-limited Edge responses expose `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, `X-RateLimit-Reset` and, on `429`, `Retry-After`.
The MCP endpoint returns the retry delay in both `Retry-After` and the JSON-RPC
error data.

AI provider idempotency is separate from rate limiting. Diagnosis and chat use
lease tokens and a provider-start marker. A stale lease may be reclaimed only
before the provider starts. Once provider execution may have begun, a lost
worker becomes terminal `unknown_outcome`; it is not resent automatically.
Push delivery uses the same safety rule through its own claim/lease ledger.

## CORS and Origin policy

Edge functions return an origin only when it is present in their fixed safe
defaults or in the explicit `ALLOWED_ORIGINS` secret. Never use `*` with
authenticated requests. The MCP endpoint uses the independent
`MCP_ALLOWED_ORIGINS` comma-separated allowlist and returns `403` for any
unlisted `Origin`.

## Production deploy allowlist

There is no deploy-all command for this shared Supabase project. A Rumo Pragas
release may deploy only the reviewed source for these active free-product
slugs, one by one, during an authorized production window:

```text
admin-ai-content-reports
ai-chat-pragas
diagnose-pragas
pragas-analytics
pragas-delete-user-account
pragas-export-user-data
pragas-process-ai-idempotency
pragas-process-deletions
pragas-reactivate-account
pragas-send-push
report-ai-content
report-diagnosis-feedback
```

`bash supabase/functions/deploy-pragas-allowlist.sh` prints and validates this
allowlist without network mutation. Its explicit execute mode remains subject
to the production gate in `docs/launch-runbook.md`.

Never deploy the generic/shared slugs `diagnose`, `ai-chat`, `analytics`,
`delete-user-account`, `process-deletions`, `send-push`, `version-check`,
`revenuecat-webhook` or `stripe-webhook` from this release. Their zero-diff
state is a release invariant.

The dedicated legacy slugs `disease-risk`,
`create-checkout-session-pragas`, `stripe-webhook-pragas`,
`stripe-customer-portal-pragas`, `asaas-checkout-pragas` and
`asaas-webhook-pragas` are not in the normal allowlist. Local tombstones prevent
accidental resurrection, but replacing or deactivating their live versions is
a separately authorized production reconciliation with captured rollback
versions. Real subscription rows are not changed by that operation.

## Verification and monitoring

Before any Edge deployment:

```bash
bash supabase/tests/pragas-backend-security-integration.sh
cd supabase/functions
deno task gate
```

Monitor `429`, `409`, `503`, lease expiry and terminal `unknown_outcome` counts
without recording JWTs, provider keys, raw photos, chat content, email, exact
coordinates or push tokens. Repeated unknown outcomes require operator review;
they must never trigger an automatic provider resend.
