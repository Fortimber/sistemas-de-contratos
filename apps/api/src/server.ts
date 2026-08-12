import "dotenv/config";
import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { prisma, runtimePrisma } from "./lib/prisma.js";
import { isPostgresDataError } from "./lib/prisma-errors.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { protectedContext } from "./plugins/protected-context.js";

const app = Fastify({ logger: true });

/**
 * Formata erro de validação de schema (Ajv) em português — sem isso, o
 * Fastify usa a mensagem padrão do Ajv em inglês ("body/comissaoPct must be
 * <= 100"). Cobre só as keywords usadas nos schemas desta API; qualquer
 * outra cai no fallback genérico (ainda em português, só menos específica).
 */
app.setSchemaErrorFormatter((errors, dataVar) => {
  const first = errors[0];
  const campo = first.instancePath ? first.instancePath.replace(/^\//, "") : (first.params as { missingProperty?: string }).missingProperty;

  let mensagem: string;
  switch (first.keyword) {
    case "minimum":
      mensagem = `O campo "${campo}" precisa ser maior ou igual a ${(first.params as { limit: number }).limit}.`;
      break;
    case "maximum":
      mensagem = `O campo "${campo}" precisa ser menor ou igual a ${(first.params as { limit: number }).limit}.`;
      break;
    case "exclusiveMinimum":
      mensagem = `O campo "${campo}" precisa ser maior que ${(first.params as { limit: number }).limit}.`;
      break;
    case "exclusiveMaximum":
      mensagem = `O campo "${campo}" precisa ser menor que ${(first.params as { limit: number }).limit}.`;
      break;
    case "required":
      mensagem = `O campo "${(first.params as { missingProperty: string }).missingProperty}" é obrigatório.`;
      break;
    case "type":
      mensagem = `O campo "${campo}" tem um tipo de dado inválido.`;
      break;
    case "enum":
      mensagem = `O campo "${campo}" contém um valor não permitido.`;
      break;
    case "minLength":
      mensagem = `O campo "${campo}" não pode ficar vazio.`;
      break;
    case "additionalProperties":
      mensagem = `Campo não reconhecido: "${(first.params as { additionalProperty: string }).additionalProperty}".`;
      break;
    case "format":
      mensagem = `O campo "${campo}" está num formato inválido.`;
      break;
    default:
      mensagem = `Dado inválido em "${dataVar}${first.instancePath}".`;
  }

  return new Error(mensagem);
});

/**
 * Error handler global — nenhum erro não tratado explicitamente por uma
 * rota (`try/catch` + `reply.code(...).send(...)`) deve vazar detalhe
 * interno (mensagem crua do Postgres/Prisma, stack, caminho de arquivo do
 * servidor) pra resposta HTTP. Achado real: `comissaoPct: 5000` sem
 * validação de faixa estourava `Decimal(5,2)` no Postgres e a resposta
 * devolvia a mensagem de erro do Prisma inteira, caminho de arquivo do
 * servidor incluído — porque não existia nenhum `setErrorHandler` aqui,
 * então o Fastify caía no handler padrão dele, que serializa `error.message`
 * sem filtrar.
 *
 * Erro de validação de schema (`error.validation`, formatado acima em
 * português) é a ÚNICA categoria com mensagem específica repassada ao
 * cliente — é sempre erro do cliente (corpo malformado), nunca informação
 * sensível do servidor. Qualquer outra coisa — erro conhecido do Prisma
 * sem tratamento explícito na rota (`PrismaClientKnownRequestError` com um
 * código além de P2002/P2003), erro cru do Postgres sem mapeamento
 * (`PrismaClientUnknownRequestError`, caso do overflow), ou qualquer
 * exceção JS não prevista — vira sempre o MESMO 500 genérico. O erro real
 * completo vai pro log do servidor (`request.log.error`, nunca pro corpo da
 * resposta) — `isPostgresDataError` só marca esse log de forma
 * diferenciada pra facilitar diagnóstico depois, não muda a resposta.
 */
app.setErrorHandler<FastifyError>((error, request, reply) => {
  if (error.validation) {
    return reply.code(error.statusCode ?? 400).send({ message: error.message });
  }

  request.log.error(
    { err: error, dadoDeValidacao: isPostgresDataError(error) },
    "Erro não tratado explicitamente pela rota",
  );
  return reply.code(500).send({ message: "Erro interno, tente novamente ou contate o suporte." });
});

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
