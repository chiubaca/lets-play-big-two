import { authClient } from "@/libs/auth-client";
import { useRouter } from "@tanstack/react-router";

export function SignInButton() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  if (isPending) {
    return <div>Checking session...</div>;
  }

  const handleSignIn = async () => {
    console.log(
      "🔍 ~ SignInButton ~ apps/frontend-web/src/components/sign-in-button.tsx:14 ~ google:",
    );
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "https://local.bigtwo.com",
      });
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      // Redirect to home page after sign out
      router.navigate({ to: "/" });
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
