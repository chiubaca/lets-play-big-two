import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AuthPanel } from "~/components/auth-panel";
import { CasinoBackdrop } from "~/components/casino/casino";
import { ProfileForm } from "~/components/profile-form";
import { authClient } from "~/libs/auth-client";
import "./profile.css";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Your Profile · Big Two Crew" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: session, isPending, error } = authClient.useSession();

  return (
    <main className="profile-page">
      <CasinoBackdrop />
      <Link to="/" className="profile-back">
        <ArrowLeft aria-hidden="true" /> Back to Big Two Crew
      </Link>
      <h1 className="sr-only">Your profile</h1>
      <div className="profile-page-content">
        {isPending ? (
          <p className="flex items-center gap-2" role="status">
            <Loader2 className="animate-spin" aria-hidden="true" /> Loading your profile…
          </p>
        ) : error ? (
          <p className="profile-page-error" role="alert">
            Couldn’t load your profile. Please refresh and try again.
          </p>
        ) : session ? (
          <ProfileForm key={session.user.id} user={session.user} />
        ) : (
          <>
            <p>Sign in to choose your emoji and update your username.</p>
            <div className="profile-sign-in">
              <AuthPanel returnToCurrentPage />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
