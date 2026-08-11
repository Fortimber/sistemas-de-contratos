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
