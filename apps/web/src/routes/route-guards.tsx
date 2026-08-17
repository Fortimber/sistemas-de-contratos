import { Navigate, Outlet, useLocation } from "react-router-dom";
import { FullPageLoading } from "@/components/full-page-loading";
import { useAuth } from "@/lib/auth-context";

/** Única rota que um usuário com deveTrocarSenha=true pode ver além do redirect abaixo. */
const TROCAR_SENHA_PATH = "/trocar-senha";

/**
 * Guarda de rota protegida: sem usuário autenticado (depois que a tentativa
 * de /auth/refresh no boot resolver), manda pra /login. Enquanto o boot
 * ainda está resolvendo (`status === "loading"`), mostra um carregamento em
 * vez do conteúdo ou de um redirect prematuro — evita a tela de login
 * piscar antes da sessão (via cookie) terminar de ser confirmada.
 *
 * Troca de senha obrigatória: se o usuário autenticado tem
 * `deveTrocarSenha === true` (definido no primeiro login/seed, limpo só por
 * PATCH /auth/senha), toda rota protegida redireciona pra /trocar-senha até
 * a troca acontecer — nenhuma tela de negócio fica acessível nesse meio
 * tempo. Não precisa de exceção pro logout: o botão de sair vive na sidebar
 * (fora do <Outlet /> que este guard controla, ver app-layout.tsx), então
 * continua clicável mesmo com o conteúdo preso em /trocar-senha.
 */
export function ProtectedRoute() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <FullPageLoading />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  if (user?.deveTrocarSenha && location.pathname !== TROCAR_SENHA_PATH) {
    return <Navigate to={TROCAR_SENHA_PATH} replace />;
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
