/**
 * Sidebar da aplicação — só o esqueleto visual por enquanto (sem links de
 * navegação reais). Os links chegam junto com as primeiras telas de negócio
 * (Fase 1 em diante); esta fase só prova que o layout com sidebar + área de
 * conteúdo renderiza com o estilo do Tailwind/shadcn aplicado.
 */
export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="text-sm font-semibold">Sistema de Contratos</span>
      </div>
      <nav className="flex-1 p-2 text-sm text-muted-foreground" aria-label="Navegação principal" />
    </aside>
  );
}
