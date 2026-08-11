import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

/**
 * Sidebar da aplicação — ainda sem links de navegação reais (chegam junto
 * com as primeiras telas de negócio, Fase 2 em diante). O logout já é
 * funcional desde a Fase 1: limpa a sessão (estado em memória + revoga a
 * sessão na API) e manda pra /login.
 */
export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-sm font-semibold">Sistema de Contratos</span>
      </div>
      <nav className="flex-1 p-2 text-sm text-muted-foreground" aria-label="Navegação principal" />
      <div className="border-t border-border p-3">
        {user && (
          <p className="mb-2 truncate text-xs text-muted-foreground" title={user.nomeCompleto}>
            {user.nomeCompleto}
          </p>
        )}
        <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={handleLogout}>
          <LogOut className="size-4" />
          Sair
        </Button>
      </div>
    </aside>
  );
}
