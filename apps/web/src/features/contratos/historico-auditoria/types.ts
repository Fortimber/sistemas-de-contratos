/** Usuário populado nas linhas de histórico/auditoria — só o essencial pra exibição, nunca o Usuario inteiro (senhaHash, email). */
export interface UsuarioResumo {
  id: string;
  nomeCompleto: string;
}

/**
 * Tipos das duas abas de leitura da tela de detalhe do contrato (Fase 4):
 * histórico de mudança de status (`historico_status_contrato`) e trilha de
 * auditoria campo a campo (`auditoria_contratos`). `statusAnteriorId`/
 * `statusNovoId` continuam só como id (ver historico-status-contrato.routes.ts
 * — resolvidos pro nome no frontend via o mesmo lookup id -> nome já usado em
 * contratos-list-page.tsx, porque `/status-contrato` é listável). Já
 * `alteradoPorId`/`usuarioId` vêm ACOMPANHADOS da relação populada
 * (`alteradoPor`/`usuario`, `include` nas duas rotas) — não existe endpoint
 * de listagem de usuários na API pra resolver um id arbitrário no frontend,
 * então a API resolve o nome direto na resposta. `null` quando a mudança não
 * teve usuário associado, ou quando o usuário foi excluído depois (FK com
 * `ON DELETE SET NULL`).
 */
export interface HistoricoStatusContrato {
  id: string;
  contratoId: string;
  statusAnteriorId: string | null;
  statusNovoId: string;
  alteradoPorId: string | null;
  alteradoPor: UsuarioResumo | null;
  observacao: string | null;
  dataAlteracao: string;
}

/**
 * Espelha o enum `AcaoAuditoria` do schema.prisma — os valores runtime do
 * client Prisma são as CHAVES do enum ("Criacao"), não o `@map` em
 * português usado só na coluna do Postgres (confirmado em
 * apps/api/scripts/smoke-test-fase4.ts, que filtra por
 * `acao: "Criacao"`).
 */
export type AcaoAuditoria = "Criacao" | "Edicao" | "Exclusao";

export interface AuditoriaContrato {
  id: string;
  contratoId: string;
  usuarioId: string | null;
  usuario: UsuarioResumo | null;
  acao: AcaoAuditoria;
  campoAlterado: string | null;
  valorAnterior: string | null;
  valorNovo: string | null;
  dataHora: string;
}
