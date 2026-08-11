/**
 * Smoke test da Fase 3 — módulo setorial Financeiro (detalhes_financeiro).
 * Quarto e último dos setores (Produção, Ambiental e Logística já
 * validados) — fecha a Fase 3 do roadmap.
 *
 * Além do CRUD do setor, este script confirma o efeito colateral da
 * migração de Float -> Decimal nos campos monetários (ver schema.prisma e
 * o comentário no topo de detalhes-financeiro.routes.ts): os valores
 * chegam na resposta da API como STRING (ex.: "1500.50"), não number —
 * comparamos via Number() pra checar o valor exato, e também confirmamos
 * o `typeof` explicitamente, documentando a decisão em vez de assumir.
 *
 * Reaproveita o setup de referências+contrato e o cliente HTTP já extraídos
 * na rodada de Produção (scripts/smoke-test-fixtures.ts,
 * scripts/smoke-test-helpers.ts) — não duplica essa lógica aqui.
 *
 * Uso (de dentro do container da API, com a API já rodando):
 *   docker compose exec api npm run smoke:fase3-financeiro
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
      name: "2) GET financeiro antes de existir -> 404",
      run: async () => {
        const { status, json } = await api("GET", `/contratos/${contratoId}/financeiro`, { token: adminToken });
        assert(status === 404, `esperado 404, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "3) PUT financeiro (criar) com campos monetários + taxaCambial -> valores batem exatamente",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/financeiro`, {
          token: adminToken,
          body: {
            invoiceNumero: `INV-${runId}`,
            invoiceValor: 45000.5,
            freteReais: 1500.5,
            taxaCambial: 5.4321,
            valorRecebidoReais: 240000,
          },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.contratoId === contratoId, `contratoId esperado "${contratoId}", veio "${json.contratoId}"`);

        // Decimal chega como string na resposta (decisão documentada em
        // detalhes-financeiro.routes.ts) — confirma o tipo E o valor exato.
        assert(typeof json.invoiceValor === "string", `invoiceValor deveria ser string, veio ${typeof json.invoiceValor}`);
        assert(Number(json.invoiceValor) === 45000.5, `invoiceValor esperado 45000.5, veio ${json.invoiceValor}`);
        assert(Number(json.freteReais) === 1500.5, `freteReais esperado 1500.5, veio ${json.freteReais}`);
        assert(Number(json.taxaCambial) === 5.4321, `taxaCambial esperado 5.4321, veio ${json.taxaCambial}`);
        assert(
          Number(json.valorRecebidoReais) === 240000,
          `valorRecebidoReais esperado 240000, veio ${json.valorRecebidoReais}`,
        );

        primeiroDetalhesId = json.id;
      },
    },
    {
      name: "4) GET financeiro -> retorna os dados",
      run: async () => {
        const { status, json } = await api("GET", `/contratos/${contratoId}/financeiro`, { token: adminToken });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.id === primeiroDetalhesId, `id esperado "${primeiroDetalhesId}", veio "${json.id}"`);
        assert(json.invoiceNumero === `INV-${runId}`, `invoiceNumero não bateu no GET (veio "${json.invoiceNumero}")`);
        assert(Number(json.freteReais) === 1500.5, `freteReais não bateu no GET (veio ${json.freteReais})`);
      },
    },
    {
      name: "5) PUT financeiro de novo (atualizar) -> atualiza, não duplica",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/financeiro`, {
          token: adminToken,
          body: { freteReais: 2000.75 },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.id === primeiroDetalhesId, `esperava mesmo id (atualização), veio id diferente: "${json.id}"`);
        assert(Number(json.freteReais) === 2000.75, `freteReais esperado 2000.75 após update, veio ${json.freteReais}`);
        // invoiceValor do passo 3 precisa continuar lá — update parcial não apaga o resto.
        assert(
          Number(json.invoiceValor) === 45000.5,
          `invoiceValor deveria continuar 45000.5, veio ${json.invoiceValor}`,
        );
      },
    },
    {
      name: "6) PUT com campo monetário negativo (freteReais: -100) -> 400",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/financeiro`, {
          token: adminToken,
          body: { freteReais: -100 },
        });
        assert(status === 400, `esperado 400, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "7) PUT com taxaCambial = 0 -> 400",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/financeiro`, {
          token: adminToken,
          body: { taxaCambial: 0 },
        });
        assert(status === 400, `esperado 400, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "8) Usuário Comercial (sem permissão em Financeiro): GET -> 200, PUT -> 403",
      run: async () => {
        const senha = "senha-smoke-teste-123";
        const senhaHash = await bcrypt.hash(senha, 10);
        const login = `smoke-comercial-fin-${runId}`;
        const usuario = await prisma.usuario.create({
          data: {
            organizacaoId,
            login,
            email: `${login}@example.com`,
            senhaHash,
            nomeCompleto: "Smoke Comercial (Financeiro)",
            perfilAcesso: "Comercial",
          },
        });
        comercialUserId = usuario.id;

        const loginRes = await api("POST", "/auth/login", { body: { login, senha } });
        assert(loginRes.status === 200, `login comercial: esperado 200, veio ${loginRes.status}`);
        const comercialToken = loginRes.json.accessToken;

        const get = await api("GET", `/contratos/${contratoId}/financeiro`, { token: comercialToken });
        assert(get.status === 200, `GET: esperado 200, veio ${get.status}: ${JSON.stringify(get.json)}`);

        const put = await api("PUT", `/contratos/${contratoId}/financeiro`, {
          token: comercialToken,
          body: { freteReais: 999 },
        });
        assert(put.status === 403, `PUT: esperado 403, veio ${put.status}: ${JSON.stringify(put.json)}`);
      },
    },
    {
      name: "9) PUT financeiro com contratoId inexistente -> 404",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${randomUUID()}/financeiro`, {
          token: adminToken,
          body: { freteReais: 10 },
        });
        assert(status === 404, `esperado 404, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
  ];

  const result = await runSmokeSteps(steps, async () => {
    // detalhes_financeiro tem onDelete: Cascade a partir de contratos — não
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
