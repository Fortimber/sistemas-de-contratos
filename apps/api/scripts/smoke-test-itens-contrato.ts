/**
 * Smoke test de itens de contrato (`itens_contrato`) — múltiplas linhas de
 * especificação (espessura/largura/comprimento/volume/preço) dentro de um
 * único contrato.
 *
 * Além do CRUD (criar, listar, editar, remover), confirma: validação de
 * comprimentoMaxMm >= comprimentoMinMm tanto no `POST` quanto no `PATCH`
 * (neste último, contra o valor EFETIVO — mesclando o que já estava salvo
 * com o que veio na chamada, não só o que foi enviado agora — ver
 * itens-contrato.routes.ts), permissão de escrita (Administrador+Comercial,
 * igual à escrita do próprio contrato — não Administrador+Operacional como
 * os setores), e que criação/edição de item aparecem em
 * `GET /contratos/:id/auditoria` (ItemContrato está em AUDITED_MODELS, ver
 * middleware/audit-logger.ts) sem nenhum código extra pra isso.
 *
 * Reaproveita o setup de referências+contrato e o cliente HTTP já extraídos
 * em scripts/smoke-test-fixtures.ts e scripts/smoke-test-helpers.ts.
 *
 * Uso (de dentro do container da API, com a API já rodando):
 *   docker compose exec api npm run smoke:itens-contrato
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

  let item1Id = "";
  let item2Id = "";
  let operacionalUserId = "";

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
      name: "2) GET itens antes de existir -> 200, lista vazia",
      run: async () => {
        const { status, json } = await api("GET", `/contratos/${contratoId}/itens`, { token: adminToken });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(Array.isArray(json) && json.length === 0, `esperado lista vazia, veio ${JSON.stringify(json)}`);
      },
    },
    {
      name: "3) POST 3 itens com dimensões diferentes -> 201 cada, campos batem",
      run: async () => {
        const a = await api("POST", `/contratos/${contratoId}/itens`, {
          token: adminToken,
          body: {
            espessuraMm: 25.4,
            larguraMm: 150,
            comprimentoMinMm: 2000,
            comprimentoMaxMm: 3000,
            volumeM3: 12.5,
            precoPorM3Usd: 450.5,
          },
        });
        assert(a.status === 201, `item A: esperado 201, veio ${a.status}: ${JSON.stringify(a.json)}`);
        assert(Number(a.json.espessuraMm) === 25.4, `espessuraMm esperado 25.4, veio ${a.json.espessuraMm}`);
        assert(typeof a.json.volumeM3 === "string", `volumeM3 deveria ser string, veio ${typeof a.json.volumeM3}`);
        item1Id = a.json.id;

        const b = await api("POST", `/contratos/${contratoId}/itens`, {
          token: adminToken,
          body: {
            espessuraMm: 50,
            larguraMm: 200,
            comprimentoMinMm: 2500,
            comprimentoMaxMm: 2500,
            volumeM3: 8,
            precoPorM3Usd: 500,
          },
        });
        assert(b.status === 201, `item B: esperado 201, veio ${b.status}: ${JSON.stringify(b.json)}`);
        item2Id = b.json.id;

        const c = await api("POST", `/contratos/${contratoId}/itens`, {
          token: adminToken,
          body: {
            espessuraMm: 38,
            larguraMm: 100,
            comprimentoMinMm: 1000,
            comprimentoMaxMm: 1800,
            volumeM3: 5.25,
            precoPorM3Usd: 420,
          },
        });
        assert(c.status === 201, `item C: esperado 201, veio ${c.status}: ${JSON.stringify(c.json)}`);
      },
    },
    {
      name: "4) GET itens -> lista os 3, ordenados por criação",
      run: async () => {
        const { status, json } = await api("GET", `/contratos/${contratoId}/itens`, { token: adminToken });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.length === 3, `esperado 3 itens, veio ${json.length}`);
        assert(json[0].id === item1Id, `primeiro item esperado ${item1Id}, veio ${json[0].id}`);
      },
    },
    {
      name: "5) PATCH item 1 (volume e preço) -> atualiza, resto continua igual",
      run: async () => {
        const { status, json } = await api("PATCH", `/contratos/${contratoId}/itens/${item1Id}`, {
          token: adminToken,
          body: { volumeM3: 13.75, precoPorM3Usd: 475 },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(Number(json.volumeM3) === 13.75, `volumeM3 esperado 13.75, veio ${json.volumeM3}`);
        assert(Number(json.precoPorM3Usd) === 475, `precoPorM3Usd esperado 475, veio ${json.precoPorM3Usd}`);
        assert(Number(json.espessuraMm) === 25.4, `espessuraMm deveria continuar 25.4, veio ${json.espessuraMm}`);
      },
    },
    {
      name: "6) POST item com comprimentoMaxMm < comprimentoMinMm -> 400",
      run: async () => {
        const { status, json } = await api("POST", `/contratos/${contratoId}/itens`, {
          token: adminToken,
          body: {
            espessuraMm: 25,
            larguraMm: 100,
            comprimentoMinMm: 3000,
            comprimentoMaxMm: 2000,
            volumeM3: 1,
            precoPorM3Usd: 400,
          },
        });
        assert(status === 400, `esperado 400, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "7) PATCH item 1 só com comprimentoMaxMm menor que o comprimentoMinMm salvo -> 400 (validação com valor efetivo)",
      run: async () => {
        const { status, json } = await api("PATCH", `/contratos/${contratoId}/itens/${item1Id}`, {
          token: adminToken,
          body: { comprimentoMaxMm: 1000 }, // comprimentoMinMm salvo é 2000
        });
        assert(status === 400, `esperado 400, veio ${status}: ${JSON.stringify(json)}`);
      },
    },
    {
      name: "8) DELETE item 2 -> 204; GET itens -> restam 2",
      run: async () => {
        const del = await api("DELETE", `/contratos/${contratoId}/itens/${item2Id}`, { token: adminToken });
        assert(del.status === 204, `esperado 204, veio ${del.status}: ${JSON.stringify(del.json)}`);

        const { status, json } = await api("GET", `/contratos/${contratoId}/itens`, { token: adminToken });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.length === 2, `esperado 2 itens após remoção, veio ${json.length}`);
        assert(
          !json.some((i: { id: string }) => i.id === item2Id),
          `item ${item2Id} deveria ter sido removido, ainda apareceu na lista`,
        );
      },
    },
    {
      name: "9) Usuário Operacional (sem permissão — itens exige Administrador+Comercial): GET -> 200, POST -> 403",
      run: async () => {
        const senha = "senha-smoke-teste-123";
        const senhaHash = await bcrypt.hash(senha, 10);
        const login = `smoke-operacional-itens-${runId}`;
        const usuario = await prisma.usuario.create({
          data: {
            organizacaoId,
            login,
            email: `${login}@example.com`,
            senhaHash,
            nomeCompleto: "Smoke Operacional (Itens de Contrato)",
            perfilAcesso: "Operacional",
          },
        });
        operacionalUserId = usuario.id;

        const loginRes = await api("POST", "/auth/login", { body: { login, senha } });
        assert(loginRes.status === 200, `login operacional: esperado 200, veio ${loginRes.status}`);
        const operacionalToken = loginRes.json.accessToken;

        const get = await api("GET", `/contratos/${contratoId}/itens`, { token: operacionalToken });
        assert(get.status === 200, `GET: esperado 200, veio ${get.status}: ${JSON.stringify(get.json)}`);

        const post = await api("POST", `/contratos/${contratoId}/itens`, {
          token: operacionalToken,
          body: {
            espessuraMm: 25,
            larguraMm: 100,
            comprimentoMinMm: 1000,
            comprimentoMaxMm: 2000,
            volumeM3: 1,
            precoPorM3Usd: 400,
          },
        });
        assert(post.status === 403, `POST: esperado 403, veio ${post.status}: ${JSON.stringify(post.json)}`);
      },
    },
    {
      name: "10) GET/POST itens de contratoId inexistente -> 404",
      run: async () => {
        const fakeId = randomUUID();
        const get = await api("GET", `/contratos/${fakeId}/itens`, { token: adminToken });
        assert(get.status === 404, `GET: esperado 404, veio ${get.status}: ${JSON.stringify(get.json)}`);

        const post = await api("POST", `/contratos/${fakeId}/itens`, {
          token: adminToken,
          body: {
            espessuraMm: 25,
            larguraMm: 100,
            comprimentoMinMm: 1000,
            comprimentoMaxMm: 2000,
            volumeM3: 1,
            precoPorM3Usd: 400,
          },
        });
        assert(post.status === 404, `POST: esperado 404, veio ${post.status}: ${JSON.stringify(post.json)}`);
      },
    },
    {
      name: "11) Auditoria: criação e edição do item 1 aparecem em GET /contratos/:id/auditoria",
      run: async () => {
        const { status, json } = await api("GET", `/contratos/${contratoId}/auditoria?pageSize=100`, {
          token: adminToken,
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);

        const linhas = json.data as Array<{
          acao: string;
          campoAlterado: string | null;
          valorAnterior: string | null;
          valorNovo: string | null;
        }>;

        // >= 4: 1 linha da criação do próprio contrato (criarContrato) + 3
        // dos itens criados no passo 3 (a exclusão do item 2 no passo 8 NÃO
        // apaga a linha de auditoria da criação dele — auditoria é
        // append-only). Contar em vez de só "existe alguma linha" — checa
        // de fato que ItemContrato está sendo auditado, não só o contrato.
        const criacoes = linhas.filter((l) => l.acao === "Criacao" && l.campoAlterado === null);
        assert(
          criacoes.length >= 4,
          `esperado >= 4 linhas de Criacao (1 contrato + 3 itens), veio ${criacoes.length}: ${JSON.stringify(linhas)}`,
        );

        const edicaoVolume = linhas.find((l) => l.campoAlterado === "volumeM3" && l.valorNovo === "13.75");
        assert(
          !!edicaoVolume,
          `nenhuma linha de edição de volumeM3 (item 1, novo valor 13.75) encontrada: ${JSON.stringify(linhas)}`,
        );
      },
    },
  ];

  const result = await runSmokeSteps(steps, async () => {
    // itens_contrato tem onDelete: Cascade a partir de contratos — não
    // precisa de delete próprio, cai junto com limparFixture abaixo.
    await limparFixture(prisma, numeroContrato, { produtoId, especieId, importadorId, representanteId, statusId });
    if (operacionalUserId) await prisma.usuario.deleteMany({ where: { id: operacionalUserId } });
  });

  await prisma.$disconnect();
  process.exitCode = result.failed ? 1 : 0;
}

main().catch((err) => {
  console.error("Erro inesperado no runner do smoke test:", err);
  process.exitCode = 1;
});
