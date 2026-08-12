import type { PerfilAcesso } from "@/lib/auth-context";

/**
 * Perfis com permissão de escrita em referências (espécies, produtos,
 * importadores, representantes, status) e em contratos — espelha
 * exatamente `requireRole("Administrador", "Comercial")` usado em TODAS
 * essas rotas na API (ver apps/api/src/modules/{especies,produtos,
 * importadores,representantes,status-contrato,contratos}/*.routes.ts).
 *
 * IMPORTANTE: isto é só UX (esconder botões de criar/editar/excluir de
 * quem não vai poder usá-los mesmo). A segurança de verdade é a checagem
 * no backend — mesmo que alguém forje uma requisição direto pra API
 * escondendo isso daqui, o `preHandler: requireRole(...)` do lado do
 * servidor barra do mesmo jeito. Nunca confiar só nesta checagem.
 */
const WRITE_ROLES: PerfilAcesso[] = ["Administrador", "Comercial"];

export function canWriteReferences(perfilAcesso: PerfilAcesso | undefined): boolean {
  return !!perfilAcesso && WRITE_ROLES.includes(perfilAcesso);
}

/**
 * Permissão de escrita por aba setorial (tela de detalhe do contrato, Fase
 * 3 do frontend) — espelha exatamente o `WRITE_ROLES` de cada
 * `detalhes-*.routes.ts` na API:
 * - Produção/Logística: `requireRole("Administrador", "Operacional")` (não
 *   existe perfil "Produção"/"Logística" isolado no enum `PerfilAcesso`).
 * - Ambiental: `requireRole("Administrador", "Ambiental")`.
 * - Financeiro: `requireRole("Administrador", "Financeiro")`.
 *
 * Mesma ressalva de `canWriteReferences`: isto só esconde o formulário de
 * quem não vai poder salvar mesmo (UX); a permissão de verdade é o `PUT`
 * respondendo `403` no backend.
 */
const SECTOR_WRITE_ROLES: Record<"producao" | "ambiental" | "logistica" | "financeiro", PerfilAcesso[]> = {
  producao: ["Administrador", "Operacional"],
  ambiental: ["Administrador", "Ambiental"],
  logistica: ["Administrador", "Operacional"],
  financeiro: ["Administrador", "Financeiro"],
};

export function canWriteSector(
  setor: "producao" | "ambiental" | "logistica" | "financeiro",
  perfilAcesso: PerfilAcesso | undefined,
): boolean {
  return !!perfilAcesso && SECTOR_WRITE_ROLES[setor].includes(perfilAcesso);
}

/**
 * Permissão de escrita da tela de referência "Eventos de pagamento"
 * (`src/features/referencias/eventos-pagamento-page.tsx`) — espelha
 * `requireRole("Administrador", "Financeiro")` em
 * `eventos-pagamento.routes.ts` na API. Diferente de `canWriteReferences`
 * (Administrador+Comercial, usada pelas outras 5 tabelas de referência):
 * evento de pagamento é conceito do setor Financeiro, mesmos perfis de
 * `canWriteSector("financeiro", ...)`. Passada como `canWrite` na
 * `ReferenceCrudConfig` dessa tela (ver `reference-crud-page.tsx`).
 */
export function canWriteEventosPagamento(perfilAcesso: PerfilAcesso | undefined): boolean {
  return canWriteSector("financeiro", perfilAcesso);
}

/**
 * Leitura da aba "Auditoria" (tela de detalhe do contrato, Fase 4 do
 * frontend) — espelha exatamente `requireRole("Administrador")` em
 * `apps/api/src/modules/auditoria-contratos/auditoria-contratos.routes.ts`.
 * Diferente das funções acima: aqui é permissão de LEITURA, não escrita —
 * a própria aba não deve aparecer pra quem não é Administrador (não é só
 * esconder o conteúdo), porque não faz sentido de UX mostrar uma aba cujo
 * `GET` sempre responde `403`. `historico-status` (aba "Histórico") não
 * tem checagem equivalente — leitura é liberada a qualquer perfil
 * autenticado, igual ao resto do sistema.
 */
export function canViewAuditoria(perfilAcesso: PerfilAcesso | undefined): boolean {
  return perfilAcesso === "Administrador";
}
