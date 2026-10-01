import { authClient } from "~/libs/auth-client";
import { createFileRoute } from "@tanstack/react-router";
import { HomeScreen } from "~/components/home-screen";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { auth?: "sign-in" } =>
    search.auth === "sign-in" ? { auth: "sign-in" } : {},
  component: App,
});

function App() {
  const { data: session, isPending } = authClient.useSession();
  const { auth } = Route.useSearch();
  return (
    <HomeScreen
      session={session ?? null}
      sessionPending={isPending}
      authRequested={auth === "sign-in"}
    />
  );
}
