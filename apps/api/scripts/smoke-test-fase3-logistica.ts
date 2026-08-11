/**
 * Smoke test da Fase 3 — módulo setorial Logística (detalhes_logistica).
 * Terceiro dos quatro setores (Produção e Ambiental já validados;
 * Financeiro fica pra próxima rodada, com seu próprio smoke test).
 *
 * Reaproveita o setup de referências+contrato e o cliente HTTP já extraídos
 * na rodada de Produção (scripts/smoke-test-fixtures.ts,
 * scripts/smoke-test-helpers.ts) — não duplica essa lógica aqui.
 *
 * Uso (de dentro do container da API, com a API já rodando):
 *   docker compose exec api npm run smoke:fase3-logistica
 *
 * Reusável como teste de regressão: para no primeiro FAIL, mas a limpeza
 * roda sempre (sucesso ou falha) — nenhum estado de teste fica no banco.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "../src/lib/prisma.js";
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
  let contratoId = "";

  let primeiroDetalhesId = "";
  let financeiroUserId = "";

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

        contratoId = await criarContrato(api, adminToken, numeroContrato, refs);
      },
    },
    {
      name: "2) GET logistica antes de existir -> 404",
      run: async () => {
        const { status, json } = await api("GET", `/contratos/${contratoId}/logistica`, { token: adminToken });
        assert(status === 404, `esperado 404, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: '3) PUT logistica (criar) com dados válidos, incluindo pagamentoBl="Sim" -> sucesso',
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/logistica`, {
          token: adminToken,
          body: {
            ciaMaritima: `Cia ${runId}`,
            nomeNavio: `Navio ${runId}`,
            booking: `BK-${runId}`,
            containerNumero: `CONT-${runId}`,
            dataPrancha: "2026-01-20",
            blNumero: `BL-${runId}`,
            pagamentoBl: "Sim",
          },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.contratoId === contratoId, `contratoId esperado "${contratoId}", veio "${json.contratoId}"`);
        assert(json.nomeNavio === `Navio ${runId}`, `nomeNavio não foi salvo (veio "${json.nomeNavio}")`);
        assert(json.pagamentoBl === "Sim", `pagamentoBl esperado "Sim", veio "${json.pagamentoBl}"`);
        primeiroDetalhesId = json.id;
      },
    },
    {
      name: "4) GET logistica -> retorna os dados",
      run: async () => {
        const { status, json } = await api("GET", `/contratos/${contratoId}/logistica`, { token: adminToken });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.id === primeiroDetalhesId, `id esperado "${primeiroDetalhesId}", veio "${json.id}"`);
        assert(json.booking === `BK-${runId}`, `booking não bateu no GET (veio "${json.booking}")`);
      },
    },
    {
      name: "5) PUT logistica de novo (atualizar) -> atualiza, não duplica",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/logistica`, {
          token: adminToken,
          body: { nomeNavio: `Navio Atualizado ${runId}` },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.id === primeiroDetalhesId, `esperava mesmo id (atualização), veio id diferente: "${json.id}"`);
        assert(
          json.nomeNavio === `Navio Atualizado ${runId}`,
          `nomeNavio esperado "Navio Atualizado ${runId}" após update, veio "${json.nomeNavio}"`,
        );
        // booking do passo 3 precisa continuar lá — update parcial não apaga o resto.
        assert(json.booking === `BK-${runId}`, `booking deveria continuar "BK-${runId}", veio "${json.booking}"`);
      },
    },
    {
      name: '6) PUT com pagamentoBl fora de "Sim"/"Não" ("Talvez") -> 400',
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/logistica`, {
          token: adminToken,
          body: { pagamentoBl: "Talvez" },
        });
        assert(status === 400, `esperado 400, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "7) Usuário Financeiro (sem permissão em Logística): GET -> 200, PUT -> 403",
      run: async () => {
        const senha = "senha-smoke-teste-123";
        const senhaHash = await bcrypt.hash(senha, 10);
        const login = `smoke-financeiro-log-${runId}`;
        const usuario = await prisma.usuario.create({
          data: {
            organizacaoId,
            login,
            email: `${login}@example.com`,
            senhaHash,
            nomeCompleto: "Smoke Financeiro (Logística)",
            perfilAcesso: "Financeiro",
          },
        });
        financeiroUserId = usuario.id;

        const loginRes = await api("POST", "/auth/login", { body: { login, senha } });
        assert(loginRes.status === 200, `login financeiro: esperado 200, veio ${loginRes.status}`);
        const financeiroToken = loginRes.json.accessToken;

        const get = await api("GET", `/contratos/${contratoId}/logistica`, { token: financeiroToken });
        assert(get.status === 200, `GET: esperado 200, veio ${get.status}: ${JSON.stringify(get.json)}`);

        const put = await api("PUT", `/contratos/${contratoId}/logistica`, {
          token: financeiroToken,
          body: { nomeNavio: "tentativa-nao-autorizada" },
        });
        assert(put.status === 403, `PUT: esperado 403, veio ${put.status}: ${JSON.stringify(put.json)}`);
      },
    },
    {
      name: "8) PUT logistica com contratoId inexistente -> 404",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${randomUUID()}/logistica`, {
          token: adminToken,
          body: { nomeNavio: "qualquer" },
        });
        assert(status === 404, `esperado 404, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
  ];

  const result = await runSmokeSteps(steps, async () => {
    // detalhes_logistica tem onDelete: Cascade a partir de contratos — não
    // precisa de delete próprio, cai junto com limparFixture abaixo.
    await limparFixture(prisma, numeroContrato, { produtoId, especieId, importadorId, representanteId, statusId });
    if (financeiroUserId) await prisma.usuario.deleteMany({ where: { id: financeiroUserId } });
  });

  await prisma.$disconnect();
  process.exitCode = result.failed ? 1 : 0;
}

main().catch((err) => {
  console.error("Erro inesperado no runner do smoke test:", err);
  process.exitCode = 1;
});
