import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { TROCAR_SENHA_SUCESSO_KEY } from "@/pages/trocar-senha-page";

// Espelha exatamente o body schema de POST /auth/login na API
// (apps/api/src/modules/auth/auth.routes.ts): os dois campos são
// obrigatórios e não-vazios, nada além disso.
const loginSchema = z.object({
  login: z.string().min(1, "Informe o login."),
  senha: z.string().min(1, "Informe a senha."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/** Mensagem genérica de credenciais inválidas — igual à da API (auth.service.ts),
 * de propósito: nunca revelar se foi o login ou a senha que errou. */
const INVALID_CREDENTIALS_MESSAGE = "Login ou senha inválidos.";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Mensagem de sucesso deixada no sessionStorage por trocar-senha-page.tsx
  // (não `navigate(..., { state })` — ver comentário lá sobre a corrida com
  // o redirect do ProtectedRoute que descartava o state na prática). Lê e
  // limpa a chave uma única vez, no mount desta página.
  useEffect(() => {
    const stored = sessionStorage.getItem(TROCAR_SENHA_SUCESSO_KEY);
    if (stored) {
      sessionStorage.removeItem(TROCAR_SENHA_SUCESSO_KEY);
      setSuccessMessage(stored);
    }
  }, []);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { login: "", senha: "" },
  });

  async function onSubmit(values: LoginFormValues) {
    setFormError(null);
    try {
      await login(values.login, values.senha);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setFormError(INVALID_CREDENTIALS_MESSAGE);
      } else {
        setFormError("Não foi possível entrar. Tente novamente.");
      }
    }
  }

  const isSubmitting = form.formState.isSubmitting;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Entrar</CardTitle>
          <CardDescription>Sistema de Contratos de Exportação</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
              {successMessage && (
                <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
                  {successMessage}
                </p>
              )}
              <FormField
                control={form.control}
                name="login"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Login</FormLabel>
                    <FormControl>
                      <Input autoComplete="username" autoFocus disabled={isSubmitting} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="senha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" disabled={isSubmitting} {...field} />
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
                {isSubmitting ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
