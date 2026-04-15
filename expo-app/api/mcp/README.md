# MCP Server — rumo-pragas

HTTP MCP endpoint em `/api/mcp/server` (Vercel serverless). Expõe diagnósticos e biblioteca de pragas.

## Supabase
- Project: `jxcnfyeemdltdfqtgbcl` (shared)
- `SUPABASE_SERVICE_ROLE_KEY` exigida
- `EXPO_PUBLIC_SUPABASE_URL` (ou `SUPABASE_URL`)

## Auth
`x-ia-hub-token: <token>` (env `MCP_API_TOKEN`). Gerar via `openssl rand -hex 32`.

## Rate limit
30 req/min por token (in-memory per-instance).

## Tools
| Nome | Descrição |
|------|-----------|
| `list_diagnoses` | Lista diagnósticos (filtra userId/status) |
| `get_diagnosis` | Detalhes de um diagnóstico |
| `search_pest_library` | Busca por nome/sintoma (filtro por cultura) |
| `get_pest_history` | Histórico e top pragas do usuário |

`diagnose_photo` foi intencionalmente omitido (idempotência complexa — fase 2).

## Exemplos
```bash
# listar tools
curl -X POST $URL/api/mcp/server -H "x-ia-hub-token: $TOKEN" -H "Content-Type: application/json" -d '{"method":"tools/list"}'

# chamar tool
curl -X POST $URL/api/mcp/server -H "x-ia-hub-token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"method":"tools/call","params":{"name":"search_pest_library","arguments":{"query":"lagarta","culture":"soja"}}}'
```

## TODO fase 2
- [ ] tabela `mcp_api_tokens` com RLS admin-only
- [ ] Upstash rate limit
- [ ] `diagnose_photo` tool (com idempotency key)
- [ ] Audit log
