# Recon — Roadmap

_Cost/runtime/waste recon + cleanup for Lovable Cloud portfolios. Sibling of `lovable-audit` (security)._

**Última atualização:** 2026-07-01 · **Versão de trabalho:** M0 (fundação) + bloco B (coletor `static` real)

Legenda de status: ✅ feito · 🟡 em andamento · ⬜ a fazer · 🔒 bloqueado (precisa de credencial/decisão)

---

## 1. Visão

O produto tem um núcleo (`core`) read-only que roda um pipeline determinístico sobre a
evidência de um projeto Lovable/Supabase e emite um report de desperdício de runtime.
Sobre esse núcleo montam-se profiles (`profile-cost` = POL-1..9; futuro `profile-security`),
coletores (demo/db/static/portfolio), e superfícies (CLI hoje; SaaS/extensão depois).

### Pipeline alvo

```
collect → detect → score → evaluate → [report]      ← recon scan  (read-only, grátis)
                                   └─→ remediate → verify   ← recon clean (write, gated)
```

Hoje o pipeline vai até `score` de forma determinística. `evaluate` (camada contextual por IA)
e `clean` (remediate/verify) ainda não existem em código.

---

## 2. Milestones

| Milestone | Escopo | Status |
|---|---|---|
| **M0** | Fundação: monorepo, modelo de evidência, engine de regras, POL-1..9, coletores demo+db+**static**, report, CLI | 🟡 quase — scaffold **provado** (bloco A) + coletor `static` real (bloco B) |
| **M1** | `profile-security` — portar `lovable-audit` sobre o mesmo core | ⬜ |
| **M2** | `packages/benchmarks` (percentis cross-project, waste-score de portfólio) + superfície SaaS/cockpit no Register | ⬜ |
| **M3** | `recon clean` — remediação com `--dry-run` default, `--apply` gated, só `confirmed` | ⬜ |
| **M4** | Coletor `portfolio` via extensão (browser-first, findings não tokens) | ⬜ |

---

## 3. ✅ Implementado

### 3.1 Fundação M0 (scaffold pré-existente)
- ✅ Monorepo npm workspaces: `core`, `profile-cost`, `recon` (Node 22 TS-strip, `.ts` imports).
- ✅ Modelo de evidência normalizado: `Resource / Observation / Finding / Evidence / RemediationAction / RiskScore`.
- ✅ Engine de regras + registry (`Rule.evaluate(ctx) -> Finding[]`, puro, isola exceções por regra).
- ✅ Biblioteca de audit queries como constantes SQL nomeadas.
- ✅ Coletor `demo` (fixture central-genial, completo) e `db` (Postgres read-only real).
- ✅ Agregação de waste-score (curva saturante, hypothesis < confirmed).
- ✅ Renderer de report em Markdown (capability matrix + findings + breakdown + warnings).
- ✅ CLI `recon scan --mode <m> [--db] [--project] [--out] [--json]`.

### 3.2 Bloco A — "de scaffold que roda o demo" → "fundação confiável" (sessão 2026-07-01)
- ✅ **Typecheck roda e passa.** Faltava `@types/pg`; `tsc --noEmit` limpo.
- ✅ **Suíte de testes (vitest), 59 testes / 6 arquivos:**
  - `util.test.ts` — parser de cron, log-detection, humanBytes.
  - `score.test.ts` — bounds, hypothesis<confirmed, breakdown, headline.
  - `policies.test.ts` — POL-1/POL-2/POL-9 sobre evidência sintética (positivos e negativos).
  - `db.test.ts` — parse de bytes defensivo, retention por cron, nomes schema-qualificados.
  - `static.test.ts` — parsers puros (`parsePolicies`/`parseEdgeFunctions`) + coletor e2e sobre repo-fixture sintético + degradação sem repo.
  - `golden.test.ts` — **golden-file** que congela o report demo byte-a-byte + assinatura M0.
- ✅ **`db` mode endurecido:** parse `NULL`/bigint-string à prova de NaN, inferência de retention
  lendo `DELETE/TRUNCATE` nos comandos de cron, âncora de `project` resource, e **warnings honestos**
  (incl. o limite: db mede só runtime — Build-mode, o maior custo, não aparece sem a API de créditos).
- ✅ **Infra de repo:** `package-lock.json`, CI GitHub Actions (typecheck+lint+format+test, actions
  SHA-pinadas), eslint (flat config) + prettier (printWidth largo p/ não reformatar fixtures), LICENSE.

### 3.3 Bloco B — coletor `static` real (sessão 2026-07-01)
- ✅ **`collectStatic` deixou de ser stub.** Caminhador de FS em Node puro (sem depender de `rg` no PATH),
  ignora `node_modules/dist/.git/…`, respeita limites de tamanho e nº de arquivos.
- ✅ **`supabase/config.toml`** → `project_id` (ref) + inventário de edge functions com `verify_jwt`.
- ✅ **`supabase/migrations/*.sql`** → `parsePolicies` (nomes com aspas/espaço, `FOR`, `TO`, `USING`)
  vira `rls_policy` resources — **POL-5 agora dispara sobre evidência estática**.
- ✅ **Scan de source** → `staleTime:0`, `refetchIntervalInBackground:true`, `refetchInterval`,
  `onAuthStateChange`, `dangerouslySetInnerHTML`, model IDs preview/alias, e **shapes** de credencial
  (JWT literal / `service_role`) — sempre redigidas, nunca o valor.
- ✅ **POL-3 destravado de verdade** (staleTime + background-polling + auth fan-out) e **POL-4 metade
  estática** (model quebrado como `hypothesis`) — **com guarda honesta:** um `ai_config` de origem
  `static` **não** levanta o crítico "sem teto de custo", porque o source não enxerga `max_cost_usd`.
- ✅ **Degradação honesta:** sem `--repo`, ou repo inexistente/não-Lovable, retorna scan vazio com
  warning explícito em vez de estourar. Warning fixo de que static não vê runtime (tamanhos, runs, gasto de IA).
- ✅ **CLI:** flag `--repo <path>` documentada + exemplo `--mode static`. `npm run ci` verde (typecheck+lint+format+59 testes).

### 3.4 Regras de custo (profundidade por política)

| Regra | Política | Estado |
|---|---|---|
| POL-1 | Higiene de cron | ✅ completa (frequência + host morto/preview/deadline) |
| POL-2 | Retenção de log/raw | ✅ completa (tamanho + share do DB) |
| POL-3 | Defaults de fetch | ✅ **live no `static`** (staleTime + background-polling + auth fan-out) |
| POL-4 | Custo de IA | 🟡 DB (`max_cost_usd=NULL`=crítico) + **static** (model preview/alias=hypothesis, sem falso "sem teto") |
| POL-5 | RLS / superfície de escrita anon | ✅ **DB + static** (policies parseadas das migrations) |
| POL-6 | Segredos em cron | 🟡 db/demo (cron) + **static capta shapes de credencial** (JWT/`service_role`); falta a regra consumir `raw.static.secretSignals` |
| POL-9 | Lifecycle de projeto idle | ✅ completa |
| POL-7 | Write-amplification | ⬜ stub documentado (precisa de `pg_get_triggerdef`) |
| POL-8 | Observabilidade | 🟡 raso (findings `hypothesis`) |

---

## 4. 🟡 Em andamento / próximo imediato

- ✅ **Coletor `static` real (bloco B)** — feito nesta sessão (ver §3.3). Rodar num repo-alvo Lovable
  real (checkout com `supabase/` + `src/`) é o próximo passo de validação de campo.
- 🟡 **Profundidade estática das regras (bloco C, primeira fatia)** — o coletor já emite os sinais;
  falta as regras consumirem: POL-6 ler `raw.static.secretSignals`, inventário de edge functions
  `verify_jwt=false`, `dangerouslySetInnerHTML`. Determinístico, sem bloqueio externo.
- 🟡 **Interface do estágio `evaluate` (bloco D)** — input de objetivo/roadmap + pipeline contextual.
  A parte determinística é implementável já; o julgamento por IA precisa de decisão de wiring de modelo.

---

## 5. ⬜ A implementar

### Bloco B — coleta real
- ⬜ Coletor `portfolio`: fan-out com token autorizado (browser-first, via extensão) — 🔒 precisa de token.
- ⬜ POL-1 usar `net._http_response` (host morto/401) que o coletor já lê — hoje só flag de frequência.
- 🔒 API de créditos: Build-mode (~62% do custo) é HQ-only; um scan de DB não enxerga. Documentar honestamente até existir.

### Bloco C — profundidade das regras
- ⬜ POL-7 write-amplification real (trigger bodies via `pg_get_triggerdef`).
- ⬜ POL-8 observabilidade além de `hypothesis`.
- ⬜ Regras consumirem os sinais estáticos que o coletor **já emite**: POL-6 sobre `raw.static.secretSignals`,
  edge functions com `verify_jwt=false`, `dangerouslySetInnerHTML`, `SECURITY DEFINER` EXECUTE, PII.
- ⬜ Modelo de custo real (créditos por invocação/MB) — hoje "créditos economizados" é qualitativo.

### Bloco D — camada contextual (o coração do pedido original)
- ⬜ Estágio `evaluate`: IA recebe evidência + objetivo declarado + roadmap e julga proporcionalidade,
  legado, feature abandonada, segurança do cleanup. 🔒 precisa de decisão de wiring de modelo.

### Bloco E — o moat (benchmarks) + portfólio
- ⬜ `packages/benchmarks`: percentis cross-project (ex.: "9 crons, p90=3"), waste-score de portfólio,
  ranking/consolidação. Hoje é 1 projeto por run; `lovable_projects_index.json` ainda não vira baseline.

### Bloco F — o verbo `clean`
- ⬜ Executor de remediação: `--dry-run`/`--apply`, enforcement de `applySafe`/`confirmed`,
  runner de migration + idempotência + verify (re-scan e diff). Hoje tudo é `applySafe: false`.

### Bloco G — superfícies futuras
- ⬜ M1 `profile-security` (portar `lovable-audit` sobre o mesmo core).
- ⬜ M2 SaaS/cockpit no Register (backend que centraliza a experiência).
- ⬜ M4 extensão (coletor `portfolio`).

---

## 6. Como rodar hoje

```bash
npm ci
npm run typecheck     # tsc --noEmit, limpo
npm run test          # vitest, 59 testes
npm run ci            # typecheck + lint + format:check + test (o gate do CI)
npm run demo          # gera o report demo (central-genial)
```

`recon scan --mode db --db <postgresql://readonly:...>` roda o coletor DB real (read-only).
`recon scan --mode static --repo <path-to-lovable-checkout>` roda o coletor de source real (read-only).
