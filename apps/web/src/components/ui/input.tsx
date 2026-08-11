import * as React from "react"

import { cn } from "@/lib/utils"

// forwardRef explícito (não a assinatura padrão gerada pelo shadcn CLI para
// este preset, que assume o modelo de ref-como-prop do React 19): o
// projeto está no React 18. O react-hook-form sempre inclui uma `ref` no
// objeto `field` que `<Input {...field} />` espalha (usa pra focar o campo
// automaticamente num erro de validação) — sem forwardRef aqui, o React
// avisa "Function components cannot be given refs" no console toda vez que
// Input é usado dentro de um FormField (achado real ao testar a tela de
// login). Auditoria completa dos demais componentes shadcn instalados
// (mesma causa raiz) na Fase 2 — ver README, seção "Frontend".
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
