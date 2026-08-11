/**
 * Smoke test da Fase 4 — histórico de status (historico_status_contrato) e
 * auditoria (auditoria_contratos), incluindo a prova de que a proteção
 * append-only (migration auditoria_append_only) é real, não decorativa.
 *
 * Reaproveita o setup de referências+contrato e o cliente HTTP já extraídos
 * na rodada de Produção (scripts/smoke-test-fixtures.ts,
 * scripts/smoke-test-helpers.ts) — não duplica essa lógica aqui.
 *
 * Uso (de dentro do container da API, com a API já rodando):
 *   docker compose exec api npm run smoke:fase4
 *
 * Reusável como teste de regressão: para no primeiro FAIL, mas a limpeza
 * roda sempre (sucesso ou falha) — nenhum estado de teste fica no banco.
 * Depois deste script, reconfirme também os 5 smoke tests anteriores
 * (fase2, fase3-producao, fase3-ambiental, fase3-logistica,
 * fase3-financeiro) — a Fase 4 mexe no fluxo de escrita de todas as
 * tabelas anteriores via extension, então regressão ali é o risco principal.
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma, runtimePrisma } from "../src/lib/prisma.js";
import { makeApiClient, assert, runSmokeSteps, type SmokeStep } from "./smoke-test-helpers.js";
import { criarReferencias, criarContrato, limparFixture, novoRunId } from "./smoke-test-fixtures.js";

const API_URL = process.env.SMOKE_API_URL ?? "http://localhost:3000";
const ADMIN_LOGIN = process.env.SEED_ADMIN_LOGIN ?? "admin";
const ADMIN_SENHA = process.env.SEED_ADMIN_SENHA ?? "troque-esta-senha";

const api = makeApiClient(API_URL);

async function main() {
  const { runId, numeroContrato } = novoRunId();

  let adminToken = "";
  let organizacaoId = "";

  let especieId = "";
  let produtoId = "";
  let importadorId = "";
  let representanteId = "";
  let statusId = "";
  let statusNovoId = "";
  let contratoId = "";

  let comercialUserId = "";
  let algumaAuditoriaId = "";

  const steps: SmokeStep[] = [
    {
      name: "1) Login admin + criar contrato de teste (setup reaproveitado da Fase 2)",
      run: async () => {
        const login = await api("POST", "/auth/login", { body: { login: ADMIN_LOGIN, senha: ADMIN_SENHA } });
        assert(login.status === 200, `login: esperado 200, veio ${login.status}: ${JSON.stringify(login.json)}`);
        adminToken = login.json.accessToken;
        organizacaoId = login.json.usuario.organizacaoId;

        const refs = await criarReferencias(api, adminToken, runId);
        especieId = refs.especieId;
        produtoId = refs.produtoId;
        importadorId = refs.importadorId;
        representanteId = refs.representanteId;
        statusId = refs.statusId;

        // Segundo status, só pra ter pra onde mudar no passo 2.
        const s2 = await api("POST", "/status-contrato", {
          token: adminToken,
          body: { nomeStatus: `Status Novo ${runId}`, setorResponsavel: "Comercial", ordem: 2 },
        });
        assert(s2.status === 201, `status novo: esperado 201, veio ${s2.status}: ${JSON.stringify(s2.json)}`);
        statusNovoId = s2.json.id;

        contratoId = await criarContrato(api, adminToken, numeroContrato, refs);
      },
    },
    {
      name: "2) PATCH mudando statusId -> linha criada em historico_status_contrato com ids corretos",
      run: async () => {
        const { status, json } = await api("PATCH", `/contratos/${contratoId}`, {
          token: adminToken,
          body: { statusId: statusNovoId, observacao: `Mudança de teste ${runId}` },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.statusId === statusNovoId, `statusId do contrato não atualizou (veio "${json.statusId}")`);

        const historico = await prisma.historicoStatusContrato.findFirst({
          where: { contratoId },
          orderBy: { dataAlteracao: "desc" },
        });
        assert(historico, "nenhuma linha criada em historico_status_contrato");
        assert(
          historico!.statusAnteriorId === statusId,
          `statusAnteriorId esperado "${statusId}", veio "${historico!.statusAnteriorId}"`,
        );
        assert(
          historico!.statusNovoId === statusNovoId,
          `statusNovoId esperado "${statusNovoId}", veio "${historico!.statusNovoId}"`,
        );
        assert(
          historico!.observacao === `Mudança de teste ${runId}`,
          `observacao não bateu (veio "${historico!.observacao}")`,
        );
      },
    },
    {
      name: "3) GET historico-status -> aparece a mudança",
      run: async () => {
        const { status, json } = await api("GET", `/contratos/${contratoId}/historico-status`, {
          token: adminToken,
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        const found = (json.data as Array<{ statusNovoId: string }>).some((h) => h.statusNovoId === statusNovoId);
        assert(found, "a mudança de status não apareceu em GET historico-status");
      },
    },
    {
      name: "4) PATCH editando local + tipoFrete -> 2 linhas novas em auditoria_contratos",
      run: async () => {
        const { status, json } = await api("PATCH", `/contratos/${contratoId}`, {
          token: adminToken,
          body: { local: "Santarém", tipoFrete: "CIF" },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);

        const localRow = await prisma.auditoriaContrato.findFirst({
          where: { contratoId, campoAlterado: "local" },
          orderBy: { dataHora: "desc" },
        });
        assert(localRow, "nenhuma linha de auditoria pra campoAlterado=local");
        assert(localRow!.valorNovo === "Santarém", `valorNovo de local esperado "Santarém", veio "${localRow!.valorNovo}"`);

        const freteRow = await prisma.auditoriaContrato.findFirst({
          where: { contratoId, campoAlterado: "tipoFrete" },
          orderBy: { dataHora: "desc" },
        });
        assert(freteRow, "nenhuma linha de auditoria pra campoAlterado=tipoFrete");
        assert(freteRow!.valorNovo === "CIF", `valorNovo de tipoFrete esperado "CIF", veio "${freteRow!.valorNovo}"`);
      },
    },
    {
      name: "5) PUT detalhes-producao (criar) -> 1 linha de auditoria com acao=Criacao",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/producao`, {
          token: adminToken,
          body: { numeroRomaneio: `ROM-${runId}` },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);

        const criacaoRows = await prisma.auditoriaContrato.findMany({
          where: { contratoId, acao: "Criacao" },
        });
        // 2 Criacao esperadas até aqui: o contrato (passo 1) + detalhes_producao (este passo).
        assert(
          criacaoRows.length === 2,
          `esperava 2 linhas acao=Criacao (contrato + detalhes_producao), veio ${criacaoRows.length}`,
        );
      },
    },
    {
      name: "6) GET auditoria -> aparecem as linhas",
      run: async () => {
        const { status, json } = await api("GET", `/contratos/${contratoId}/auditoria?pageSize=100`, {
          token: adminToken,
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.data.length >= 5, `esperava pelo menos 5 linhas de auditoria, veio ${json.data.length}`);
        algumaAuditoriaId = json.data[0].id;
      },
    },
    {
      name: "7) Usuário Comercial (não-Administrador) tentando GET auditoria -> 403",
      run: async () => {
        const senha = "senha-smoke-teste-123";
        const senhaHash = await bcrypt.hash(senha, 10);
        const login = `smoke-comercial-fase4-${runId}`;
        const usuario = await prisma.usuario.create({
          data: {
            organizacaoId,
            login,
            email: `${login}@example.com`,
            senhaHash,
            nomeCompleto: "Smoke Comercial (Fase 4)",
            perfilAcesso: "Comercial",
          },
        });
        comercialUserId = usuario.id;

        const loginRes = await api("POST", "/auth/login", { body: { login, senha } });
        assert(loginRes.status === 200, `login comercial: esperado 200, veio ${loginRes.status}`);

        const { status, json } = await api("GET", `/contratos/${contratoId}/auditoria`, {
          token: loginRes.json.accessToken,
        });
        assert(status === 403, `esperado 403, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "8) PROVA CRÍTICA: UPDATE/DELETE em auditoria_contratos via app_runtime -> permission denied",
      run: async () => {
        assert(algumaAuditoriaId, "precisa de uma linha de auditoria existente pra tentar alterar/apagar");

        // `runtimePrisma` é um client novo, fora de qualquer transação —
        // ao contrário de `request.db` (tenant-scoping.ts), a conexão dele
        // NUNCA teve `app.current_organizacao_id` definido. A policy de RLS
        // usa `current_setting('app.current_organizacao_id')` (sem
        // missing_ok), e o Postgres avalia essa chamada já no planejamento
        // da query — ANTES até de checar privilégio de UPDATE/DELETE. Sem
        // o set_config antes, o erro que volta é sempre "unrecognized
        // configuration parameter", mascarando se o REVOKE (migration
        // auditoria_append_only) está funcionando ou não (achado real: dá
        // pra reproduzir o mesmo erro genérico tentando um SELECT comum,
        // que app_runtime TEM permissão de fazer). Por isso, faz o
        // set_config na MESMA transação, igual attachTenantScope faz de
        // verdade — só assim o erro que sobra é o que a prova quer provar.
        async function forbiddenWrite(exec: (tx: typeof runtimePrisma) => Promise<unknown>): Promise<boolean> {
          try {
            await runtimePrisma.$transaction(async (tx) => {
              await tx.$executeRaw`SELECT set_config('app.current_organizacao_id', ${organizacaoId}, true)`;
              await exec(tx as unknown as typeof runtimePrisma);
            });
            return false;
          } catch (err) {
            if (/permission denied/i.test(String(err))) return true;
            throw err;
          }
        }

        const updateBlocked = await forbiddenWrite(
          (tx) => tx.$executeRaw`UPDATE auditoria_contratos SET campo_alterado = 'hackeado' WHERE id = ${algumaAuditoriaId}`,
        );
        assert(updateBlocked, "UPDATE em auditoria_contratos deveria ter sido negado pelo Postgres (permission denied)");

        const deleteBlocked = await forbiddenWrite(
          (tx) => tx.$executeRaw`DELETE FROM auditoria_contratos WHERE id = ${algumaAuditoriaId}`,
        );
        assert(deleteBlocked, "DELETE em auditoria_contratos deveria ter sido negado pelo Postgres (permission denied)");

        // Confere que a linha continua exatamente como estava.
        const stillThere = await prisma.auditoriaContrato.findUnique({ where: { id: algumaAuditoriaId } });
        assert(stillThere, "a linha de auditoria sumiu — o DELETE não deveria ter passado");
        assert(stillThere!.campoAlterado !== "hackeado", "o UPDATE não deveria ter passado, mas o valor mudou");
      },
    },
  ];

  const result = await runSmokeSteps(steps, async () => {
    // historico_status_contrato e auditoria_contratos têm onDelete: Cascade
    // a partir de contratos — não precisam de delete próprio.
    await limparFixture(prisma, numeroContrato, { produtoId, especieId, importadorId, representanteId, statusId });
    if (statusNovoId) await prisma.statusContrato.deleteMany({ where: { id: statusNovoId } });
    if (comercialUserId) await prisma.usuario.deleteMany({ where: { id: comercialUserId } });
  });

  await runtimePrisma.$disconnect();
  await prisma.$disconnect();
  process.exitCode = result.failed ? 1 : 0;
}

main().catch((err) => {
  console.error("Erro inesperado no runner do smoke test:", err);
  process.exitCode = 1;
});
