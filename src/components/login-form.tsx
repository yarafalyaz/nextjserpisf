"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shadcn/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/shadcn/field";
import { Input } from "@/components/ui/shadcn/input";
import { safeInternalPath } from "@/lib/utils/safe-redirect";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read callbackUrl from the query string. The page is wrapped in <Suspense>
  // so useSearchParams can safely bail out to client rendering.
  // SECURITY: validate it's a same-origin path — never push an attacker-supplied
  // javascript:/https://evil URL (XSS / open redirect).
  const callbackUrl = safeInternalPath(searchParams.get("callbackUrl"), "/");

  // Strip the callback from the URL bar so it does not leak via copy/paste
  // or browser history. Done in an effect (NOT during render) to avoid
  // mutating the DOM from a component body.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.search.includes("callbackUrl=")) return;
    const clean = window.location.pathname + window.location.hash;
    window.history.replaceState({}, "", clean);
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Email atau password salah");
      setLoading(false);
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  function clearErrorOnEdit() {
    if (error) setError(null);
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Selamat Datang Kembali</CardTitle>
          <CardDescription>
            Masuk dengan email dan password Anda
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} aria-busy={loading} noValidate>
            <FieldGroup>
              <Field>
                <div
                  id="login-error"
                  role="alert"
                  aria-live="assertive"
                  className={cn(
                    "mb-4 p-3 rounded-lg border text-sm flex items-center gap-2",
                    error
                      ? "bg-destructive/15 border-destructive/30 text-destructive"
                      : "hidden",
                  )}
                >
                  {error && (
                    <>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="shrink-0"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      <span>{error}</span>
                    </>
                  )}
                </div>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="nama@perusahaan.com"
                  required
                  autoComplete="email"
                  autoFocus
                  aria-describedby={error ? "login-error" : undefined}
                  onChange={clearErrorOnEdit}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-describedby={error ? "login-error" : undefined}
                  onChange={clearErrorOnEdit}
                />
              </Field>
              <Field>
                <Button
                  type="submit"
                  id="login-submit"
                  disabled={loading}
                  className="w-full bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 hover:bg-zinc-900/90 dark:hover:bg-zinc-50/90 shadow transition-all font-medium h-9"
                >
                  {loading ? (
                    <>
                      <Loader2
                        size={16}
                        className="animate-spin mr-2"
                        aria-hidden="true"
                      />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    "Masuk"
                  )}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        Dengan mengklik masuk, Anda menyetujui{" "}
        <a
          href="/ketentuan-layanan"
          className="underline underline-offset-4 hover:text-foreground transition-colors"
        >
          Ketentuan Layanan
        </a>{" "}
        dan{" "}
        <a
          href="/kebijakan-privasi"
          className="underline underline-offset-4 hover:text-foreground transition-colors"
        >
          Kebijakan Privasi
        </a>{" "}
        kami.
      </FieldDescription>
    </div>
  );
}
