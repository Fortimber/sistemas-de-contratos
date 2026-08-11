import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Rota placeholder "/" — só confirma que roteamento, Tailwind e shadcn/ui estão funcionando (Fase 0). */
export function HomePage() {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Fase 0 — fundação do frontend</CardTitle>
        <CardDescription>
          Roteamento, Tailwind e shadcn/ui no ar. Telas de negócio começam na Fase 1.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Se este cartão aparece com borda, sombra e tipografia (não o HTML cru do
        navegador), os tokens de tema do shadcn/ui estão aplicados corretamente.
      </CardContent>
    </Card>
  );
}
