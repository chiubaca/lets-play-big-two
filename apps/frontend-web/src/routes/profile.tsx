import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { HomeBackButton } from "~/components/home-back-button";
import { CasinoBackdrop } from "~/components/casino/casino";
import { ProfileForm } from "~/components/profile-form";
import { authClient } from "~/libs/auth-client";
import "./profile.css";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Your Profile · Big Two Crew" }] }),
  component: ProfilePage,
});

export function ProfilePage() {
  const { data: session, isPending, error } = authClient.useSession();

  if (!isPending && !error && !session) {
    return <Navigate to="/" search={{ auth: "sign-in" }} replace />;
  }

  return (
    <main className="profile-page">
      <CasinoBackdrop />
      <HomeBackButton className="profile-back" />
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
        ) : null}
      </div>
    </main>
  );
}
