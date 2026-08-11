import { Button } from "@/components/ui/button";
import type { PaginationMeta } from "@/lib/pagination";

interface PaginationControlsProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}

/** Anterior/Próxima + "Página X de Y" — reusado pelas listagens paginadas (referências e contratos). */
export function PaginationControls({ meta, onPageChange }: PaginationControlsProps) {
  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-sm text-muted-foreground">
        Página {meta.page} de {meta.totalPages} ({meta.total} {meta.total === 1 ? "registro" : "registros"})
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
