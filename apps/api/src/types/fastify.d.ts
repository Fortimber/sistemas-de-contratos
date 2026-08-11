import type { PerfilAcesso } from "@prisma/client";
import type { scopedPrisma } from "../middleware/tenant-scoping.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      organizacaoId: string;
      login: string;
      perfilAcesso: PerfilAcesso;
    };
    db: ReturnType<typeof scopedPrisma>;
    /** Transação por-requisição que sustenta o GUC de RLS — ver middleware/tenant-scoping.ts. */
    tenantTx?: {
      release: () => void;
      settled: Promise<void>;
    };
  }
}
