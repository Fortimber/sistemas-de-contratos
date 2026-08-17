import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

// Espelha as validações de PATCH /auth/senha na API (senha.routes.ts): nova
// senha com no mínimo 8 caracteres e diferente da senha atual. A API é quem
// tem a palavra final (o form aqui só evita uma viagem óbvia ao servidor) —
// os dois erros continuam tratados na resposta também (ver onSubmit abaixo).
const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual."),
    novaSenha: z.string().min(8, "A nova senha precisa ter no mínimo 8 caracteres."),
    confirmarNovaSenha: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((data) => data.novaSenha !== data.senhaAtual, {
    message: "A nova senha precisa ser diferente da senha atual.",
    path: ["novaSenha"],
  })
  .refine((data) => data.novaSenha === data.confirmarNovaSenha, {
    message: "As senhas não coincidem.",
    path: ["confirmarNovaSenha"],
  });

type TrocarSenhaFormValues = z.infer<typeof trocarSenhaSchema>;

const SUCESSO_MESSAGE = "Senha alterada com sucesso. Faça login novamente.";
/**
 * sessionStorage, não `navigate(..., { state })`: a troca bem-sucedida
 * dispara duas atualizações quase simultâneas — `clearSession()` (muda
 * `status` pra "unauthenticated", o que faz `ProtectedRoute` também tentar
 * navegar sozinho pra /login, SEM state) e o `navigate()` explícito abaixo
 * (COM state). Qual das duas "vence" a corrida de re-render depende de
 * timing do React/react-router (achado real: testado no navegador — o
 * `state` se perdia na prática). sessionStorage não depende de quem vence
 * essa corrida; `login-page.tsx` lê e limpa a chave no mount.
 */
export const TROCAR_SENHA_SUCESSO_KEY = "trocar-senha:sucesso";

/**
 * Uma única página pros dois fluxos de troca de senha:
 * - Obrigatório: `route-guards.tsx` força pra cá sempre que
 *   `user.deveTrocarSenha === true`, em qualquer rota protegida.
 * - Voluntário: link "Alterar senha" na sidebar, disponível pra qualquer
 *   usuário logado a qualquer momento.
 *
 * PATCH /auth/senha revoga TODAS as sessões do usuário (a atual inclusive)
 * — não há sessão pra continuar depois de um 204 aqui, então o único
 * destino possível é /login (`clearSession` limpa o estado local sem
 * chamar POST /auth/logout, ver comentário em auth-context.tsx).
 */
export function TrocarSenhaPage() {
  const { clearSession } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<TrocarSenhaFormValues>({
    resolver: zodResolver(trocarSenhaSchema),
    defaultValues: { senhaAtual: "", novaSenha: "", confirmarNovaSenha: "" },
  });

  async function onSubmit(values: TrocarSenhaFormValues) {
    setFormError(null);
    try {
      await api.patch("/auth/senha", { senhaAtual: values.senhaAtual, novaSenha: values.novaSenha });
      sessionStorage.setItem(TROCAR_SENHA_SUCESSO_KEY, SUCESSO_MESSAGE);
      clearSession();
      navigate("/login", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        form.setError("senhaAtual", { type: "server", message: err.message });
      } else if (err instanceof ApiError && err.status === 400) {
        form.setError("novaSenha", { type: "server", message: err.message });
      } else {
        setFormError("Não foi possível trocar a senha. Tente novamente.");
      }
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Alterar senha</CardTitle>
          <CardDescription>Depois de salvar, todas as suas sessões são encerradas e você precisa entrar de novo.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
              <FormField
                control={form.control}
                name="senhaAtual"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha atual</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" autoFocus disabled={isSubmitting} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="novaSenha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nova senha</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" disabled={isSubmitting} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmarNovaSenha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar nova senha</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" disabled={isSubmitting} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {formError && (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              )}
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Salvando..." : "Salvar nova senha"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
