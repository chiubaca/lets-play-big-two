import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthPanel } from "../components/auth-panel";
import { authClient } from "../libs/auth-client";

export const Route = createFileRoute("/turn-return")({ component: TurnReturn });

export function TurnReturn() {
  const { data: session, isPending } = authClient.useSession();
  const [state, setState] = useState<"checking" | "sign-in" | "missing" | "unavailable">(
    "checking",
  );
  const ticket =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("ticket");

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      setState("sign-in");
      return;
    }
    if (!ticket || !/^[A-Za-z0-9_-]{30,500}$/.test(ticket)) {
      setState("unavailable");
      return;
    }
    let disposed = false;
    setState("checking");
    void fetch(
      `${import.meta.env.VITE_BACKEND_URL}/api/turn-notifications/return?ticket=${ticket}`,
      {
        credentials: "include",
        cache: "no-store",
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Unavailable");
        return response.json();
      })
      .then((result: unknown) => {
        if (disposed) return;
        if (!result || typeof result !== "object") {
          setState("unavailable");
          return;
        }
        if (
          "allowed" in result &&
          result.allowed === true &&
          "target" in result &&
          typeof result.target === "string" &&
          /^\/room\/[A-Z0-9]{5}$/.test(result.target)
        ) {
          window.location.replace(result.target);
        } else
          setState(
            "allowed" in result &&
              result.allowed === true &&
              "missing" in result &&
              result.missing === true
              ? "missing"
              : "sign-in",
          );
      })
      .catch(() => {
        if (!disposed) setState("unavailable");
      });
    return () => {
      disposed = true;
    };
  }, [ticket, session?.user.id, isPending]);

  return (
    <main className="room-auth-page">
      {isPending || state === "checking" ? <p>Checking your account…</p> : null}
      {state === "sign-in" && !session ? (
        <>
          <h1>Sign in to return to your turn</h1>
          <AuthPanel returnToCurrentPage />
        </>
      ) : null}
      {state === "sign-in" && session ? (
        <>
          <h1>Sign in as the original Player</h1>
          <p>This account cannot open this notification.</p>
          <button onClick={() => void authClient.signOut()}>Sign out to switch accounts</button>
        </>
      ) : null}
      {state === "missing" ? (
        <>
          <h1>This room could not be found</h1>
          <Link to="/">Return to lobby</Link>
        </>
      ) : null}
      {state === "unavailable" ? (
        <>
          <h1>Could not verify this notification</h1>
          <Link to="/">Return to lobby</Link>
        </>
      ) : null}
    </main>
  );
}
