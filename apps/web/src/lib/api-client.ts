/**
 * Cliente HTTP central da aplicação — todo acesso à API passa por aqui, não
 * por fetch solto em componentes. Duas coisas que ele garante sozinho, pra
 * não precisar repetir em cada chamada:
 *
 * 1. `credentials: "include"` sempre — obrigatório pro navegador enviar/
 *    receber a cookie httpOnly do refresh token (ver Fase 1 da API,
 *    apps/api/src/lib/refresh-cookie.ts). Sem isso, /auth/refresh nunca
 *    enxerga a cookie.
 * 2. Renovação automática de sessão: numa resposta 401, tenta UM
 *    /auth/refresh (usa a cookie) e repete a chamada original com o token
 *    novo; se o refresh também falhar, a sessão realmente acabou — manda
 *    pra tela de login.
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/** Rota de login — usada quando a sessão expira e não há como renovar (a tela em si é da Fase 1 do frontend, ainda não existe). */
export const LOGIN_PATH = "/login";

// Access token guardado só em memória (nunca localStorage/sessionStorage) —
// um XSS que rode JS na página já tem acesso a qualquer coisa em memória de
// qualquer forma, mas pelo menos o token não sobrevive a um reload nem fica
// disponível pra qualquer script de terceiro que só liste storage. Quem
// sustenta a sessão entre reloads é o refresh token, na cookie httpOnly.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(extractMessage(body) ?? `Erro ${status} na requisição à API.`);
    this.name = "ApiError";
  }
}

function extractMessage(body: unknown): string | undefined {
  if (body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string") {
    return (body as { message: string }).message;
  }
  return undefined;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

async function rawFetch(path: string, options: RequestOptions, token: string | null): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

async function parseBody(res: Response): Promise<unknown> {
  // Content-Type só quando há body de verdade — respostas 204 (ex.: logout)
  // não têm corpo, e `res.json()` direto quebraria nesse caso.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Evita disparar um /auth/refresh por requisição em paralelo quando várias
// chamadas tomam 401 ao mesmo tempo (ex.: várias queries do TanStack Query
// disparadas juntas) — todas esperam a MESMA promise de refresh, só uma
// chamada de rede acontece.
let refreshInFlight: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
        if (!res.ok) return false;
        const json = (await parseBody(res)) as { accessToken?: string } | null;
        if (!json?.accessToken) return false;
        setAccessToken(json.accessToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function redirectToLogin(): void {
  if (typeof window !== "undefined" && window.location.pathname !== LOGIN_PATH) {
    window.location.assign(LOGIN_PATH);
  }
}

/**
 * Requisição autenticada à API. `/auth/login` e `/auth/refresh` nunca
 * disparam o fluxo de retry (um 401 ali É a resposta, não uma sessão
 * expirada no meio de outra chamada).
 */
export async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const isAuthEndpoint = path.startsWith("/auth/login") || path.startsWith("/auth/refresh");

  let res = await rawFetch(path, options, getAccessToken());

  if (res.status === 401 && !isAuthEndpoint) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      setAccessToken(null);
      redirectToLogin();
      throw new ApiError(401, await parseBody(res));
    }
    res = await rawFetch(path, options, getAccessToken());
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseBody(res));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await parseBody(res)) as T;
}

export const api = {
  get: <T = unknown>(path: string) => apiRequest<T>(path, { method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body }),
  patch: <T = unknown>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  put: <T = unknown>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PUT", body }),
  delete: <T = unknown>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};
