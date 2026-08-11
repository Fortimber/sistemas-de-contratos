/**
 * Fixture reusável entre scripts de smoke test: cria (via API real, não SQL)
 * 1 de cada tabela de referência + 1 contrato usando essas referências.
 * Introduzido na Fase 2, reaproveitado por scripts de fase seguintes que
 * precisam de "um contrato de teste" pronto (ex.: Fase 3 — módulos setoriais).
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { assert, type ApiClient } from "./smoke-test-helpers.js";

export const contratoBase = {
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

export interface ReferenciasFixture {
  especieId: string;
  produtoId: string;
  importadorId: string;
  representanteId: string;
  statusId: string;
}

/** Cria especie, produto, importador, representante e status_contrato via API. */
export async function criarReferencias(api: ApiClient, adminToken: string, runId: string): Promise<ReferenciasFixture> {
  const e = await api("POST", "/especies", { token: adminToken, body: { nomeEspecie: `Especie ${runId}` } });
  assert(e.status === 201, `especie: esperado 201, veio ${e.status}: ${JSON.stringify(e.json)}`);
  const especieId = e.json.id;

  const p = await api("POST", "/produtos", { token: adminToken, body: { nomeProduto: `Produto ${runId}`, especieId } });
  assert(p.status === 201, `produto: esperado 201, veio ${p.status}: ${JSON.stringify(p.json)}`);
  const produtoId = p.json.id;

  const i = await api("POST", "/importadores", {
    token: adminToken,
    body: { nomeRazaoSocial: `Importador ${runId}`, pais: "US", email: `smoke-${runId}@example.com` },
  });
  assert(i.status === 201, `importador: esperado 201, veio ${i.status}: ${JSON.stringify(i.json)}`);
  const importadorId = i.json.id;

  const r = await api("POST", "/representantes", {
    token: adminToken,
    body: { nomeRepresentante: `Representante ${runId}`, email: `smoke-rep-${runId}@example.com` },
  });
  assert(r.status === 201, `representante: esperado 201, veio ${r.status}: ${JSON.stringify(r.json)}`);
  const representanteId = r.json.id;

  const s = await api("POST", "/status-contrato", {
    token: adminToken,
    body: { nomeStatus: `Status ${runId}`, setorResponsavel: "Comercial", ordem: 1 },
  });
  assert(s.status === 201, `status: esperado 201, veio ${s.status}: ${JSON.stringify(s.json)}`);
  const statusId = s.json.id;

  return { especieId, produtoId, importadorId, representanteId, statusId };
}

/** Cria 1 contrato usando as referências dadas. Retorna o id do contrato criado. */
export async function criarContrato(
  api: ApiClient,
  adminToken: string,
  numeroContrato: string,
  refs: ReferenciasFixture,
): Promise<string> {
  const { status, json } = await api("POST", "/contratos", {
    token: adminToken,
    body: {
      ...contratoBase,
      numeroContrato,
      importadorId: refs.importadorId,
      representanteId: refs.representanteId,
      produtoId: refs.produtoId,
      statusId: refs.statusId,
    },
  });
  assert(status === 201, `contrato: esperado 201, veio ${status}: ${JSON.stringify(json)}`);
  return json.id;
}

/** Gera um runId curto + o numeroContrato derivado dele, usado pra nomear tudo do teste. */
export function novoRunId(): { runId: string; numeroContrato: string } {
  const runId = randomUUID().slice(0, 8);
  return { runId, numeroContrato: `SMOKE-${runId}` };
}

/**
 * Remove o contrato (e qualquer variante com o mesmo prefixo de
 * numeroContrato, ex.: "-OP"/"-CROSS") e as referências criadas por
 * criarReferencias. Tabelas 1:1 do contrato (detalhes_producao etc.) têm
 * onDelete: Cascade — não precisam de limpeza própria aqui.
 */
export async function limparFixture(
  prisma: PrismaClient,
  numeroContrato: string,
  refs: Partial<ReferenciasFixture>,
): Promise<void> {
  await prisma.contrato.deleteMany({ where: { numeroContrato: { startsWith: numeroContrato } } });
  if (refs.produtoId) await prisma.produto.deleteMany({ where: { id: refs.produtoId } });
  if (refs.especieId) await prisma.especie.deleteMany({ where: { id: refs.especieId } });
  if (refs.importadorId) await prisma.importador.deleteMany({ where: { id: refs.importadorId } });
  if (refs.representanteId) await prisma.representante.deleteMany({ where: { id: refs.representanteId } });
  if (refs.statusId) await prisma.statusContrato.deleteMany({ where: { id: refs.statusId } });
}
