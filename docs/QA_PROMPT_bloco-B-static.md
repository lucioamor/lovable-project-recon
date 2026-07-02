# QA prompt — Bloco B (coletor `static` real)

_Rodar este QA **antes** de começar a próxima fase (bloco C / bloco D). Objetivo: provar que o
coletor `static` é correto, honesto e seguro — não só que "roda"._

Cole o texto abaixo num agente de revisão com acesso read-only ao repositório.

---

## Contexto

O bloco B substituiu o stub `packages/core/src/collect/static.ts` por um coletor real que varre um
checkout Lovable/Supabase (`supabase/config.toml`, `supabase/migrations/*.sql`, `src/**`) e emite
evidência normalizada. Ele destrava POL-3 (defaults de fetch), a metade estática de POL-4 (model
preview/alias) e POL-5 (RLS parseado das migrations), e captura *shapes* de credencial para POL-6.

Arquivos tocados nesta fase:
- `packages/core/src/collect/static.ts` (reescrito)
- `packages/profile-cost/src/policies/pol-3-fetch-defaults.ts` (background-polling + auth fan-out)
- `packages/profile-cost/src/policies/pol-4-ai-cost.ts` (guarda `source:"static"`)
- `packages/recon/src/cli.ts` (flag `--repo`)
- `test/static.test.ts` (novo)

## Você é

Um revisor cético. Seu trabalho é **quebrar** o coletor e encontrar afirmações desonestas, não
elogiá-lo. Assuma que "os testes passam" não é suficiente.

## Portão obrigatório (rode e cole a saída)

```bash
npm ci
npm run ci          # typecheck + lint + format:check + 59 testes — precisa passar 100%
npm run demo        # o golden do demo NÃO pode mudar (byte-a-byte)
```

Se qualquer passo falhar, **pare** e reporte — a fase não está pronta para QA de conteúdo.

## Checklist de correção

1. **Parsing de policies** (`parsePolicies`): confira contra migrations reais que nomes com aspas e
   espaços (`CREATE POLICY "Anyone can insert" ON ...`), esquema-qualificados (`public.t`), `FOR ALL`
   implícito, `TO anon, authenticated`, e `USING (...)` multi-linha são extraídos corretamente.
   Construa 3 migrations adversariais e verifique. Policies comentadas (`-- CREATE POLICY`) devem ser ignoradas.
2. **Parsing de edge functions** (`parseEdgeFunctions`): blocos `[functions.x]` com e sem `verify_jwt`,
   e a distinção entre `verify_jwt` ausente (`undefined`) vs `false`.
3. **Scan de source**: `staleTime:0`, `refetchIntervalInBackground:true`, `refetchInterval:N`,
   `onAuthStateChange`, `dangerouslySetInnerHTML`, e model IDs preview/alias são detectados com o
   arquivo:linha correto. Cheque falsos-negativos (variações de espaçamento) e falsos-positivos.

## Checklist de honestidade (o mais importante)

4. **Nenhum crítico inventado.** Um `ai_config` de origem `static` **não** pode levantar
   `POL-4:no-cap` (o source não vê `max_cost_usd`). Prove que a guarda `source:"static"` funciona e
   que `db` mode ainda levanta o crítico quando o cap é realmente `NULL`.
5. **Segredos redigidos.** `raw.static.secretSignals` grava apenas o *shape* (`jwt-literal` /
   `service-role-ref`) e **nunca** o valor do token. Faça grep no output de um scan para garantir que
   nenhum `eyJ...` real vaza para o report nem para o JSON (`--json`).
6. **Degradação honesta.** Sem `--repo`, repo inexistente, ou pasta que não é Lovable: retorna scan
   vazio com warning explícito, **sem throw**. Os warnings deixam claro que static não enxerga runtime
   (tamanhos de tabela, contagem de runs, gasto de IA)?
7. **Confidence calibrada.** Sinais que o source não consegue provar (auth fan-out, refetchInterval
   curto) são `hypothesis`, não `confirmed`. Confirme.

## Checklist de segurança / robustez

8. **Read-only de verdade.** O coletor só lê arquivos — nunca executa o source, nunca escreve. Confirme.
9. **Sem travar em árvores grandes:** `node_modules`/`.git`/`dist` são pulados; limites `MAX_FILES`
   e `MAX_FILE_BYTES` respeitados; arquivos binários/ilegíveis não derrubam o scan (`safeRead` engole erro).
10. **Determinismo.** Dois runs sobre o mesmo repo produzem o mesmo report (ordenação estável).

## Teste de campo (se houver repo-alvo)

Rode contra **um checkout Lovable real**:
```bash
node packages/recon/src/cli.ts scan --mode static --repo <path> --project <nome> --out /tmp/r.md
```
Leia o report inteiro e responda: algum finding é claramente um falso-positivo? Algum desperdício
óbvio no source passou batido? A capability matrix bate com o que existe no `supabase/config.toml`?

## Saída esperada do QA

Um veredito curto: **PASS / PASS-com-ressalvas / FAIL**, seguido da lista numerada de defeitos
encontrados (com arquivo:linha e um caso reproduzível para cada). Priorize defeitos de **honestidade**
(itens 4–7) sobre defeitos cosméticos.
