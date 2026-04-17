import { authClient } from "~/libs/auth-client";
import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "~/components/auth-screen";
import { WelcomeScreen } from "~/components/welcome-screen";

export const Route = createFileRoute("/")({ component: App });

function App() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <main className="mx-auto max-w-5xl px-4 pb-8 pt-14">
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </main>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return <WelcomeScreen session={session} />;
}
