import { useForm } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { authClient } from "~/libs/auth-client";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Gamepad2, Loader2, Mail, KeyRound, AtSign } from "lucide-react";
import { useState } from "react";

type AuthView = "signIn" | "signUp";

function FieldError({ field }: { field: AnyFieldApi }) {
  return field.state.meta.isTouched && !field.state.meta.isValid ? (
    <p className="text-xs text-destructive">
      {field.state.meta.errors.filter((e): e is string => typeof e === "string").join(", ")}
    </p>
  ) : null;
}

export function AuthScreen() {
  const [view, setView] = useState<AuthView>("signIn");
  const [authError, setAuthError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      username: "",
    },
    onSubmit: async ({ value }) => {
      setAuthError(null);
      try {
        if (view === "signUp") {
          const res = await authClient.signUp.email({
            email: value.email,
            password: value.password,
            name: value.username,
            username: value.username,
          });
          if (res.error) {
            setAuthError(res.error.message ?? "Sign up failed");
            return;
          }
        } else {
          const res = await authClient.signIn.email({
            email: value.email,
            password: value.password,
          });
          if (res.error) {
            setAuthError(res.error.message ?? "Sign in failed");
            return;
          }
        }
      } catch {
        setAuthError("Something went wrong. Please try again.");
      }
    },
  });

  const handleGoogleSignIn = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: process.env.VITE_BACKEND_URL,
    });
  };

  const switchView = (nextView: AuthView) => {
    form.reset();
    setAuthError(null);
    setView(nextView);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-8 pt-14">
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80">
              <Gamepad2 className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {view === "signIn" ? "Welcome Back" : "Create Account"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {view === "signIn"
                ? "Sign in to play Big Two with your friends"
                : "Sign up to get started"}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
              }}
              className="space-y-4"
            >
              {view === "signUp" && (
                <form.Field
                  name="username"
                  validators={{
                    onChange: ({ value }) => {
                      if (!value) return "Username is required";
                      if (value.length < 3) return "Username must be at least 3 characters";
                      if (!/^[a-zA-Z0-9_]+$/.test(value))
                        return "Username can only contain letters, numbers, and underscores";
                      return undefined;
                    },
                  }}
                  children={(field) => (
                    <div className="space-y-1.5">
                      <label htmlFor={field.name} className="block text-left text-sm font-medium">
                        Username
                      </label>
                      <div className="relative">
                        <AtSign className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id={field.name}
                          name={field.name}
                          type="text"
                          placeholder="coolplayer42"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                      <FieldError field={field} />
                    </div>
                  )}
                />
              )}

              <form.Field
                name="email"
                validators={{
                  onChange: ({ value }) => {
                    if (!value) return "Email is required";
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Invalid email address";
                    return undefined;
                  },
                }}
                children={(field) => (
                  <div className="space-y-1.5">
                    <label htmlFor={field.name} className="block text-left text-sm font-medium">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id={field.name}
                        name={field.name}
                        type="email"
                        placeholder="you@example.com"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <FieldError field={field} />
                  </div>
                )}
              />

              <form.Field
                name="password"
                validators={{
                  onChange: ({ value }) => {
                    if (!value) return "Password is required";
                    if (view === "signUp" && value.length < 8)
                      return "Password must be at least 8 characters";
                    return undefined;
                  },
                }}
                children={(field) => (
                  <div className="space-y-1.5">
                    <label htmlFor={field.name} className="block text-left text-sm font-medium">
                      Password
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id={field.name}
                        name={field.name}
                        type="password"
                        placeholder={
                          view === "signUp" ? "At least 8 characters" : "Enter your password"
                        }
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <FieldError field={field} />
                  </div>
                )}
              />

              {authError && <p className="text-sm text-destructive">{authError}</p>}

              <form.Subscribe
                selector={(state) => [state.canSubmit, state.isSubmitting]}
                children={([canSubmit, isSubmitting]) => (
                  <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : view === "signIn" ? (
                      "Sign in"
                    ) : (
                      "Create account"
                    )}
                  </Button>
                )}
              />
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={handleGoogleSignIn}>
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {view === "signIn" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => switchView("signUp")}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => switchView("signIn")}
                >
                  Sign in
                </button>
              </>
            )}
          </p>

          <p className="text-xs text-muted-foreground">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </main>
  );
}
