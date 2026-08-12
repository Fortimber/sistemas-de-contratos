import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Paginated } from "@/lib/pagination";
import type { AuditoriaContrato, HistoricoStatusContrato } from "./types";

const PAGE_SIZE = 20;

/** GET .../historico-status é liberado a qualquer perfil autenticado — sem checagem de permissão aqui, igual ao resto das rotas de leitura do sistema. */
export function useHistoricoStatus(contratoId: string | undefined, page: number) {
  return useQuery({
    queryKey: ["contratos", "historico-status", contratoId, page],
    queryFn: () =>
      api.get<Paginated<HistoricoStatusContrato>>(
        `/contratos/${contratoId}/historico-status?page=${page}&pageSize=${PAGE_SIZE}`,
      ),
    enabled: !!contratoId,
  });
}

/**
 * GET .../auditoria responde 403 pra quem não é Administrador — este hook
 * não se preocupa com isso porque `AuditoriaTab` (o único lugar que chama
 * ele) só é montado quando `canViewAuditoria` já deu `true` (ver
 * contrato-detail-page.tsx): a aba inteira nem existe pra outros perfis,
 * então a query nunca dispara pra eles.
 */
export function useAuditoria(contratoId: string | undefined, page: number) {
  return useQuery({
    queryKey: ["contratos", "auditoria", contratoId, page],
    queryFn: () =>
      api.get<Paginated<AuditoriaContrato>>(`/contratos/${contratoId}/auditoria?page=${page}&pageSize=${PAGE_SIZE}`),
    enabled: !!contratoId,
  });
}
