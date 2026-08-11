import { Prisma } from "@prisma/client";

/** P2002: violação de constraint UNIQUE (ex.: numero_contrato duplicado na organização). */
export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** P2003: violação de FK (ex.: DELETE de um registro ainda referenciado por outro). */
export function isForeignKeyConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003";
}
