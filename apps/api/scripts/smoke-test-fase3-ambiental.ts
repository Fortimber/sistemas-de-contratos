/**
 * Smoke test da Fase 3 — módulo setorial Ambiental (detalhes_ambiental).
 * Segundo dos quatro setores (Produção já validado; Logística/Financeiro
 * ficam pra próximas rodadas, cada um com seu próprio smoke test).
 *
 * Reaproveita o setup de referências+contrato e o cliente HTTP já extraídos
 * na rodada de Produção (scripts/smoke-test-fixtures.ts,
 * scripts/smoke-test-helpers.ts) — não duplica essa lógica aqui.
 *
 * Uso (de dentro do container da API, com a API já rodando):
 *   docker compose exec api npm run smoke:fase3-ambiental
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
      name: "2) GET ambiental antes de existir -> 404",
      run: async () => {
        const { status, json } = await api("GET", `/contratos/${contratoId}/ambiental`, { token: adminToken });
        assert(status === 404, `esperado 404, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "3) PUT ambiental (criar) com dados válidos, incluindo os 3 status -> sucesso",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/ambiental`, {
          token: adminToken,
          body: {
            autef: `AUTEF-${runId}`,
            lpcoNumero: `LPCO-${runId}`,
            lpcoStatus: "Protocolada",
            lpcoDataProtocolo: "2026-01-10",
            lpcoDataValidade: "2026-06-10",
            citesStatus: "Não se aplica",
            statusAprovacaoCocCliente: "Pendente",
          },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.contratoId === contratoId, `contratoId esperado "${contratoId}", veio "${json.contratoId}"`);
        assert(json.lpcoStatus === "Protocolada", `lpcoStatus esperado "Protocolada", veio "${json.lpcoStatus}"`);
        assert(json.citesStatus === "Não se aplica", `citesStatus esperado "Não se aplica", veio "${json.citesStatus}"`);
        assert(
          json.statusAprovacaoCocCliente === "Pendente",
          `statusAprovacaoCocCliente esperado "Pendente", veio "${json.statusAprovacaoCocCliente}"`,
        );
        primeiroDetalhesId = json.id;
      },
    },
    {
      name: "4) GET ambiental -> retorna os dados",
      run: async () => {
        const { status, json } = await api("GET", `/contratos/${contratoId}/ambiental`, { token: adminToken });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.id === primeiroDetalhesId, `id esperado "${primeiroDetalhesId}", veio "${json.id}"`);
        assert(json.autef === `AUTEF-${runId}`, `autef não bateu no GET (veio "${json.autef}")`);
      },
    },
    {
      name: "5) PUT ambiental de novo (atualizar) -> atualiza, não duplica",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/ambiental`, {
          token: adminToken,
          body: { lpcoStatus: "Deferida" },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.id === primeiroDetalhesId, `esperava mesmo id (atualização), veio id diferente: "${json.id}"`);
        assert(json.lpcoStatus === "Deferida", `lpcoStatus esperado "Deferida" após update, veio "${json.lpcoStatus}"`);
        // autef do passo 3 precisa continuar lá — update parcial não apaga o resto.
        assert(json.autef === `AUTEF-${runId}`, `autef deveria continuar "AUTEF-${runId}", veio "${json.autef}"`);
      },
    },
    {
      name: '6) PUT com lpcoStatus fora da lista permitida ("Aprovado") -> 400',
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/ambiental`, {
          token: adminToken,
          body: { lpcoStatus: "Aprovado" },
        });
        assert(status === 400, `esperado 400, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "7) PUT com citesDataValidade anterior a citesDataEntrada -> 400",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/ambiental`, {
          token: adminToken,
          body: { citesDataEntrada: "2026-03-01", citesDataValidade: "2026-01-01" },
        });
        assert(status === 400, `esperado 400, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "8) Usuário Financeiro (sem permissão em Ambiental): GET -> 200, PUT -> 403",
      run: async () => {
        const senha = "senha-smoke-teste-123";
        const senhaHash = await bcrypt.hash(senha, 10);
        const login = `smoke-financeiro-${runId}`;
        const usuario = await prisma.usuario.create({
          data: {
            organizacaoId,
            login,
            email: `${login}@example.com`,
            senhaHash,
            nomeCompleto: "Smoke Financeiro",
            perfilAcesso: "Financeiro",
          },
        });
        financeiroUserId = usuario.id;

        const loginRes = await api("POST", "/auth/login", { body: { login, senha } });
        assert(loginRes.status === 200, `login financeiro: esperado 200, veio ${loginRes.status}`);
        const financeiroToken = loginRes.json.accessToken;

        const get = await api("GET", `/contratos/${contratoId}/ambiental`, { token: financeiroToken });
        assert(get.status === 200, `GET: esperado 200, veio ${get.status}: ${JSON.stringify(get.json)}`);

        const put = await api("PUT", `/contratos/${contratoId}/ambiental`, {
          token: financeiroToken,
          body: { autef: "tentativa-nao-autorizada" },
        });
        assert(put.status === 403, `PUT: esperado 403, veio ${put.status}: ${JSON.stringify(put.json)}`);
      },
    },
    {
      name: "9) PUT ambiental com contratoId inexistente -> 404",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${randomUUID()}/ambiental`, {
          token: adminToken,
          body: { autef: "qualquer" },
        });
        assert(status === 404, `esperado 404, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
  ];

  const result = await runSmokeSteps(steps, async () => {
    // detalhes_ambiental tem onDelete: Cascade a partir de contratos — não
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
