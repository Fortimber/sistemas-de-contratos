import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { prisma, runtimePrisma } from "./lib/prisma.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { protectedContext } from "./plugins/protected-context.js";

const app = Fastify({ logger: true });

// credentials:true é obrigatório pro navegador aceitar a cookie httpOnly do
// refresh token (Fase 1) em requisições cross-origin (API e frontend em
// portas diferentes) — e exige origin explícita: a combinação
// credentials:true + origin:"*" é rejeitada pelo próprio navegador.
await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  credentials: true,
});

await app.register(cookie);

app.get("/health", async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ok" };
});

await app.register(authRoutes, { prefix: "/auth" });
await app.register(protectedContext);

const port = Number(process.env.API_PORT ?? 3000);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

async function shutdown() {
  await prisma.$disconnect();
  await runtimePrisma.$disconnect();
  await app.close();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
