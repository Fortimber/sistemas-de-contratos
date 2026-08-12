/**
 * Smoke test da tabela de referência "eventos de pagamento"
 * (`eventos_pagamento`) — usada pelo prazo de pagamento do setor Financeiro
 * (pedido da área Financeiro/Carolina, ver `DetalhesFinanceiro.
 * prazoPagamentoEventoId` no schema.prisma).
 *
 * Primeiro smoke test DEDICADO a uma tabela de referência individual — as
 * outras 5 (especies, produtos, importadores, representantes,
 * status-contrato) só são exercitadas indiretamente via `criarReferencias()`
 * dentro de smoke-test-fase2.ts, nunca com um CRUD completo próprio. Este
 * script também confere a integração com o setor Financeiro: vincular o
 * evento a um contrato via `PUT /contratos/:id/financeiro` e confirmar que
 * `GET` devolve a relação `prazoPagamentoEvento` já populada (não só o id),
 * e que excluir um evento em uso responde `409`, não `500`.
 *
 * Reaproveita o setup de referências+contrato e o cliente HTTP já extraídos
 * em scripts/smoke-test-fixtures.ts e scripts/smoke-test-helpers.ts.
 *
 * Uso (de dentro do container da API, com a API já rodando):
 *   docker compose exec api npm run smoke:eventos-pagamento
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
  const nomeEventoBase = `Chegada do navio ${runId}`;
  const nomeEventoEditado = `${nomeEventoBase} (editado)`;

  let adminToken = "";
  let organizacaoId = "";

  let especieId = "";
  let produtoId = "";
  let importadorId = "";
  let representanteId = "";
  let statusId = "";
  let contratoId = "";

  let eventoId = "";
  let eventoVinculadoId = "";
  let eventoFinanceiroUserId = "";
  let comercialUserId = "";
  let financeiroUserId = "";

  const steps: SmokeStep[] = [
    {
      name: "1) Login admin + criar evento de pagamento de teste",
      run: async () => {
        const login = await api("POST", "/auth/login", { body: { login: ADMIN_LOGIN, senha: ADMIN_SENHA } });
        assert(login.status === 200, `login: esperado 200, veio ${login.status}: ${JSON.stringify(login.json)}`);
        adminToken = login.json.accessToken;
        organizacaoId = login.json.usuario.organizacaoId;

        const { status, json } = await api("POST", "/eventos-pagamento", {
          token: adminToken,
          body: { nomeEvento: nomeEventoBase },
        });
        assert(status === 201, `esperado 201, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.nomeEvento === nomeEventoBase, `nomeEvento esperado "${nomeEventoBase}", veio "${json.nomeEvento}"`);
        eventoId = json.id;
      },
    },
    {
      name: "2) GET /eventos-pagamento/:id -> retorna o evento criado",
      run: async () => {
        const { status, json } = await api("GET", `/eventos-pagamento/${eventoId}`, { token: adminToken });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.id === eventoId, `id esperado "${eventoId}", veio "${json.id}"`);
        assert(json.nomeEvento === nomeEventoBase, `nomeEvento não bateu (veio "${json.nomeEvento}")`);
      },
    },
    {
      name: "3) GET /eventos-pagamento (lista) -> inclui o evento criado",
      run: async () => {
        const { status, json } = await api("GET", "/eventos-pagamento?pageSize=100", { token: adminToken });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        const encontrado = (json.data as Array<{ id: string }>).some((e) => e.id === eventoId);
        assert(encontrado, `evento ${eventoId} não apareceu na listagem`);
      },
    },
    {
      name: "4) PATCH /eventos-pagamento/:id -> edita o nome",
      run: async () => {
        const { status, json } = await api("PATCH", `/eventos-pagamento/${eventoId}`, {
          token: adminToken,
          body: { nomeEvento: nomeEventoEditado },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.nomeEvento === nomeEventoEditado, `nomeEvento esperado "${nomeEventoEditado}", veio "${json.nomeEvento}"`);
      },
    },
    {
      name: "5) POST com nome já usado na organização -> 409",
      run: async () => {
        const { status, json } = await api("POST", "/eventos-pagamento", {
          token: adminToken,
          body: { nomeEvento: nomeEventoEditado },
        });
        assert(status === 409, `esperado 409, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "6) Usuário Comercial (sem permissão): GET -> 200, POST -> 403",
      run: async () => {
        const senha = "senha-smoke-teste-123";
        const senhaHash = await bcrypt.hash(senha, 10);
        const login = `smoke-comercial-evpg-${runId}`;
        const usuario = await prisma.usuario.create({
          data: {
            organizacaoId,
            login,
            email: `${login}@example.com`,
            senhaHash,
            nomeCompleto: "Smoke Comercial (Eventos Pagamento)",
            perfilAcesso: "Comercial",
          },
        });
        comercialUserId = usuario.id;

        const loginRes = await api("POST", "/auth/login", { body: { login, senha } });
        assert(loginRes.status === 200, `login comercial: esperado 200, veio ${loginRes.status}`);
        const comercialToken = loginRes.json.accessToken;

        const get = await api("GET", "/eventos-pagamento", { token: comercialToken });
        assert(get.status === 200, `GET: esperado 200, veio ${get.status}: ${JSON.stringify(get.json)}`);

        const post = await api("POST", "/eventos-pagamento", {
          token: comercialToken,
          body: { nomeEvento: `Não deveria criar ${runId}` },
        });
        assert(post.status === 403, `POST: esperado 403, veio ${post.status}: ${JSON.stringify(post.json)}`);
      },
    },
    {
      name: "7) Usuário Financeiro (com permissão): POST -> 201",
      run: async () => {
        const senha = "senha-smoke-teste-123";
        const senhaHash = await bcrypt.hash(senha, 10);
        const login = `smoke-financeiro-evpg-${runId}`;
        const usuario = await prisma.usuario.create({
          data: {
            organizacaoId,
            login,
            email: `${login}@example.com`,
            senhaHash,
            nomeCompleto: "Smoke Financeiro (Eventos Pagamento)",
            perfilAcesso: "Financeiro",
          },
        });
        financeiroUserId = usuario.id;

        const loginRes = await api("POST", "/auth/login", { body: { login, senha } });
        assert(loginRes.status === 200, `login financeiro: esperado 200, veio ${loginRes.status}`);
        const financeiroToken = loginRes.json.accessToken;

        const { status, json } = await api("POST", "/eventos-pagamento", {
          token: financeiroToken,
          body: { nomeEvento: `Envio da documentação ${runId}` },
        });
        assert(status === 201, `esperado 201, veio ${status}: ${JSON.stringify(json)}`);
        eventoFinanceiroUserId = json.id;
      },
    },
    {
      name: "8) Vincular evento a um contrato (PUT financeiro) -> GET devolve evento populado",
      run: async () => {
        const refs = await criarReferencias(api, adminToken, runId);
        especieId = refs.especieId;
        produtoId = refs.produtoId;
        importadorId = refs.importadorId;
        representanteId = refs.representanteId;
        statusId = refs.statusId;

        contratoId = await criarContrato(api, adminToken, numeroContrato, refs);
        eventoVinculadoId = eventoId;

        const put = await api("PUT", `/contratos/${contratoId}/financeiro`, {
          token: adminToken,
          body: { prazoPagamentoDias: 10, prazoPagamentoDirecao: "Antes", prazoPagamentoEventoId: eventoVinculadoId },
        });
        assert(put.status === 200, `PUT: esperado 200, veio ${put.status}: ${JSON.stringify(put.json)}`);
        assert(put.json.prazoPagamentoDias === 10, `prazoPagamentoDias esperado 10, veio ${put.json.prazoPagamentoDias}`);
        assert(
          put.json.prazoPagamentoDirecao === "Antes",
          `prazoPagamentoDirecao esperado "Antes", veio "${put.json.prazoPagamentoDirecao}"`,
        );
        assert(
          put.json.prazoPagamentoEvento?.id === eventoVinculadoId,
          `prazoPagamentoEvento.id esperado "${eventoVinculadoId}", veio ${JSON.stringify(put.json.prazoPagamentoEvento)}`,
        );
        assert(
          put.json.prazoPagamentoEvento?.nomeEvento === nomeEventoEditado,
          `prazoPagamentoEvento.nomeEvento esperado "${nomeEventoEditado}", veio "${put.json.prazoPagamentoEvento?.nomeEvento}"`,
        );

        const get = await api("GET", `/contratos/${contratoId}/financeiro`, { token: adminToken });
        assert(get.status === 200, `GET: esperado 200, veio ${get.status}: ${JSON.stringify(get.json)}`);
        assert(
          get.json.prazoPagamentoEvento?.nomeEvento === nomeEventoEditado,
          `GET prazoPagamentoEvento.nomeEvento esperado "${nomeEventoEditado}", veio "${get.json.prazoPagamentoEvento?.nomeEvento}"`,
        );
      },
    },
    {
      name: "9) PUT financeiro com prazoPagamentoEventoId inexistente -> 400",
      run: async () => {
        const { status, json } = await api("PUT", `/contratos/${contratoId}/financeiro`, {
          token: adminToken,
          body: { prazoPagamentoEventoId: randomUUID() },
        });
        assert(status === 400, `esperado 400, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "10) DELETE evento em uso (vinculado ao contrato) -> 409",
      run: async () => {
        const { status, json } = await api("DELETE", `/eventos-pagamento/${eventoVinculadoId}`, { token: adminToken });
        assert(status === 409, `esperado 409, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "11) Removido o contrato que usava o evento, DELETE evento -> 204",
      run: async () => {
        // Cascade de contratos -> detalhes_financeiro (onDelete: Cascade)
        // libera a FK prazo_pagamento_evento_id antes desta chamada.
        await prisma.contrato.deleteMany({ where: { id: contratoId } });
        contratoId = "";

        const del = await api("DELETE", `/eventos-pagamento/${eventoVinculadoId}`, { token: adminToken });
        assert(del.status === 204, `esperado 204, veio ${del.status}: ${JSON.stringify(del.json)}`);
        eventoId = "";
        eventoVinculadoId = "";
      },
    },
    {
      name: "12) GET/PATCH/DELETE em evento inexistente -> 404",
      run: async () => {
        const fakeId = randomUUID();
        const get = await api("GET", `/eventos-pagamento/${fakeId}`, { token: adminToken });
        assert(get.status === 404, `GET: esperado 404, veio ${get.status}: ${JSON.stringify(get.json)}`);

        const patch = await api("PATCH", `/eventos-pagamento/${fakeId}`, {
          token: adminToken,
          body: { nomeEvento: "Não existe" },
        });
        assert(patch.status === 404, `PATCH: esperado 404, veio ${patch.status}: ${JSON.stringify(patch.json)}`);

        const del = await api("DELETE", `/eventos-pagamento/${fakeId}`, { token: adminToken });
        assert(del.status === 404, `DELETE: esperado 404, veio ${del.status}: ${JSON.stringify(del.json)}`);
      },
    },
  ];

  const result = await runSmokeSteps(steps, async () => {
    if (contratoId) await prisma.contrato.deleteMany({ where: { id: contratoId } });
    await limparFixture(prisma, numeroContrato, { produtoId, especieId, importadorId, representanteId, statusId });
    if (eventoId) await prisma.eventoPagamento.deleteMany({ where: { id: eventoId } });
    if (eventoFinanceiroUserId) await prisma.eventoPagamento.deleteMany({ where: { id: eventoFinanceiroUserId } });
    if (comercialUserId) await prisma.usuario.deleteMany({ where: { id: comercialUserId } });
    if (financeiroUserId) await prisma.usuario.deleteMany({ where: { id: financeiroUserId } });
  });

  await prisma.$disconnect();
  process.exitCode = result.failed ? 1 : 0;
}

main().catch((err) => {
  console.error("Erro inesperado no runner do smoke test:", err);
  process.exitCode = 1;
});
