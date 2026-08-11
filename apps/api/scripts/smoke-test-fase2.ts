/**
 * Smoke test da Fase 2 (CRUD de referências + contratos) — roda contra a
 * API já no ar, via HTTP real (fetch), como um cliente de verdade faria.
 *
 * Setup/limpeza que ainda não tem endpoint próprio (criar usuário de teste,
 * criar uma segunda organização pro cenário de isolamento cruzado) usa o
 * client Prisma administrativo (`lib/prisma.ts`) direto — o mesmo client que
 * `auth.service.ts` usa pra resolver login antes de existir contexto de
 * tenant. Ele ignora RLS de propósito: é o role que roda migrations, não o
 * de runtime (`app_runtime`) — aqui isso é necessário pra poder ver/limpar
 * dado das DUAS organizações do teste.
 *
 * Uso (de dentro do container da API, com a API já rodando):
 *   docker compose exec api npm run smoke:fase2
 *
 * Reusável como teste de regressão: para no primeiro FAIL, mas a limpeza
 * roda sempre (sucesso ou falha) — nenhum estado de teste fica no banco.
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../src/lib/prisma.js";
import { makeApiClient, assert, runSmokeSteps, type SmokeStep } from "./smoke-test-helpers.js";
import { contratoBase, criarReferencias, criarContrato, limparFixture, novoRunId } from "./smoke-test-fixtures.js";

const API_URL = process.env.SMOKE_API_URL ?? "http://localhost:3000";
const ADMIN_LOGIN = process.env.SEED_ADMIN_LOGIN ?? "admin";
const ADMIN_SENHA = process.env.SEED_ADMIN_SENHA ?? "troque-esta-senha";

const api = makeApiClient(API_URL);

async function main() {
  const { runId, numeroContrato } = novoRunId();

  let adminToken = "";
  let adminId = "";
  let organizacaoId = "";

  let especieId = "";
  let produtoId = "";
  let importadorId = "";
  let representanteId = "";
  let statusId = "";
  let contratoId = "";

  let operacionalUserId = "";
  let operacionalToken = "";
  let orgBId = "";
  let importadorBId = "";

  const steps: SmokeStep[] = [
    {
      name: "1) Login como admin",
      run: async () => {
        const { status, json } = await api("POST", "/auth/login", { body: { login: ADMIN_LOGIN, senha: ADMIN_SENHA } });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json?.accessToken, "resposta sem accessToken");
        adminToken = json.accessToken;
        adminId = json.usuario.id;
        organizacaoId = json.usuario.organizacaoId;
      },
    },
    {
      name: "2) Criar especie, produto, importador, representante, status_contrato",
      run: async () => {
        const refs = await criarReferencias(api, adminToken, runId);
        especieId = refs.especieId;
        produtoId = refs.produtoId;
        importadorId = refs.importadorId;
        representanteId = refs.representanteId;
        statusId = refs.statusId;
      },
    },
    {
      name: "3) Criar contrato usando essas referências -> 201",
      run: async () => {
        contratoId = await criarContrato(api, adminToken, numeroContrato, {
          especieId,
          produtoId,
          importadorId,
          representanteId,
          statusId,
        });
      },
    },
    {
      name: "4) Listar contratos -> aparece o criado",
      run: async () => {
        const { status, json } = await api("GET", "/contratos?pageSize=100", { token: adminToken });
        assert(status === 200, `esperado 200, veio ${status}`);
        const found = (json.data as Array<{ id: string }>).some((c) => c.id === contratoId);
        assert(found, `contrato ${contratoId} não apareceu na listagem`);
      },
    },
    {
      name: "5) Filtrar contratos por statusId -> aparece",
      run: async () => {
        const { status, json } = await api("GET", `/contratos?statusId=${statusId}`, { token: adminToken });
        assert(status === 200, `esperado 200, veio ${status}`);
        const found = (json.data as Array<{ id: string }>).some((c) => c.id === contratoId);
        assert(found, `contrato ${contratoId} não apareceu no filtro por statusId`);
      },
    },
    {
      name: "6) Editar contrato (PATCH) -> atualizadoPorId = admin",
      run: async () => {
        const { status, json } = await api("PATCH", `/contratos/${contratoId}`, {
          token: adminToken,
          body: { volumeM3: 200 },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.volumeM3 === 200, `volumeM3 não foi atualizado (veio ${json.volumeM3})`);
        assert(json.atualizadoPorId === adminId, `atualizadoPorId esperado "${adminId}", veio "${json.atualizadoPorId}"`);
      },
    },
    {
      name: "7) Criar contrato duplicando numeroContrato -> 409",
      run: async () => {
        const { status, json } = await api("POST", "/contratos", {
          token: adminToken,
          body: { ...contratoBase, numeroContrato, importadorId, representanteId, produtoId, statusId },
        });
        assert(status === 409, `esperado 409, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "8) Deletar produto em uso pelo contrato -> 409",
      run: async () => {
        const { status, json } = await api("DELETE", `/produtos/${produtoId}`, { token: adminToken });
        assert(status === 409, `esperado 409, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "9) Criar usuário Operacional (via SQL direto) e logar -> sucesso",
      run: async () => {
        const senha = "senha-smoke-teste-123";
        const senhaHash = await bcrypt.hash(senha, 10);
        const login = `smoke-operacional-${runId}`;
        const usuario = await prisma.usuario.create({
          data: {
            organizacaoId,
            login,
            email: `${login}@example.com`,
            senhaHash,
            nomeCompleto: "Smoke Operacional",
            perfilAcesso: "Operacional",
          },
        });
        operacionalUserId = usuario.id;

        const { status, json } = await api("POST", "/auth/login", { body: { login, senha } });
        assert(status === 200, `login operacional: esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        operacionalToken = json.accessToken;
      },
    },
    {
      name: "10) Operacional: GET contratos -> 200, POST contratos -> 403",
      run: async () => {
        const get = await api("GET", "/contratos", { token: operacionalToken });
        assert(get.status === 200, `GET: esperado 200, veio ${get.status}`);

        const post = await api("POST", "/contratos", {
          token: operacionalToken,
          body: { ...contratoBase, numeroContrato: `${numeroContrato}-OP`, importadorId, representanteId, produtoId, statusId },
        });
        assert(post.status === 403, `POST: esperado 403, veio ${post.status}: ${JSON.stringify(post.json)}`);
      },
    },
    {
      name: "11) Isolamento cruzado: contrato referenciando importador de outra org -> erro claro",
      run: async () => {
        const orgB = await prisma.organizacao.create({ data: { nome: `Org Smoke Cross-Tenant ${runId}` } });
        orgBId = orgB.id;

        const importadorB = await prisma.importador.create({
          data: {
            organizacaoId: orgBId,
            nomeRazaoSocial: `Importador Org B (smoke ${runId})`,
            pais: "DE",
            email: `smoke-orgb-${runId}@example.com`,
          },
        });
        importadorBId = importadorB.id;

        const { status, json } = await api("POST", "/contratos", {
          token: adminToken,
          body: {
            ...contratoBase,
            numeroContrato: `${numeroContrato}-CROSS`,
            importadorId: importadorBId,
            representanteId,
            produtoId,
            statusId,
          },
        });
        assert(
          status === 400 || status === 404,
          `esperado 400 ou 404 (nunca 500, nunca sucesso), veio ${status}: ${JSON.stringify(json)}`,
        );
      },
    },
  ];

  const result = await runSmokeSteps(steps, async () => {
    await limparFixture(prisma, numeroContrato, { produtoId, especieId, importadorId, representanteId, statusId });
    if (operacionalUserId) await prisma.usuario.deleteMany({ where: { id: operacionalUserId } });
    if (importadorBId) await prisma.importador.deleteMany({ where: { id: importadorBId } });
    if (orgBId) await prisma.organizacao.deleteMany({ where: { id: orgBId } });
  });

  await prisma.$disconnect();
  process.exitCode = result.failed ? 1 : 0;
}

main().catch((err) => {
  console.error("Erro inesperado no runner do smoke test:", err);
  process.exitCode = 1;
});
