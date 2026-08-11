import { Outlet } from "react-router-dom";
import { Sidebar } from "./sidebar";

/** Layout base de toda rota autenticada: sidebar fixa + área de conteúdo rolável. */
export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
