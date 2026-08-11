/**
 * Peças reusáveis pelos scripts de smoke test por fase
 * (smoke-test-fase2.ts, smoke-test-fase3-producao.ts, ...) — cliente HTTP,
 * asserção e o runner PASS/FAIL. Não duplicar isso em cada script novo.
 */

export interface ApiResult {
  status: number;
  json: any;
  /** Cada Set-Cookie desta resposta, nome -> valor (sem os atributos: Path, HttpOnly, ...). Vazio se não houve nenhum. */
  cookies: Record<string, string>;
  /** Os headers Set-Cookie desta resposta, crus (com atributos) — pra quem precisa checar HttpOnly/Path/SameSite, não só o valor. */
  setCookieHeaders: string[];
}

export type ApiClient = (
  method: string,
  path: string,
  opts?: {
    token?: string;
    body?: unknown;
    /**
     * Header Cookie explícito, sobrepõe o cookie jar interno pra esta
     * chamada — usado pelo smoke test da Fase 1 (cookie auth) pra reenviar
     * de propósito uma cookie já revogada/antiga (ver
     * smoke-test-fase1-cookie-auth.ts, passo 4).
     */
    cookie?: string;
  },
) => Promise<ApiResult>;

/**
 * Cliente HTTP mínimo contra uma API já no ar (fetch nativo do Node 22+).
 *
 * Mantém um "cookie jar" simples (nome -> valor) no closure: o fetch nativo
 * do Node, ao contrário de um navegador, não guarda cookies entre chamadas
 * sozinho. Introduzido na Fase 1 (cookie httpOnly pro refresh token) — toda
 * chamada reenvia automaticamente as cookies recebidas nas respostas
 * anteriores desta mesma instância de client, do jeito que um navegador
 * faria. Um Set-Cookie com valor vazio (ex.: logout limpando a cookie) some
 * do jar, não fica sendo reenviado com valor vazio.
 */
export function makeApiClient(baseUrl: string): ApiClient {
  const cookieJar = new Map<string, string>();

  return async function api(method, path, opts = {}) {
    const cookieHeader =
      opts.cookie ?? ([...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join("; ") || undefined);

    // Content-Type só quando há body de verdade — Fastify rejeita
    // "application/json" com corpo vazio (ex.: nos DELETEs sem body).
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    const setCookieHeaders = res.headers.getSetCookie();
    const cookies: Record<string, string> = {};
    for (const setCookie of setCookieHeaders) {
      const [pair] = setCookie.split(";");
      const eqIdx = pair.indexOf("=");
      const name = pair.slice(0, eqIdx).trim();
      const value = pair.slice(eqIdx + 1).trim();
      cookies[name] = value;
      if (value) {
        cookieJar.set(name, value);
      } else {
        cookieJar.delete(name);
      }
    }

    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, cookies, setCookieHeaders };
  };
}

export class SmokeAssertionError extends Error {}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SmokeAssertionError(message);
}

export interface SmokeStep {
  name: string;
  run: () => Promise<void>;
}

export interface SmokeRunResult {
  passed: number;
  failed: boolean;
}

/**
 * Roda os passos em sequência, parando no primeiro FAIL. `cleanup` roda
 * sempre (sucesso ou falha) antes de retornar — cada script de smoke test
 * só monta a lista de passos e a função de limpeza, o resto é comum.
 */
export async function runSmokeSteps(steps: SmokeStep[], cleanup: () => Promise<void>): Promise<SmokeRunResult> {
  let passed = 0;
  let failed = false;

  try {
    for (const s of steps) {
      try {
        await s.run();
        passed += 1;
        console.log(`PASS  ${s.name}`);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`FAIL  ${s.name}`);
        console.error(`      ${detail}`);
        failed = true;
        break;
      }
    }
  } finally {
    console.log("\n-- limpeza (roda sempre, sucesso ou falha) --");
    await cleanup();
    console.log("limpeza concluída.");
  }

  console.log(`\n${passed} passo(s) com PASS.`);
  console.log(failed ? "RESULTADO: FALHOU — parou no primeiro FAIL (ver acima)." : "RESULTADO: OK — todos os passos passaram.");

  return { passed, failed };
}
