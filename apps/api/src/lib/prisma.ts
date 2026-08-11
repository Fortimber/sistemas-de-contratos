import { PrismaClient } from "@prisma/client";

/**
 * Client "administrativo" — conecta via DATABASE_URL (role "contratos",
 * superuser bootstrap do container Postgres, o mesmo usado pelas
 * migrations). Ignora RLS incondicionalmente, então só deve ser usado por
 * operações que inerentemente precisam rodar ANTES de haver contexto de
 * tenant — ex.: auth.service.ts localizando o usuário pelo login, antes de
 * saber a que organização ele pertence. Nunca usar este client para servir
 * dado de negócio tenant-scoped; para isso, ver `runtimePrisma`.
 */
export const prisma = new PrismaClient();

/**
 * Client de runtime da API — conecta via APP_DATABASE_URL, um role Postgres
 * sem SUPERUSER/BYPASSRLS (ver migration add_row_level_security). É a base
 * usada por `scopedPrisma()` / `request.db` (middleware/tenant-scoping.ts):
 * só assim a Row-Level Security do Postgres tem efeito de verdade — o role
 * de DATABASE_URL ignora RLS mesmo com FORCE ROW LEVEL SECURITY habilitado.
 */
export const runtimePrisma = new PrismaClient({
  datasources: { db: { url: process.env.APP_DATABASE_URL } },
});
