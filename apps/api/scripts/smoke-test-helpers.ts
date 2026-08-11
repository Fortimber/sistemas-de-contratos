/**
 * Peças reusáveis pelos scripts de smoke test por fase
 * (smoke-test-fase2.ts, smoke-test-fase3-producao.ts, ...) — cliente HTTP,
 * asserção e o runner PASS/FAIL. Não duplicar isso em cada script novo.
 */

export interface ApiResult {
  status: number;
  json: any;
}

export type ApiClient = (method: string, path: string, opts?: { token?: string; body?: unknown }) => Promise<ApiResult>;

/** Cliente HTTP mínimo contra uma API já no ar (fetch nativo do Node 22+). */
export function makeApiClient(baseUrl: string): ApiClient {
  return async function api(method, path, opts = {}) {
    // Content-Type só quando há body de verdade — Fastify rejeita
    // "application/json" com corpo vazio (ex.: nos DELETEs sem body).
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
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
