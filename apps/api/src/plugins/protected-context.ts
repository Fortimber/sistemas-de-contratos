import type { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth.js";
import { attachTenantScope, releaseTenantScope } from "../middleware/tenant-scoping.js";
import { meRoutes } from "../modules/auth/me.routes.js";
import { logoutRoutes } from "../modules/auth/logout.routes.js";
import { especiesRoutes } from "../modules/especies/especies.routes.js";
import { produtosRoutes } from "../modules/produtos/produtos.routes.js";
import { importadoresRoutes } from "../modules/importadores/importadores.routes.js";
import { representantesRoutes } from "../modules/representantes/representantes.routes.js";
import { statusContratoRoutes } from "../modules/status-contrato/status-contrato.routes.js";
import { eventosPagamentoRoutes } from "../modules/eventos-pagamento/eventos-pagamento.routes.js";
import { contratosRoutes } from "../modules/contratos/contratos.routes.js";
import { detalhesProducaoRoutes } from "../modules/detalhes-producao/detalhes-producao.routes.js";
import { detalhesAmbientalRoutes } from "../modules/detalhes-ambiental/detalhes-ambiental.routes.js";
import { detalhesLogisticaRoutes } from "../modules/detalhes-logistica/detalhes-logistica.routes.js";
import { detalhesFinanceiroRoutes } from "../modules/detalhes-financeiro/detalhes-financeiro.routes.js";
import { historicoStatusContratoRoutes } from "../modules/historico-status-contrato/historico-status-contrato.routes.js";
import { auditoriaContratosRoutes } from "../modules/auditoria-contratos/auditoria-contratos.routes.js";
import { itensContratoRoutes } from "../modules/itens-contrato/itens-contrato.routes.js";

/**
 * Contexto protegido: autenticação + tenant-scoping registrados uma única
 * vez aqui via addHook, não repetidos rota a rota. Toda rota que precisa de
 * usuário logado e de request.db (Prisma já filtrado por organizacaoId,
 * rodando dentro da transação por-requisição que sustenta o GUC de RLS) é
 * registrada dentro deste plugin.
 */
export async function protectedContext(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", attachTenantScope);
  // onSend (não onResponse) — precisa commitar ANTES da resposta sair pro
  // cliente, senão um GET/consulta feita logo em seguida pode não ver a
  // escrita ainda. Ver comentário grande em middleware/tenant-scoping.ts.
  app.addHook("onSend", releaseTenantScope);

  await app.register(meRoutes);
  await app.register(logoutRoutes);

  // Fase 2 — tabelas de referência + entidade central de contratos.
  await app.register(especiesRoutes);
  await app.register(produtosRoutes);
  await app.register(importadoresRoutes);
  await app.register(representantesRoutes);
  await app.register(statusContratoRoutes);
  // Tabela de referência do prazo de pagamento (Financeiro) — adicionada
  // depois da Fase 2, mas é o mesmo tipo de rota.
  await app.register(eventosPagamentoRoutes);
  await app.register(contratosRoutes);

  // Fase 3 — módulos setoriais (Produção, Ambiental, Logística e Financeiro — completa).
  await app.register(detalhesProducaoRoutes);
  await app.register(detalhesAmbientalRoutes);
  await app.register(detalhesLogisticaRoutes);
  await app.register(detalhesFinanceiroRoutes);

  // Fase 4 — histórico de status + auditoria (leitura; escrita é automática
  // via PATCH /contratos/:id e via middleware/audit-logger.ts).
  await app.register(historicoStatusContratoRoutes);
  await app.register(auditoriaContratosRoutes);

  // Itens de contrato (múltiplas linhas de especificação) — adicionado
  // depois da Fase 4.
  await app.register(itensContratoRoutes);
}
