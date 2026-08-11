/**
 * Smoke test da Fase 3 — módulo setorial de Produção (detalhes_producao).
 * Só esse setor nesta rodada (Ambiental/Logística/Financeiro ficam pra
 * próximas rodadas, cada um com seu próprio smoke test antes de avançar).
 *
 * Reaproveita o setup de referências+contrato e o cliente HTTP da Fase 2
 * (scripts/smoke-test-fixtures.ts, scripts/smoke-test-helpers.ts) — não
 * duplica essa lógica aqui.
 *
 * Uso (de dentro do container da API, com a API já rodando):
 *   docker compose exec api npm run smoke:fase3-producao
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
  let comercialUserId = "";

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
      name: "2) GET producao antes de existir -> 404",
      run: async () => {
        const { status, json } = await api("GET", `/contratos/${contratoId}/producao`, { token: adminToken });
        assert(status === 404, `esperado 404, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "3) PUT producao (criar) com dados válidos -> sucesso, campos salvos",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/producao`, {
          token: adminToken,
          body: {
            numeroRomaneio: `ROM-${runId}`,
            volumeRomaneioM3: 100,
            qtdContainersConfirmada: 4,
            observacoesProducao: "Primeira carga separada.",
          },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.contratoId === contratoId, `contratoId esperado "${contratoId}", veio "${json.contratoId}"`);
        assert(json.numeroRomaneio === `ROM-${runId}`, `numeroRomaneio não foi salvo (veio "${json.numeroRomaneio}")`);
        assert(json.volumeRomaneioM3 === 100, `volumeRomaneioM3 esperado 100, veio ${json.volumeRomaneioM3}`);
        assert(
          json.qtdContainersConfirmada === 4,
          `qtdContainersConfirmada esperado 4, veio ${json.qtdContainersConfirmada}`,
        );
        primeiroDetalhesId = json.id;
      },
    },
    {
      name: "4) GET producao -> agora retorna os dados",
      run: async () => {
        const { status, json } = await api("GET", `/contratos/${contratoId}/producao`, { token: adminToken });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.id === primeiroDetalhesId, `id esperado "${primeiroDetalhesId}", veio "${json.id}"`);
        assert(json.numeroRomaneio === `ROM-${runId}`, `numeroRomaneio não bateu no GET (veio "${json.numeroRomaneio}")`);
      },
    },
    {
      name: "5) PUT producao de novo (atualizar) -> atualiza, não duplica",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/producao`, {
          token: adminToken,
          body: { volumeRomaneioM3: 250 },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.id === primeiroDetalhesId, `esperava mesmo id (atualização), veio id diferente: "${json.id}"`);
        assert(json.volumeRomaneioM3 === 250, `volumeRomaneioM3 esperado 250 após update, veio ${json.volumeRomaneioM3}`);
        // numeroRomaneio do passo 3 precisa continuar lá — update parcial não apaga o resto.
        assert(
          json.numeroRomaneio === `ROM-${runId}`,
          `numeroRomaneio deveria continuar "ROM-${runId}", veio "${json.numeroRomaneio}"`,
        );
      },
    },
    {
      name: "6) PUT com volumeRomaneioM3 negativo -> 400",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/producao`, {
          token: adminToken,
          body: { volumeRomaneioM3: -5 },
        });
        assert(status === 400, `esperado 400, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "7) Usuário Comercial (sem permissão em Produção): GET -> 200, PUT -> 403",
      run: async () => {
        const senha = "senha-smoke-teste-123";
        const senhaHash = await bcrypt.hash(senha, 10);
        const login = `smoke-comercial-${runId}`;
        const usuario = await prisma.usuario.create({
          data: {
            organizacaoId,
            login,
            email: `${login}@example.com`,
            senhaHash,
            nomeCompleto: "Smoke Comercial",
            perfilAcesso: "Comercial",
          },
        });
        comercialUserId = usuario.id;

        const loginRes = await api("POST", "/auth/login", { body: { login, senha } });
        assert(loginRes.status === 200, `login comercial: esperado 200, veio ${loginRes.status}`);
        const comercialToken = loginRes.json.accessToken;

        const get = await api("GET", `/contratos/${contratoId}/producao`, { token: comercialToken });
        assert(get.status === 200, `GET: esperado 200, veio ${get.status}: ${JSON.stringify(get.json)}`);

        const put = await api("PUT", `/contratos/${contratoId}/producao`, {
          token: comercialToken,
          body: { volumeRomaneioM3: 999 },
        });
        assert(put.status === 403, `PUT: esperado 403, veio ${put.status}: ${JSON.stringify(put.json)}`);
      },
    },
    {
      name: "8) PUT producao com contratoId inexistente -> 404",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${randomUUID()}/producao`, {
          token: adminToken,
          body: { volumeRomaneioM3: 10 },
        });
        assert(status === 404, `esperado 404, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
  ];

  const result = await runSmokeSteps(steps, async () => {
    // detalhes_producao tem onDelete: Cascade a partir de contratos — não
    // precisa de delete próprio, cai junto com limparFixture abaixo.
    await limparFixture(prisma, numeroContrato, { produtoId, especieId, importadorId, representanteId, statusId });
    if (comercialUserId) await prisma.usuario.deleteMany({ where: { id: comercialUserId } });
  });

  await prisma.$disconnect();
  process.exitCode = result.failed ? 1 : 0;
}

main().catch((err) => {
  console.error("Erro inesperado no runner do smoke test:", err);
  process.exitCode = 1;
});
