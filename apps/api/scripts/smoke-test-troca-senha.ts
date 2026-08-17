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
 * Só este script muda de verdade a senha do admin seedado — por isso, ao
 * contrário dos outros smoke tests (que não geram lixo porque só criam
 * dado próprio), a limpeza aqui PRECISA reverter a senha pro valor original
 * (`SEED_ADMIN_SENHA`), senão todo smoke test seguinte que faz login como
 * admin (todos eles) quebraria. Roda sempre, mesmo se algum passo falhar
 * antes da troca acontecer (`runSmokeSteps` garante isso).
 *
 * Uso (de dentro do container da API, com a API já rodando):
 *   docker compose exec api npm run smoke:troca-senha
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { makeApiClient, assert, runSmokeSteps, type SmokeStep } from "./smoke-test-helpers.js";

const API_URL = process.env.SMOKE_API_URL ?? "http://localhost:3000";
const ADMIN_LOGIN = process.env.SEED_ADMIN_LOGIN ?? "admin";
const ADMIN_SENHA = process.env.SEED_ADMIN_SENHA ?? "troque-esta-senha";
const NOVA_SENHA = "nova-senha-smoke-test-2026";
const SENHA_ERRADA = "senha-atual-errada-123";
const SENHA_CURTA = "abc123";

// Client próprio desta suíte (cookie jar isolado, mesmo padrão da Fase 1).
const api = makeApiClient(API_URL);

async function main() {
  let adminId = "";
  let deveTrocarSenhaOriginal = false;
  let accessToken = "";
  let refreshTokenAntesDaTroca = "";

  const steps: SmokeStep[] = [
    {
      name: "1) Login com a senha atual do admin",
      run: async () => {
        const res = await api("POST", "/auth/login", { body: { login: ADMIN_LOGIN, senha: ADMIN_SENHA } });
        assert(res.status === 200, `login: esperado 200, veio ${res.status}: ${JSON.stringify(res.json)}`);
        assert(typeof res.json.accessToken === "string" && res.json.accessToken.length > 0, "accessToken ausente no login");
        assert("refreshToken" in res.cookies, "cookie refreshToken ausente no login");

        adminId = res.json.usuario.id;
        deveTrocarSenhaOriginal = res.json.usuario.deveTrocarSenha;
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
          body: { senhaAtual: ADMIN_SENHA, novaSenha: SENHA_CURTA },
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
          body: { senhaAtual: ADMIN_SENHA, novaSenha: ADMIN_SENHA },
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
          body: { senhaAtual: ADMIN_SENHA, novaSenha: NOVA_SENHA },
        });
        assert(res.status === 204, `esperado 204, veio ${res.status}: ${JSON.stringify(res.json)}`);

        const rawHeader = res.setCookieHeaders.find((h) => h.startsWith("refreshToken="));
        assert(rawHeader, "troca de senha deveria mandar um Set-Cookie limpando refreshToken");
        assert(/refreshToken=;/.test(rawHeader!), `cookie deveria vir com valor vazio (header: "${rawHeader}")`);
        assert(/Max-Age=0/i.test(rawHeader!), `cookie deveria vir com Max-Age=0 (header: "${rawHeader}")`);

        const usuario = await prisma.usuario.findUnique({ where: { id: adminId } });
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
        const res = await api("POST", "/auth/login", { body: { login: ADMIN_LOGIN, senha: NOVA_SENHA } });
        assert(res.status === 200, `esperado 200, veio ${res.status}: ${JSON.stringify(res.json)}`);
        assert(typeof res.json.accessToken === "string" && res.json.accessToken.length > 0, "accessToken ausente no login com a senha nova");
      },
    },
    {
      name: "8) Login com a senha ANTIGA -> 401",
      run: async () => {
        const res = await api("POST", "/auth/login", { body: { login: ADMIN_LOGIN, senha: ADMIN_SENHA } });
        assert(res.status === 401, `esperado 401, veio ${res.status}: ${JSON.stringify(res.json)}`);
      },
    },
  ];

  const result = await runSmokeSteps(steps, async () => {
    // Reverte a senha do admin pro valor original (SEED_ADMIN_SENHA) — se o
    // passo 5 não chegou a rodar (teste falhou antes), o login abaixo com
    // NOVA_SENHA simplesmente falha e não há nada a reverter.
    const loginComNova = await api("POST", "/auth/login", { body: { login: ADMIN_LOGIN, senha: NOVA_SENHA } });
    if (loginComNova.status !== 200) {
      return;
    }

    const tokenTemp = loginComNova.json.accessToken as string;
    const revert = await api("PATCH", "/auth/senha", {
      token: tokenTemp,
      body: { senhaAtual: NOVA_SENHA, novaSenha: ADMIN_SENHA },
    });
    if (revert.status !== 204) {
      console.error(
        `AVISO: falha ao reverter a senha do admin para o valor original (status ${revert.status}): ${JSON.stringify(revert.json)}`,
      );
      return;
    }

    // A reversão acima também zera deveTrocarSenha — restaura o valor que
    // existia antes deste script rodar, pra não deixar rastro nenhum.
    if (deveTrocarSenhaOriginal && adminId) {
      await prisma.usuario.update({ where: { id: adminId }, data: { deveTrocarSenha: true } });
    }
  });

  await prisma.$disconnect();
  process.exitCode = result.failed ? 1 : 0;
}

main().catch((err) => {
  console.error("Erro inesperado no runner do smoke test:", err);
  process.exitCode = 1;
});
