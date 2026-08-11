import { LogOut } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV_LINK_CLASS =
  "block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground";
const NAV_LINK_ACTIVE_CLASS = "bg-muted font-medium text-foreground";

const REFERENCIA_LINKS = [
  { to: "/referencias/especies", label: "Espécies" },
  { to: "/referencias/produtos", label: "Produtos" },
  { to: "/referencias/importadores", label: "Importadores" },
  { to: "/referencias/representantes", label: "Representantes" },
  { to: "/referencias/status-contrato", label: "Status de contrato" },
];

/** Sidebar da aplicação — navegação (Fase 2) + logout (Fase 1). */
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
      <nav className="flex-1 space-y-4 overflow-y-auto p-2" aria-label="Navegação principal">
        <NavLink to="/contratos" className={({ isActive }) => cn(NAV_LINK_CLASS, isActive && NAV_LINK_ACTIVE_CLASS)}>
          Contratos
        </NavLink>

        <div>
          <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Referências</p>
          <div className="grid gap-0.5">
            {REFERENCIA_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => cn(NAV_LINK_CLASS, isActive && NAV_LINK_ACTIVE_CLASS)}
              >
                {link.label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
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
