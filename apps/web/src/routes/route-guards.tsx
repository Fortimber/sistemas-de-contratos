import { Navigate, Outlet } from "react-router-dom";
import { FullPageLoading } from "@/components/full-page-loading";
import { useAuth } from "@/lib/auth-context";

/**
 * Guarda de rota protegida: sem usuário autenticado (depois que a tentativa
 * de /auth/refresh no boot resolver), manda pra /login. Enquanto o boot
 * ainda está resolvendo (`status === "loading"`), mostra um carregamento em
 * vez do conteúdo ou de um redirect prematuro — evita a tela de login
 * piscar antes da sessão (via cookie) terminar de ser confirmada.
 */
export function ProtectedRoute() {
  const { status } = useAuth();

  if (status === "loading") {
    return <FullPageLoading />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

/**
 * Espelho do ProtectedRoute: se já está autenticado, não faz sentido ver a
 * tela de login — redireciona pra "/".
 */
export function PublicOnlyRoute() {
  const { status } = useAuth();

  if (status === "loading") {
    return <FullPageLoading />;
  }

  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
