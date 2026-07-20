> Recuperado do transcript da sessão 18-19/jul (retornos sobreviventes; sessão original morta por falso-positivo de Usage Policy 19/jul ~10h20). Conteúdo íntegro do agente.

Tudo verde na primeira execução. Nenhum código do repo foi tocado — apenas 2 scripts auxiliares em `~/tmp/pragas-smoke-20260718/` (`reactivate.sh` + `run-pr26.sh`), credenciais só via env dentro de script, nada ecoado.

## Relatório — Smoke PR-26 (prod jxcn, 18/07)

**Etapa A — Reativação** (`pragas-reactivate-account`, contrato extraído de `supabase/functions/pragas-reactivate-account/index.ts`: POST + Bearer JWT + `Idempotency-Key` UUID + body `{"confirm":"REACTIVATE_RUMO_PRAGAS"}`):
- login REST: **HTTP 200** (820ms)
- reativação: **HTTP 200** (4309ms) — body confirmou o contrato exato: `ok:true`, `code:PRAGAS_ACCOUNT_REACTIVATED`, `reactivated:true`, `dataRestored:false` (não restaura dados antigos, por design). Conta saiu de `deleted_reactivation_required`.

**Etapa B — Smoke oficial** (`bash scripts/smoke-ai-chat.sh`, pós-fix uuid4 `cc10b93`):
| Etapa | Resultado | HTTP | Latência |
|---|---|---|---|
| login (grant_type=password) | PASS | 200 | 464ms |
| ai-chat (slug compartilhado) | PASS | 200 | 2611ms |
| pragas_link_account (RPC) | PASS | 200 | 348ms |
| grant_pragas_ai_consent (chat) | PASS | 200 | 376ms |
| ai-chat-pragas (slug dedicado) | PASS | 200 | 4848ms |

- Saída final: `✅ SMOKE OK — 5/5 etapas retornaram HTTP 200`
- **Exit code: 0**
- user_id da conta smoke: `f0c702f4-c149-4d9d-9405-7a77bd4c4e13`

**Veredito: PR-26 SELADO.** O script re-executável reproduz o E2E de 17/07 em produção do início ao fim (o 410 anterior era estado da conta, não bug do smoke; reativação via endpoint próprio resolveu). Nenhuma falha a investigar.
