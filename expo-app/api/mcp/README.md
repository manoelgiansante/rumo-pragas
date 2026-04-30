# MCP Server — rumo-pragas

HTTP MCP endpoint em `/api/mcp/server` (Vercel serverless). Expõe diagnósticos do usuário autenticado e a biblioteca pública de pragas.

## Supabase

- Project: `jxcnfyeemdltdfqtgbcl` (shared)
- `EXPO_PUBLIC_SUPABASE_URL` (ou `SUPABASE_URL`)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` (ou `SUPABASE_ANON_KEY`)
- **Service-role key NÃO é mais usada.** Todas as queries passam pelo JWT do usuário e RLS é a fronteira de autorização.

## Auth (per-user JWT)

`Authorization: Bearer <supabase-user-jwt>`

- O servidor valida o JWT via `supabase.auth.getUser(jwt)` (anon-key client).
- O `userId` das tools vem do JWT verificado — **nunca** de input do caller.
- Tools rodam em um cliente Supabase com o `Authorization` header do usuário, então RLS é aplicada server-side.
- Todos os filtros `.eq('user_id', userId)` permanecem como defense-in-depth caso uma policy seja afrouxada.

`MCP_API_TOKEN` (env do modelo antigo) ainda existe no Vercel mas **não é mais lida**. Pode ser removida após o deploy desta correção (sunset planejado).

## Rate limit

30 req/min por `userId` autenticado (in-memory per-instance).

## Tools

| Nome                  | Descrição                                                          | Input                         |
| --------------------- | ------------------------------------------------------------------ | ----------------------------- |
| `list_diagnoses`      | Lista diagnósticos do usuário autenticado                          | `status?`, `limit?`           |
| `get_diagnosis`       | Detalhes de UM diagnóstico (rejeitado se não pertencer ao usuário) | `diagnosisId`                 |
| `search_pest_library` | Busca na biblioteca pública                                        | `query`, `culture?`, `limit?` |
| `get_pest_history`    | Histórico e top pragas do usuário autenticado                      | `sinceDays?`                  |

`diagnose_photo` foi intencionalmente omitido (idempotência complexa — fase 2).

## Exemplos

```bash
# tools/list
curl -X POST $URL/api/mcp/server \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/list"}'

# tools/call
curl -X POST $URL/api/mcp/server \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/call","params":{"name":"list_diagnoses","arguments":{"limit":10}}}'
```

## TODO fase 2

- [ ] Remover `MCP_API_TOKEN` do Vercel (após verificar zero callers do modelo antigo)
- [ ] Sunset `SUPABASE_SERVICE_ROLE_KEY` deste deployment
- [ ] Confirmar policies RLS na tabela `diagnoses` (`auth.uid() = user_id` em SELECT)
- [ ] Upstash rate limit (multi-instância)
- [ ] `diagnose_photo` tool (com idempotency key)
- [ ] Audit log persistido
