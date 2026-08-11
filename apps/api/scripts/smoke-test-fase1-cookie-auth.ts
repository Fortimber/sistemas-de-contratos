/**
 * Smoke test da Fase 1 — autenticação com refresh token em cookie httpOnly
 * (POST /auth/login, /auth/refresh, /auth/logout). Até agora essa fase só
 * tinha sido validada manualmente com curl; este é o primeiro script
 * automatizado dela.
 *
 * Primeiro smoke test que lida com cookie: o fetch nativo do Node não
 * reenvia cookie entre chamadas sozinho como um navegador faria — o "cookie
 * jar" que faz isso vive em `makeApiClient` (scripts/smoke-test-helpers.ts),
 * reutilizado por todos os scripts, não só por este.
 *
 * Uso (de dentro do container da API, com a API já rodando):
 *   docker compose exec api npm run smoke:fase1-cookie-auth
 *
 * Reusável como teste de regressão: para no primeiro FAIL, mas a limpeza
 * roda sempre (sucesso ou falha) — nenhum estado de teste fica no banco.
 * Depois deste script, reconfirme também os smoke tests das fases
 * seguintes (fase2, fase3 x4, fase4) — todos fazem login internamente, e
 * agora dependem de extrair só accessToken do JSON (refreshToken saiu do
 * corpo da resposta).
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { makeApiClient, assert, runSmokeSteps, type SmokeStep } from "./smoke-test-helpers.js";

const API_URL = process.env.SMOKE_API_URL ?? "http://localhost:3000";
const ADMIN_LOGIN = process.env.SEED_ADMIN_LOGIN ?? "admin";
const ADMIN_SENHA = process.env.SEED_ADMIN_SENHA ?? "troque-esta-senha";

// Client próprio desta suíte (cookie jar isolado) — os smoke tests das
// outras fases não devem enxergar cookie nenhuma vinda daqui.
const api = makeApiClient(API_URL);

async function main() {
  let accessToken1 = "";
  let accessToken2 = "";
  let refreshTokenAposLogin = "";
  let refreshTokenAposRefresh = "";

  const steps: SmokeStep[] = [
    {
      name: "1) Login -> accessToken no JSON, SEM refreshToken no JSON, cookie refreshToken (httpOnly, path=/auth)",
      run: async () => {
        const res = await api("POST", "/auth/login", { body: { login: ADMIN_LOGIN, senha: ADMIN_SENHA } });
        assert(res.status === 200, `login: esperado 200, veio ${res.status}: ${JSON.stringify(res.json)}`);

        assert(typeof res.json.accessToken === "string" && res.json.accessToken.length > 0, "accessToken ausente ou vazio no JSON");
        assert(!("refreshToken" in res.json), "refreshToken NÃO deveria estar no corpo JSON da resposta de login");
        assert(res.json.usuario?.login === ADMIN_LOGIN, "usuario.login não bateu no JSON de login");

        assert("refreshToken" in res.cookies, "cookie refreshToken ausente na resposta de login");
        assert(res.cookies.refreshToken.length > 0, "cookie refreshToken veio vazia");

        const rawHeader = res.setCookieHeaders.find((h) => h.startsWith("refreshToken="));
        assert(rawHeader, "header Set-Cookie de refreshToken ausente");
        assert(/HttpOnly/i.test(rawHeader!), `cookie refreshToken deveria ser HttpOnly (header: "${rawHeader}")`);
        assert(/Path=\/auth/i.test(rawHeader!), `cookie refreshToken deveria ter Path=/auth (header: "${rawHeader}")`);

        accessToken1 = res.json.accessToken;
        refreshTokenAposLogin = res.cookies.refreshToken;
      },
    },
    {
      name: "2) POST /auth/refresh usando a cookie capturada -> novo accessToken, nova cookie (rotação)",
      run: async () => {
        // Sem body nenhum — o cookie jar de `api` já carrega a cookie do passo 1.
        const res = await api("POST", "/auth/refresh");
        assert(res.status === 200, `refresh: esperado 200, veio ${res.status}: ${JSON.stringify(res.json)}`);

        assert(typeof res.json.accessToken === "string" && res.json.accessToken.length > 0, "accessToken ausente ou vazio no JSON do refresh");
        assert(!("refreshToken" in res.json), "refreshToken NÃO deveria estar no corpo JSON da resposta de refresh");
        // Não compara accessToken1 com o novo por igualdade: o payload do
        // access token (sub/organizacaoId/login/perfilAcesso + iat em
        // segundos) pode ser byte-idêntico se login e refresh caírem no
        // mesmo segundo — não é bug, é determinismo de assinatura JWT. A
        // prova real de rotação é o refreshToken (jti sempre novo via
        // randomUUID), checada abaixo.

        assert("refreshToken" in res.cookies, "cookie refreshToken ausente na resposta de refresh");
        assert(
          res.cookies.refreshToken !== refreshTokenAposLogin,
          "cookie refreshToken deveria ter rotacionado (valor novo), veio igual ao anterior",
        );

        accessToken2 = res.json.accessToken;
        refreshTokenAposRefresh = res.cookies.refreshToken;
      },
    },
    {
      name: "3) POST /auth/logout -> 204, cookie refreshToken limpa na resposta",
      run: async () => {
        // logout está no contexto protegido: exige access token válido.
        const res = await api("POST", "/auth/logout", { token: accessToken2 });
        assert(res.status === 204, `logout: esperado 204, veio ${res.status}: ${JSON.stringify(res.json)}`);

        const rawHeader = res.setCookieHeaders.find((h) => h.startsWith("refreshToken="));
        assert(rawHeader, "logout deveria mandar um Set-Cookie limpando refreshToken");
        assert(/refreshToken=;/.test(rawHeader!), `cookie deveria vir com valor vazio no logout (header: "${rawHeader}")`);
        assert(/Max-Age=0/i.test(rawHeader!), `cookie deveria vir com Max-Age=0 no logout (header: "${rawHeader}")`);
      },
    },
    {
      name: "4) POST /auth/refresh depois do logout, reenviando a MESMA cookie antiga -> 401",
      run: async () => {
        // O cookie jar já descartou a cookie (limpa no passo 3) — reenvia
        // explicitamente o valor antigo capturado no passo 2, como um
        // atacante que roubou a cookie antes do logout tentaria.
        const res = await api("POST", "/auth/refresh", { cookie: `refreshToken=${refreshTokenAposRefresh}` });
        assert(res.status === 401, `refresh com cookie revogada: esperado 401, veio ${res.status}: ${JSON.stringify(res.json)}`);
      },
    },
    {
      name: "5) POST /auth/refresh SEM cookie nenhuma -> 401",
      run: async () => {
        // Cookie jar de `api` está vazio desde o logout (passo 3); nenhuma
        // cookie explícita é passada aqui.
        const res = await api("POST", "/auth/refresh");
        assert(res.status === 401, `refresh sem cookie: esperado 401, veio ${res.status}: ${JSON.stringify(res.json)}`);
      },
    },
  ];

  const result = await runSmokeSteps(steps, async () => {
    // Nenhum estado próprio criado (só sessões em refresh_tokens, já
    // revogadas pelo próprio fluxo) — mesmo padrão dos outros smoke tests,
    // que também não limpam as linhas de refresh_tokens geradas pelo login.
  });

  await prisma.$disconnect();
  process.exitCode = result.failed ? 1 : 0;
}

main().catch((err) => {
  console.error("Erro inesperado no runner do smoke test:", err);
  process.exitCode = 1;
});
