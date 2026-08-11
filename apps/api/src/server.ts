import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { prisma, runtimePrisma } from "./lib/prisma.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { protectedContext } from "./plugins/protected-context.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
});

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
