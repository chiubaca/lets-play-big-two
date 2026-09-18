import { useForm } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { AtSign, KeyRound, Loader2, Mail } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { authClient } from "~/libs/auth-client";

type AuthView = "signIn" | "signUp";

function FieldError({ field }: { field: AnyFieldApi }) {
  if (!field.state.meta.isTouched || field.state.meta.isValid) return null;
  return (
    <p className="text-left text-xs text-destructive">
      {field.state.meta.errors
        .filter((error): error is string => typeof error === "string")
        .join(", ")}
    </p>
  );
}

export function AuthPanel() {
  const formId = useId();
  const [view, setView] = useState<AuthView>("signIn");
  const [authError, setAuthError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: { email: "", password: "", username: "" },
    onSubmit: async ({ value }) => {
      setAuthError(null);
      try {
        const response =
          view === "signUp"
            ? await authClient.signUp.email({
                email: value.email,
                password: value.password,
                name: value.username,
                username: value.username,
              })
            : await authClient.signIn.email({ email: value.email, password: value.password });
        if (response.error) setAuthError(response.error.message ?? "We couldn’t sign you in.");
      } catch {
        setAuthError("Something went wrong. Please try again.");
      }
    },
  });

  const switchView = (next: AuthView) => {
    form.reset();
    setAuthError(null);
    setView(next);
  };

  return (
    <div className="auth-panel">
      <div className="auth-panel-heading">
        <span className="auth-panel-chip" aria-hidden="true">
          ♠
        </span>
        <div>
          <p className="casino-kicker">Members’ table</p>
          <h2>{view === "signIn" ? "Take your seat" : "Join the club"}</h2>
          <p>
            {view === "signIn"
              ? "Sign in to create a private online room or join your friends."
              : "Create an account for private multiplayer tables."}
          </p>
        </div>
      </div>

      <form
        className="auth-panel-form"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        {view === "signUp" && (
          <form.Field
            name="username"
            validators={{
              onChange: ({ value }) => {
                if (!value) return "Username is required";
                if (value.length < 3) return "Use at least 3 characters";
                if (!/^[a-zA-Z0-9_]+$/.test(value)) return "Use letters, numbers, or underscores";
                return undefined;
              },
            }}
          >
            {(field) => (
              <div className="auth-field">
                <label htmlFor={`${formId}-username`}>Username</label>
                <div className="auth-input-wrap">
                  <AtSign aria-hidden="true" />
                  <Input
                    id={`${formId}-username`}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="cardsharp42"
                    autoComplete="username"
                  />
                </div>
                <FieldError field={field} />
              </div>
            )}
          </form.Field>
        )}

        <form.Field
          name="email"
          validators={{
            onChange: ({ value }) => {
              if (!value) return "Email is required";
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email";
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="auth-field">
              <label htmlFor={`${formId}-email`}>Email</label>
              <div className="auth-input-wrap">
                <Mail aria-hidden="true" />
                <Input
                  id={`${formId}-email`}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <FieldError field={field} />
            </div>
          )}
        </form.Field>

        <form.Field
          name="password"
          validators={{
            onChange: ({ value }) => {
              if (!value) return "Password is required";
              if (view === "signUp" && value.length < 8) return "Use at least 8 characters";
              return undefined;
            },
          }}
        >
          {(field) => (
            <div className="auth-field">
              <label htmlFor={`${formId}-password`}>Password</label>
              <div className="auth-input-wrap">
                <KeyRound aria-hidden="true" />
                <Input
                  id={`${formId}-password`}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={view === "signUp" ? "At least 8 characters" : "Your password"}
                  autoComplete={view === "signUp" ? "new-password" : "current-password"}
                />
              </div>
              <FieldError field={field} />
            </div>
          )}
        </form.Field>

        {authError && (
          <p className="auth-error" role="alert">
            {authError}
          </p>
        )}

        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
          {([canSubmit, isSubmitting]) => (
            <Button
              type="submit"
              variant="gold"
              size="lg"
              className="h-12 w-full text-base"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" />
              ) : view === "signIn" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="auth-divider">
        <span>or</span>
      </div>
      <Button
        type="button"
        variant="lacquer"
        className="h-11 w-full"
        onClick={() =>
          authClient.signIn.social({ provider: "google", callbackURL: window.location.origin })
        }
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
      </Button>

      <p className="auth-switch">
        {view === "signIn" ? "New to the table?" : "Already a member?"}{" "}
        <button type="button" onClick={() => switchView(view === "signIn" ? "signUp" : "signIn")}>
          {view === "signIn" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
