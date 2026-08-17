import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REFERENCE_OPTIONS_PAGE_SIZE, useImportadores, useProdutos, useRepresentantes, useStatusContrato } from "@/features/referencias/hooks";
import { MOEDAS } from "@/lib/moedas";
import { useContratos } from "./hooks";
import { TIPO_CONTRATO_LABELS, type Contrato } from "./types";

const TIPO_CONTRATO = ["Original", "Aditivo"] as const;
const TIPO_FRETE = ["FOB", "CFR", "CIF"] as const;
// Valores originais do sistema anterior (ver comentário em contratos no
// schema.prisma) — a API não os valida como enum (só string não-vazia), mas
// usá-los como <Select> aqui é orientação de UX/qualidade de dado, não uma
// regra de segurança: um valor fora dessa lista mandado direto pra API
// ainda seria aceito por ela. MOEDAS é exceção — vem de @/lib/moedas
// porque `itens-section.tsx` reusa a MESMA lista pra um campo que a API
// (essa sim) valida como enum de verdade (ItemContrato.moeda).
const LOCAIS = ["Belém", "Santarém", "Paragominas", "Portel", "Breves"] as const;
const MODALIDADES_PGT = ["À vista", "Parcelado"] as const;

/** Sentinela do <Select> de contratoPaiId (campo opcional — Radix Select não aceita value="") */
export const NENHUM_CONTRATO_PAI = "__nenhum__";

// Espelha contratoFields/createBodySchema/patchBodySchema em
// apps/api/src/modules/contratos/contratos.routes.ts. comissaoPct/
// comissaoMetragem ficam como string aqui (não z.coerce.number()) de
// propósito: coagir "" (campo vazio) resultaria em 0, não "não informado" —
// a conversão pra number (ou omissão do campo) acontece no submit, só
// quando o campo não está vazio.
const contratoFormSchema = z.object({
  numeroContrato: z.string().min(1, "Informe o número do contrato."),
  importadorId: z.string().min(1, "Selecione o importador."),
  representanteId: z.string().min(1, "Selecione o representante."),
  produtoId: z.string().min(1, "Selecione o produto."),
  statusId: z.string().min(1, "Selecione o status."),
  tipoContrato: z.enum(TIPO_CONTRATO, { message: "Selecione o tipo de contrato." }),
  dataContrato: z.string().min(1, "Informe a data do contrato."),
  volumeM3: z.coerce.number({ message: "Informe o volume em m³." }).positive("O volume precisa ser maior que zero."),
  qtdContainers: z.coerce
    .number({ message: "Informe a quantidade de containers." })
    .int("A quantidade de containers precisa ser um número inteiro.")
    .positive("A quantidade de containers precisa ser maior que zero."),
  local: z.enum(LOCAIS, { message: "Selecione o local." }),
  tipoFrete: z.enum(TIPO_FRETE, { message: "Selecione o tipo de frete." }),
  requerFumigacao: z.boolean(),
  certificacaoProcessoOrigem: z.boolean(),
  requerCites: z.boolean(),
  requerFsc: z.boolean(),
  requerCertificadoFitossanitario: z.boolean(),
  requerCertificadoKilnDried: z.boolean(),
  comissaoPct: z.string().optional(),
  comissaoMetragem: z.string().optional(),
  valorTotalUsd: z.coerce.number({ message: "Informe o valor total." }).min(0, "O valor total não pode ser negativo."),
  moedaValorTotal: z.enum(MOEDAS, { message: "Selecione a moeda." }),
  modalidadePgtContaBrasil: z.enum(MODALIDADES_PGT, { message: "Selecione a modalidade de pagamento (Brasil)." }),
  modalidadePgtContaExterior: z.enum(MODALIDADES_PGT, { message: "Selecione a modalidade de pagamento (exterior)." }),
  contratoPaiId: z.string().optional(),
}).superRefine((values, ctx) => {
  // Espelha a regra de negócio da API (contratos.service.ts,
  // validarVinculoAditivo): "Aditivo" exige um contrato original
  // selecionado. Não valida o inverso ("Único" não pode ter pai) aqui —
  // contratoFormValuesToPayload sempre manda null nesse caso,
  // independente do que estiver no campo (ver comentário lá), então não
  // tem como o usuário mandar um contratoPaiId indevido por essa tela.
  if (values.tipoContrato === "Aditivo" && (!values.contratoPaiId || values.contratoPaiId === NENHUM_CONTRATO_PAI)) {
    ctx.addIssue({
      code: "custom",
      path: ["contratoPaiId"],
      message: "Selecione o contrato original — obrigatório quando o tipo é Aditivo.",
    });
  }
});

export type ContratoFormValues = z.infer<typeof contratoFormSchema>;

export const CONTRATO_FORM_DEFAULT_VALUES: ContratoFormValues = {
  numeroContrato: "",
  importadorId: "",
  representanteId: "",
  produtoId: "",
  statusId: "",
  tipoContrato: "Original",
  dataContrato: "",
  volumeM3: 0,
  qtdContainers: 0,
  local: "Belém",
  tipoFrete: "FOB",
  requerFumigacao: false,
  certificacaoProcessoOrigem: false,
  requerCites: false,
  requerFsc: false,
  requerCertificadoFitossanitario: false,
  requerCertificadoKilnDried: false,
  comissaoPct: "",
  comissaoMetragem: "",
  valorTotalUsd: 0,
  moedaValorTotal: "USD",
  modalidadePgtContaBrasil: "À vista",
  modalidadePgtContaExterior: "À vista",
  contratoPaiId: NENHUM_CONTRATO_PAI,
};

/**
 * Monta o corpo pra POST/PATCH /contratos a partir dos valores do
 * formulário — nunca passa os valores do RHF direto: comissaoPct/
 * comissaoMetragem (opcionais) só entram no corpo se preenchidos
 * (convertidos pra number aqui, não antes — ver comentário no schema
 * acima). `contratoPaiId` sempre entra no payload, nunca é omitido: `null`
 * quando o tipo é "Único" (mesmo que o campo tivesse algo selecionado
 * antes — próprio schema garante isso via `superRefine`, mas aqui é
 * defensivo), ou o id escolhido quando é "Aditivo". Mandar `null`
 * explícito (não omitir) é o que permite ao PATCH desvincular um Aditivo
 * existente ao trocá-lo de volta pra "Único" — ver o mesmo comentário do
 * lado da API (contratos.routes.ts, `contratoPaiId` no schema do PATCH).
 */
export function contratoFormValuesToPayload(values: ContratoFormValues): Record<string, unknown> {
  const { comissaoPct, comissaoMetragem, contratoPaiId, ...rest } = values;
  const payload: Record<string, unknown> = { ...rest };

  if (comissaoPct !== undefined && comissaoPct.trim() !== "") payload.comissaoPct = Number(comissaoPct);
  if (comissaoMetragem !== undefined && comissaoMetragem.trim() !== "") payload.comissaoMetragem = Number(comissaoMetragem);
  payload.contratoPaiId =
    values.tipoContrato === "Aditivo" && contratoPaiId && contratoPaiId !== NENHUM_CONTRATO_PAI ? contratoPaiId : null;

  return payload;
}

/**
 * Inverso de `contratoFormValuesToPayload` — usado pela tela de edição pra
 * pré-preencher o formulário a partir de um `Contrato` já carregado (ver
 * contrato-edit-page.tsx). `local`/`moedaValorTotal`/`modalidadePgt*` vêm
 * como `string` solta da API (não são enum lá — ver comentário no schema
 * acima); o cast pro literal union do form assume que o dado já é um dos
 * valores conhecidos, o que é verdade pra todo contrato criado por este
 * mesmo formulário. `dataContrato` vem como datetime ISO completo da API;
 * o `<input type="date">` precisa só da parte "YYYY-MM-DD".
 */
export function contratoToFormValues(c: Contrato): ContratoFormValues {
  return {
    numeroContrato: c.numeroContrato,
    importadorId: c.importadorId,
    representanteId: c.representanteId,
    produtoId: c.produtoId,
    statusId: c.statusId,
    tipoContrato: c.tipoContrato,
    dataContrato: c.dataContrato.slice(0, 10),
    volumeM3: c.volumeM3,
    qtdContainers: c.qtdContainers,
    local: c.local as ContratoFormValues["local"],
    tipoFrete: c.tipoFrete,
    requerFumigacao: c.requerFumigacao,
    certificacaoProcessoOrigem: c.certificacaoProcessoOrigem,
    requerCites: c.requerCites,
    requerFsc: c.requerFsc,
    requerCertificadoFitossanitario: c.requerCertificadoFitossanitario,
    requerCertificadoKilnDried: c.requerCertificadoKilnDried,
    comissaoPct: c.comissaoPct ?? "",
    comissaoMetragem: c.comissaoMetragem ?? "",
    valorTotalUsd: Number(c.valorTotalUsd),
    moedaValorTotal: c.moedaValorTotal as ContratoFormValues["moedaValorTotal"],
    modalidadePgtContaBrasil: c.modalidadePgtContaBrasil as ContratoFormValues["modalidadePgtContaBrasil"],
    modalidadePgtContaExterior: c.modalidadePgtContaExterior as ContratoFormValues["modalidadePgtContaExterior"],
    contratoPaiId: c.contratoPaiId ?? NENHUM_CONTRATO_PAI,
  };
}

interface ContratoFormProps {
  defaultValues: ContratoFormValues;
  onSubmit: (payload: Record<string, unknown>) => void;
  isSubmitting: boolean;
  submitError: string | null;
  submitLabel: string;
  /** Contrato atual, pra excluir da lista de opções de "contrato pai" (edição — um contrato não pode ser pai de si mesmo). */
  excludeContratoId?: string;
}

/**
 * Formulário de contrato — reusado tanto por "criar" (contrato-create-page.tsx)
 * quanto por "editar" (contrato-edit-page.tsx). A tela que usa isto decide o
 * que fazer com o payload validado (POST vs PATCH) e pra onde navegar depois.
 */
export function ContratoForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitError,
  submitLabel,
  excludeContratoId,
}: ContratoFormProps) {
  const importadoresQuery = useImportadores({ pageSize: REFERENCE_OPTIONS_PAGE_SIZE });
  const representantesQuery = useRepresentantes({ pageSize: REFERENCE_OPTIONS_PAGE_SIZE });
  const produtosQuery = useProdutos({ pageSize: REFERENCE_OPTIONS_PAGE_SIZE });
  const statusQuery = useStatusContrato({ pageSize: REFERENCE_OPTIONS_PAGE_SIZE });
  const contratosQuery = useContratos({ page: 1 });

  const importadores = importadoresQuery.data?.data ?? [];
  const representantes = representantesQuery.data?.data ?? [];
  const produtos = produtosQuery.data?.data ?? [];
  const statusList = statusQuery.data?.data ?? [];
  // Só contratos "Original" — mesma regra de negócio da API
  // (validarVinculoAditivo): um Aditivo só pode apontar pra um Original,
  // nunca pra outro Aditivo (sem encadeamento).
  const contratosParaPai = (contratosQuery.data?.data ?? []).filter(
    (c) => c.id !== excludeContratoId && c.tipoContrato === "Original",
  );

  const referenciasCarregando =
    importadoresQuery.isLoading || representantesQuery.isLoading || produtosQuery.isLoading || statusQuery.isLoading;

  // Só `defaultValues`, nunca `values`: este componente só deve ser
  // montado depois que os dados iniciais já estão prontos (a página de
  // edição espera `useContrato` carregar antes de renderizar
  // `<ContratoForm>` — ver contrato-edit-page.tsx). Usar `values` faria o
  // RHF ressincronizar o formulário toda vez que `defaultValues` mudasse
  // de referência, apagando o que o usuário estivesse digitando.
  // Três generics (não só <ContratoFormValues>): volumeM3/qtdContainers/
  // valorTotalUsd usam z.coerce.number(), então o tipo de ENTRADA do schema
  // (o que os campos aceitam digitando, string|number) difere do tipo de
  // SAÍDA (o que sai validado, sempre number) — @hookform/resolvers exige
  // declarar os dois quando eles divergem, senão o TS não fecha o tipo do
  // resolver. `handleSubmit` abaixo recebe os valores já no formato de
  // SAÍDA (ContratoFormValues, números de verdade), que é o que
  // `contratoFormValuesToPayload` espera.
  const form = useForm<z.input<typeof contratoFormSchema>, unknown, ContratoFormValues>({
    resolver: zodResolver(contratoFormSchema),
    defaultValues: defaultValues as z.input<typeof contratoFormSchema>,
  });

  // Controla a exibição do campo "Contrato original" — só aparece (e só é
  // exigido) quando o tipo selecionado é "Aditivo" (ver superRefine no
  // schema e contratoFormValuesToPayload acima). Chamado antes de qualquer
  // `return` condicional abaixo — mesmo raciocínio de regra de hooks que já
  // vale pros outros hooks deste componente (ordem de chamada estável entre renders).
  const tipoContratoSelecionado = form.watch("tipoContrato");

  if (referenciasCarregando) {
    return <p className="text-sm text-muted-foreground">Carregando dados de referência…</p>;
  }

  const semReferenciasCadastradas =
    importadores.length === 0 || representantes.length === 0 || produtos.length === 0 || statusList.length === 0;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => onSubmit(contratoFormValuesToPayload(values)))} className="grid gap-6" noValidate>
        {semReferenciasCadastradas && (
          <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            Cadastre pelo menos um importador, representante, produto e status antes de criar um contrato
            (ver menu "Referências" na barra lateral).
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="numeroContrato"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número do contrato</FormLabel>
                <FormControl>
                  <Input disabled={isSubmitting} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tipoContrato"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de contrato</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIPO_CONTRATO.map((v) => (
                      <SelectItem key={v} value={v}>
                        {TIPO_CONTRATO_LABELS[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="importadorId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Importador</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {importadores.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.nomeRazaoSocial}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="representanteId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Representante</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {representantes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nomeRepresentante}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="produtoId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Produto</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {produtos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nomeProduto}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="statusId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {statusList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nomeStatus}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dataContrato"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data do contrato</FormLabel>
                <FormControl>
                  <Input type="date" disabled={isSubmitting} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="local"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Local</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {LOCAIS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="volumeM3"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Volume (m³)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" disabled={isSubmitting} {...field} value={field.value as number | string} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="qtdContainers"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantidade de containers</FormLabel>
                <FormControl>
                  <Input type="number" step="1" disabled={isSubmitting} {...field} value={field.value as number | string} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tipoFrete"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de frete</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIPO_FRETE.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Só aparece pra "Aditivo" — pra "Único" o campo nem faz sentido
              (contratoFormValuesToPayload já garante null nesse caso,
              independente do que estivesse selecionado antes de trocar o tipo). */}
          {tipoContratoSelecionado === "Aditivo" && (
            <FormField
              control={form.control}
              name="contratoPaiId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contrato original</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {contratosParaPai.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.numeroContrato}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="valorTotalUsd"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor total</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" disabled={isSubmitting} {...field} value={field.value as number | string} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="moedaValorTotal"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Moeda</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {MOEDAS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="comissaoPct"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Comissão (%) — opcional</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" disabled={isSubmitting} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="comissaoMetragem"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Comissão por metragem — opcional</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" disabled={isSubmitting} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="modalidadePgtContaBrasil"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Modalidade de pagamento (Brasil)</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {MODALIDADES_PGT.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="modalidadePgtContaExterior"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Modalidade de pagamento (exterior)</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {MODALIDADES_PGT.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["requerFumigacao", "Requer fumigação"],
              ["certificacaoProcessoOrigem", "Certificação de processo de origem"],
              ["requerCites", "Requer CITES"],
              ["requerFsc", "Requer FSC"],
              ["requerCertificadoFitossanitario", "Requer certificado fitossanitário"],
              ["requerCertificadoKilnDried", "Requer certificado Kiln Dried"],
            ] as const
          ).map(([name, label]) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormLabel className="font-normal">{label}</FormLabel>
                </FormItem>
              )}
            />
          ))}
        </div>

        {submitError && (
          <p role="alert" className="text-sm text-destructive">
            {submitError}
          </p>
        )}

        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Salvando…" : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
