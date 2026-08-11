import { Loader2 } from "lucide-react";

/** Estado de carregamento de tela cheia — usado enquanto a tentativa de /auth/refresh no boot da aplicação está pendente (ver lib/auth-context.tsx e routes/route-guards.tsx). */
export function FullPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
