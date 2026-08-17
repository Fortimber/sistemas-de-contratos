/**
 * Smoke test de PATCH /auth/senha — troca de senha do usuário autenticado
 * (fecha o gap pendente desde a Fase 1 do frontend, ver README).
 *
 * Cobre: senha atual errada (401 genérico, mesma filosofia do login — não
 * dá pista de qual parte errou), nova senha curta demais (400), nova senha
 * igual à atual (400), troca bem-sucedida (204 + deveTrocarSenha vira false
 * no banco), revogação de TODAS as sessões na troca — inclusive a que fez a
 * troca (refresh com o token de antes vira 401) —, e por fim login com a
 * senha nova funcionando e com a antiga não.
 *
 * Usa um usuário de teste dedicado (criado via SQL direto, mesmo padrão de
 * `smoke-test-fase2.ts` passo 9), NUNCA a conta admin seedada — achado real
 * (dolorido): a primeira versão deste script trocava e revertia a senha do
 * próprio admin, usando `SEED_ADMIN_SENHA` como valor de reversão. Isso
 * quebrou duas vezes: (1) a env var do container ficava desatualizada em
 * relação ao `.env` depois de uma edição sem recriar o container — a
 * reversão usava o valor ANTIGO, deixando a senha real do admin diferente
 * da esperada; (2) mesmo com a env var atualizada, `SEED_ADMIN_SENHA` no
 * `.env` real deste projeto é `"123456"` (6 caracteres) — menor que o
 * mínimo de 8 exigido pela própria API pra `novaSenha` —, então a
 * PRÓPRIA reversão (que também é um `PATCH /auth/senha`) tomava `400` e
 * nunca completava, deixando a senha real do admin travada no valor de
 * teste. Um usuário descartável elimina a classe inteira desse problema:
 * a limpeza é só `DELETE` (cascade em `refresh_tokens`), sem reversão
 * nenhuma pra dar errado, e a conta admin de verdade nunca é tocada.
 *
 * Uso (de dentro do container da API, com a API já rodando):
 *   docker compose exec api npm run smoke:troca-senha
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../src/lib/prisma.js";
import { makeApiClient, assert, runSmokeSteps, type SmokeStep } from "./smoke-test-helpers.js";

const API_URL = process.env.SMOKE_API_URL ?? "http://localhost:3000";
const runId = Date.now().toString(36);
const LOGIN = `smoke-troca-senha-${runId}`;
const SENHA_INICIAL = "senha-inicial-smoke-teste";
const NOVA_SENHA = "nova-senha-smoke-test-2026";
const SENHA_ERRADA = "senha-atual-errada-123";
const SENHA_CURTA = "abc123";
// Valor fixo (>= 8 chars) pro teste "novaSenha igual à senhaAtual" — não
// precisa bater com SENHA_INICIAL: o check de igualdade em senha.routes.ts
// roda ANTES do bcrypt.compare contra a senha real, então qualquer par
// igual (e >= 8 chars, senão o check de tamanho intercepta primeiro) serve.
const SENHA_IGUAL_TESTE = "senha-igual-para-teste-8chars";

// Client próprio desta suíte (cookie jar isolado, mesmo padrão da Fase 1).
const api = makeApiClient(API_URL);

async function main() {
  let usuarioId = "";
  let accessToken = "";
  let refreshTokenAntesDaTroca = "";

  const steps: SmokeStep[] = [
    {
      name: "1) Criar usuário de teste dedicado (via SQL direto) e logar",
      run: async () => {
        const organizacao = await prisma.organizacao.findFirst();
        assert(organizacao, "nenhuma organização encontrada no banco — rode o seed antes deste smoke test");

        const senhaHash = await bcrypt.hash(SENHA_INICIAL, 10);
        const usuario = await prisma.usuario.create({
          data: {
            organizacaoId: organizacao!.id,
            login: LOGIN,
            email: `${LOGIN}@example.com`,
            senhaHash,
            nomeCompleto: "Smoke Troca de Senha",
            perfilAcesso: "Operacional",
          },
        });
        usuarioId = usuario.id;

        const res = await api("POST", "/auth/login", { body: { login: LOGIN, senha: SENHA_INICIAL } });
        assert(res.status === 200, `login: esperado 200, veio ${res.status}: ${JSON.stringify(res.json)}`);
        assert(typeof res.json.accessToken === "string" && res.json.accessToken.length > 0, "accessToken ausente no login");
        assert("refreshToken" in res.cookies, "cookie refreshToken ausente no login");

        accessToken = res.json.accessToken;
        refreshTokenAntesDaTroca = res.cookies.refreshToken;
      },
    },
    {
      name: "2) PATCH /auth/senha com senhaAtual errada -> 401",
      run: async () => {
        const res = await api("PATCH", "/auth/senha", {
          token: accessToken,
          body: { senhaAtual: SENHA_ERRADA, novaSenha: NOVA_SENHA },
        });
        assert(res.status === 401, `esperado 401, veio ${res.status}: ${JSON.stringify(res.json)}`);
        assert(
          !/Postgres|ConnectorError|PrismaClient/i.test(String(res.json?.message)),
          `mensagem não deveria vazar detalhe interno (veio "${res.json?.message}")`,
        );
      },
    },
    {
      name: "3) PATCH /auth/senha com novaSenha menor que 8 caracteres -> 400",
      run: async () => {
        const res = await api("PATCH", "/auth/senha", {
          token: accessToken,
          body: { senhaAtual: SENHA_INICIAL, novaSenha: SENHA_CURTA },
        });
        assert(res.status === 400, `esperado 400, veio ${res.status}: ${JSON.stringify(res.json)}`);
        assert(/8/.test(String(res.json?.message)), `mensagem deveria citar o mínimo de 8 caracteres (veio "${res.json?.message}")`);
      },
    },
    {
      name: "4) PATCH /auth/senha com novaSenha igual à senhaAtual -> 400",
      run: async () => {
        const res = await api("PATCH", "/auth/senha", {
          token: accessToken,
          body: { senhaAtual: SENHA_IGUAL_TESTE, novaSenha: SENHA_IGUAL_TESTE },
        });
        assert(res.status === 400, `esperado 400, veio ${res.status}: ${JSON.stringify(res.json)}`);
        assert(
          /diferente/i.test(String(res.json?.message)),
          `mensagem deveria explicar que precisa ser diferente da atual (veio "${res.json?.message}")`,
        );
      },
    },
    {
      name: "5) PATCH /auth/senha correto -> 204, deveTrocarSenha vira false no banco",
      run: async () => {
        const res = await api("PATCH", "/auth/senha", {
          token: accessToken,
          body: { senhaAtual: SENHA_INICIAL, novaSenha: NOVA_SENHA },
        });
        assert(res.status === 204, `esperado 204, veio ${res.status}: ${JSON.stringify(res.json)}`);

        const rawHeader = res.setCookieHeaders.find((h) => h.startsWith("refreshToken="));
        assert(rawHeader, "troca de senha deveria mandar um Set-Cookie limpando refreshToken");
        assert(/refreshToken=;/.test(rawHeader!), `cookie deveria vir com valor vazio (header: "${rawHeader}")`);
        assert(/Max-Age=0/i.test(rawHeader!), `cookie deveria vir com Max-Age=0 (header: "${rawHeader}")`);

        const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
        assert(usuario?.deveTrocarSenha === false, "deveTrocarSenha deveria ser false no banco após a troca");
      },
    },
    {
      name: "6) Tentar /auth/refresh com o refreshToken de ANTES da troca -> 401 (todas as sessões revogadas)",
      run: async () => {
        // Cookie jar de `api` já tem a cookie vazia deixada pelo passo 5 —
        // reenvia explicitamente o valor de antes da troca, como alguém com
        // uma sessão aberta em outro dispositivo tentaria depois da troca.
        const res = await api("POST", "/auth/refresh", { cookie: `refreshToken=${refreshTokenAntesDaTroca}` });
        assert(res.status === 401, `esperado 401, veio ${res.status}: ${JSON.stringify(res.json)}`);
      },
    },
    {
      name: "7) Login com a senha NOVA -> sucesso",
      run: async () => {
        const res = await api("POST", "/auth/login", { body: { login: LOGIN, senha: NOVA_SENHA } });
        assert(res.status === 200, `esperado 200, veio ${res.status}: ${JSON.stringify(res.json)}`);
        assert(typeof res.json.accessToken === "string" && res.json.accessToken.length > 0, "accessToken ausente no login com a senha nova");
      },
    },
    {
      name: "8) Login com a senha ANTIGA -> 401",
      run: async () => {
        const res = await api("POST", "/auth/login", { body: { login: LOGIN, senha: SENHA_INICIAL } });
        assert(res.status === 401, `esperado 401, veio ${res.status}: ${JSON.stringify(res.json)}`);
      },
    },
  ];

  const result = await runSmokeSteps(steps, async () => {
    // Usuário descartável — só apagar. onDelete: Cascade em
    // RefreshToken.usuario (schema.prisma) limpa as sessões junto, sem
    // precisar de reversão de senha nenhuma (ver comentário no topo do
    // arquivo sobre por que isso importa).
    if (usuarioId) await prisma.usuario.deleteMany({ where: { id: usuarioId } });
  });

  await prisma.$disconnect();
  process.exitCode = result.failed ? 1 : 0;
}

main().catch((err) => {
  console.error("Erro inesperado no runner do smoke test:", err);
  process.exitCode = 1;
});
