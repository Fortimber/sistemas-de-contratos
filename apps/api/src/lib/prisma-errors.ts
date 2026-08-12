import { Prisma } from "@prisma/client";

/** P2002: violação de constraint UNIQUE (ex.: numero_contrato duplicado na organização). */
export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** P2003: violação de FK (ex.: DELETE de um registro ainda referenciado por outro). */
export function isForeignKeyConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003";
}

/**
 * Erro cru do Postgres que o Prisma não conseguiu mapear pra um código
 * próprio dele (`P2xxx`) — chega como `PrismaClientUnknownRequestError`,
 * cuja `.message` embute o erro de conexão inteiro (stack de query, path de
 * arquivo, o `ConnectorError` do driver) em texto solto, sem um campo
 * estruturado equivalente a `.code` (diferente de `PrismaClientKnownRequestError`).
 * O SQLSTATE cru do Postgres (ex.: `22003` = numeric field overflow —
 * classe `22` = "data exception", violação de dado, não falha de servidor)
 * só existe dentro dessa string.
 *
 * Achado real: um `comissaoPct: 5000` sem validação de faixa chegava direto
 * no Postgres (`Decimal(5,2)`) e estourava com esse erro — a resposta HTTP
 * vazava a mensagem inteira (caminho de arquivo do servidor incluído) pro
 * cliente, porque não existia `setErrorHandler` nenhum (ver server.ts).
 * `isPostgresDataError` não muda a resposta que sai pro cliente — isso já é
 * genérico pra QUALQUER erro não tratado explicitamente na rota (500
 * genérico, ver server.ts) — serve só pra marcar o log do servidor de forma
 * diferenciada ("erro de dado", não "bug desconhecido"), útil pra
 * diagnóstico depois.
 */
export function isPostgresDataError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientUnknownRequestError)) return false;
  return /code:\s*"22\d{3}"/.test(err.message);
}
