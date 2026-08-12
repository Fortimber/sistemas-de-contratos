import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// forwardRef explícito — AO CONTRÁRIO de Select (Root)/Dialog (Root) em
// select.tsx/dialog.tsx (que não renderizam nó DOM próprio, só contexto),
// Tabs.Root do Radix real renderiza um `<div>` de verdade internamente via
// forwardRef (conferido no pacote instalado,
// apps/web/node_modules/@radix-ui/react-tabs: `Primitive.div` com
// `ref: forwardedRef`) — teria o mesmo bug de "Function components cannot
// be given refs" que Input teve na Fase 1 se algo aqui passasse a
// encaminhar ref (ex.: um futuro `asChild`), mesma razão de TabsList/
// TabsTrigger/TabsContent abaixo.
const Tabs = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Root>,
  React.ComponentProps<typeof TabsPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <TabsPrimitive.Root
      ref={ref}
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  )
})
Tabs.displayName = TabsPrimitive.Root.displayName

// List/Trigger/Content usam forwardRef explícito — mesmo motivo do fix em
// Input/Dialog/Button/Card/Checkbox/Label/Select/Table/Form: preset
// radix-nova assume o modelo de ref-como-prop do React 19, projeto está no
// React 18.
const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentProps<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  return (
    <TabsPrimitive.List
      ref={ref}
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

// data-[state=active] (não `data-active:`, presente em outros componentes
// deste preset pra Dialog/Checkbox/Select): o Radix real emite
// `data-state="active"|"inactive"` em Tabs.Trigger (conferido no pacote
// instalado, apps/web/node_modules/@radix-ui/react-tabs — só `data-state`,
// `data-disabled`, `data-orientation`, nenhum `data-active`), não um
// atributo booleano `data-active` solto — só a sintaxe com colchetes do
// Tailwind casa com um valor específico de atributo.
const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentProps<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className
      )}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentProps<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => {
  return (
    <TabsPrimitive.Content
      ref={ref}
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  )
})
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
