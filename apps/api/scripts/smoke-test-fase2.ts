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
 *   docker compose exec api npx tsx scripts/smoke-test-fase2.ts
 *
 * Reusável como teste de regressão: para no primeiro FAIL, mas a limpeza
 * roda sempre (sucesso ou falha) — nenhum estado de teste fica no banco.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "../src/lib/prisma.js";

const API_URL = process.env.SMOKE_API_URL ?? "http://localhost:3000";
const ADMIN_LOGIN = process.env.SEED_ADMIN_LOGIN ?? "admin";
const ADMIN_SENHA = process.env.SEED_ADMIN_SENHA ?? "troque-esta-senha";

let passed = 0;
let failed = false;

function logPass(name: string) {
  passed += 1;
  console.log(`PASS  ${name}`);
}

function logFail(name: string, detail: string) {
  console.error(`FAIL  ${name}`);
  console.error(`      ${detail}`);
}

class SmokeAssertionError extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SmokeAssertionError(message);
}

interface ApiResult {
  status: number;
  json: any;
}

async function api(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<ApiResult> {
  // Content-Type só quando há body de verdade — Fastify rejeita
  // "application/json" com corpo vazio (ex.: nos DELETEs sem body).
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

/** Roda um passo; retorna false (e já loga o FAIL) se ele lançar. */
async function step(name: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    logPass(name);
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logFail(name, detail);
    return false;
  }
}

const contratoBase = {
  tipoContrato: "Original",
  dataContrato: "2026-01-15",
  volumeM3: 120.5,
  qtdContainers: 5,
  local: "Belém",
  tipoFrete: "FOB",
  valorTotalUsd: 45000,
  moedaValorTotal: "USD",
  modalidadePgtContaBrasil: "À vista",
  modalidadePgtContaExterior: "À vista",
} as const;

async function main() {
  const runId = randomUUID().slice(0, 8);
  const numeroContrato = `SMOKE-${runId}`;

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

  const steps: Array<[string, () => Promise<void>]> = [
    [
      "1) Login como admin",
      async () => {
        const { status, json } = await api("POST", "/auth/login", { body: { login: ADMIN_LOGIN, senha: ADMIN_SENHA } });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json?.accessToken, "resposta sem accessToken");
        adminToken = json.accessToken;
        adminId = json.usuario.id;
        organizacaoId = json.usuario.organizacaoId;
      },
    ],
    [
      "2) Criar especie, produto, importador, representante, status_contrato",
      async () => {
        const e = await api("POST", "/especies", { token: adminToken, body: { nomeEspecie: `Especie ${runId}` } });
        assert(e.status === 201, `especie: esperado 201, veio ${e.status}: ${JSON.stringify(e.json)}`);
        especieId = e.json.id;

        const p = await api("POST", "/produtos", {
          token: adminToken,
          body: { nomeProduto: `Produto ${runId}`, especieId },
        });
        assert(p.status === 201, `produto: esperado 201, veio ${p.status}: ${JSON.stringify(p.json)}`);
        produtoId = p.json.id;

        const i = await api("POST", "/importadores", {
          token: adminToken,
          body: { nomeRazaoSocial: `Importador ${runId}`, pais: "US", email: `smoke-${runId}@example.com` },
        });
        assert(i.status === 201, `importador: esperado 201, veio ${i.status}: ${JSON.stringify(i.json)}`);
        importadorId = i.json.id;

        const r = await api("POST", "/representantes", {
          token: adminToken,
          body: { nomeRepresentante: `Representante ${runId}`, email: `smoke-rep-${runId}@example.com` },
        });
        assert(r.status === 201, `representante: esperado 201, veio ${r.status}: ${JSON.stringify(r.json)}`);
        representanteId = r.json.id;

        const s = await api("POST", "/status-contrato", {
          token: adminToken,
          body: { nomeStatus: `Status ${runId}`, setorResponsavel: "Comercial", ordem: 1 },
        });
        assert(s.status === 201, `status: esperado 201, veio ${s.status}: ${JSON.stringify(s.json)}`);
        statusId = s.json.id;
      },
    ],
    [
      "3) Criar contrato usando essas referências -> 201",
      async () => {
        const { status, json } = await api("POST", "/contratos", {
          token: adminToken,
          body: { ...contratoBase, numeroContrato, importadorId, representanteId, produtoId, statusId },
        });
        assert(status === 201, `esperado 201, veio ${status}: ${JSON.stringify(json)}`);
        contratoId = json.id;
      },
    ],
    [
      "4) Listar contratos -> aparece o criado",
      async () => {
        const { status, json } = await api("GET", "/contratos?pageSize=100", { token: adminToken });
        assert(status === 200, `esperado 200, veio ${status}`);
        const found = (json.data as Array<{ id: string }>).some((c) => c.id === contratoId);
        assert(found, `contrato ${contratoId} não apareceu na listagem`);
      },
    ],
    [
      "5) Filtrar contratos por statusId -> aparece",
      async () => {
        const { status, json } = await api("GET", `/contratos?statusId=${statusId}`, { token: adminToken });
        assert(status === 200, `esperado 200, veio ${status}`);
        const found = (json.data as Array<{ id: string }>).some((c) => c.id === contratoId);
        assert(found, `contrato ${contratoId} não apareceu no filtro por statusId`);
      },
    ],
    [
      "6) Editar contrato (PATCH) -> atualizadoPorId = admin",
      async () => {
        const { status, json } = await api("PATCH", `/contratos/${contratoId}`, {
          token: adminToken,
          body: { volumeM3: 200 },
        });
        assert(status === 200, `esperado 200, veio ${status}: ${JSON.stringify(json)}`);
        assert(json.volumeM3 === 200, `volumeM3 não foi atualizado (veio ${json.volumeM3})`);
        assert(json.atualizadoPorId === adminId, `atualizadoPorId esperado "${adminId}", veio "${json.atualizadoPorId}"`);
      },
    ],
    [
      "7) Criar contrato duplicando numeroContrato -> 409",
      async () => {
        const { status, json } = await api("POST", "/contratos", {
          token: adminToken,
          body: { ...contratoBase, numeroContrato, importadorId, representanteId, produtoId, statusId },
        });
        assert(status === 409, `esperado 409, veio ${status}: ${JSON.stringify(json)}`);
      },
    ],
    [
      "8) Deletar produto em uso pelo contrato -> 409",
      async () => {
        const { status, json } = await api("DELETE", `/produtos/${produtoId}`, { token: adminToken });
        assert(status === 409, `esperado 409, veio ${status}: ${JSON.stringify(json)}`);
      },
    ],
    [
      "9) Criar usuário Operacional (via SQL direto) e logar -> sucesso",
      async () => {
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
    ],
    [
      "10) Operacional: GET contratos -> 200, POST contratos -> 403",
      async () => {
        const get = await api("GET", "/contratos", { token: operacionalToken });
        assert(get.status === 200, `GET: esperado 200, veio ${get.status}`);

        const post = await api("POST", "/contratos", {
          token: operacionalToken,
          body: { ...contratoBase, numeroContrato: `${numeroContrato}-OP`, importadorId, representanteId, produtoId, statusId },
        });
        assert(post.status === 403, `POST: esperado 403, veio ${post.status}: ${JSON.stringify(post.json)}`);
      },
    ],
    [
      "11) Isolamento cruzado: contrato referenciando importador de outra org -> erro claro",
      async () => {
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
    ],
  ];

  try {
    for (const [name, fn] of steps) {
      const ok = await step(name, fn);
      if (!ok) {
        failed = true;
        break;
      }
    }
  } finally {
    console.log("\n-- 12) limpeza (roda sempre, sucesso ou falha) --");
    await prisma.contrato.deleteMany({ where: { numeroContrato: { startsWith: numeroContrato } } });
    if (produtoId) await prisma.produto.deleteMany({ where: { id: produtoId } });
    if (especieId) await prisma.especie.deleteMany({ where: { id: especieId } });
    if (importadorId) await prisma.importador.deleteMany({ where: { id: importadorId } });
    if (representanteId) await prisma.representante.deleteMany({ where: { id: representanteId } });
    if (statusId) await prisma.statusContrato.deleteMany({ where: { id: statusId } });
    if (operacionalUserId) await prisma.usuario.deleteMany({ where: { id: operacionalUserId } });
    if (importadorBId) await prisma.importador.deleteMany({ where: { id: importadorBId } });
    if (orgBId) await prisma.organizacao.deleteMany({ where: { id: orgBId } });
    console.log("limpeza concluída.");
  }
}

main()
  .catch((err) => {
    console.error("Erro inesperado no runner do smoke test:", err);
    failed = true;
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(`\n${passed} passo(s) com PASS.`);
    if (failed) {
      console.error("RESULTADO: FALHOU — parou no primeiro FAIL (ver acima).");
      process.exitCode = 1;
    } else {
      console.log("RESULTADO: OK — todos os passos passaram.");
    }
  });
