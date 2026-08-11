import { QueryClient } from "@tanstack/react-query";

/** Instância única, compartilhada pela aplicação inteira via QueryClientProvider em main.tsx. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Evita refetch agressivo em cada foco de janela — dado de contrato
      // não muda tão rápido a ponto de justificar isso por padrão; telas
      // específicas que precisarem de refetch mais agressivo sobrescrevem
      // por query.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
