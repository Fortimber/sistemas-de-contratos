import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, refreshSession, setAccessToken } from "@/lib/api-client";

export type PerfilAcesso = "Administrador" | "Comercial" | "Operacional" | "Financeiro" | "Ambiental";

export interface Usuario {
  id: string;
  organizacaoId: string;
  login: string;
  email: string;
  nomeCompleto: string;
  perfilAcesso: PerfilAcesso;
  deveTrocarSenha: boolean;
}

interface AuthResponse {
  accessToken: string;
  usuario: Usuario;
}

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: Usuario | null;
  login: (loginInput: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Dono do estado de sessão da aplicação inteira. Resolve o problema central
 * da Fase 0: o accessToken só existe em memória (nunca localStorage), então
 * some a cada F5. Quem sustenta a sessão entre reloads é o refresh token, na
 * cookie httpOnly (sobrevive ao F5) — por isso, ao montar, tenta UM
 * POST /auth/refresh antes de decidir "logado" ou "não logado". Enquanto
 * isso não resolve, `status` fica "loading" — quem consome isso (ver
 * routes/route-guards.tsx) deve mostrar um carregamento simples em vez de
 * piscar a tela de login por um instante.
 *
 * Usa `refreshSession` (api-client.ts) — não `api.post("/auth/refresh")`
 * direto — de propósito: `refreshSession` dedupe chamadas concorrentes.
 * Sem isso (achado real): o StrictMode do React invoca este efeito duas
 * vezes seguidas em dev, disparando dois /auth/refresh com a MESMA cookie
 * antiga; a API rotaciona a cada uso e trata reuso de token já revogado
 * como roubo, derrubando TODAS as sessões do usuário — a segunda chamada
 * matava a sessão que a primeira acabara de criar.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<Usuario | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await refreshSession();
      if (cancelled) return;
      if (res) {
        setUser(res.usuario as Usuario);
        setStatus("authenticated");
      } else {
        // Sem cookie válida (nunca logou, ou sessão expirada/revogada) —
        // estado normal, não é erro pra logar/tratar. Só "não autenticado".
        setUser(null);
        setStatus("unauthenticated");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function login(loginInput: string, senha: string): Promise<void> {
    const res = await api.post<AuthResponse>("/auth/login", { login: loginInput, senha });
    setAccessToken(res.accessToken);
    setUser(res.usuario);
    setStatus("authenticated");
  }

  async function logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      // Idempotente do lado da UI: mesmo se a chamada falhar (ex.: sessão
      // já tinha caído do lado do servidor), o estado local abaixo sempre
      // limpa — o usuário não fica "preso" logado na interface.
      if (!(err instanceof ApiError)) throw err;
    }
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }

  return <AuthContext.Provider value={{ status, user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth precisa ser usado dentro de <AuthProvider>.");
  }
  return ctx;
}
