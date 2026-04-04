import { useRouter } from "@tanstack/react-router";
import { authClient } from "~/libs/auth-client";

export function AuthButton() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  if (isPending) {
    return <div>Checking session...</div>;
  }

  const handleSignIn = async () => {
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: process.env.VITE_BACKEND_URL,
      });
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      // Redirect to home page after sign out
      await router.navigate({ to: "/" });
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  if (!session) {
    return (
      <button onClick={handleSignIn} className="btn btn-primary cursor-pointer">
        Sign in with Google
      </button>
    );
  }

  return (
    <div className="flex items-center space-x-3">
      {session.user?.image && (
        <img
          src={session.user.image}
          alt={`${session.user.name}'s avatar`}
          className="h-8 w-8 rounded-full"
        />
      )}
      <div>
        <div className="font-medium">{session.user?.name}</div>
        <div className="text-sm text-muted-foreground">{session.user?.email}</div>
      </div>
      <button onClick={handleSignOut} className="btn btn-sm btn-outline">
        Sign out
      </button>
    </div>
  );
}
