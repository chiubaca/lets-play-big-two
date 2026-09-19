import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { AuthPanel } from "~/components/auth-panel";
import { LegalPage } from "~/components/legal-page";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { authClient } from "~/libs/auth-client";
import "~/components/home-screen.css";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Account & Data Deletion · Big Two Crew" },
      {
        name: "description",
        content: "Manage or permanently delete your Big Two Crew account and associated data.",
      },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [confirmation, setConfirmation] = useState("");
  const deleteAccount = useMutation({
    mutationFn: async () => {
      const result = await authClient.deleteUser();
      if (result.error) {
        throw new Error(
          result.error.message ??
            "We couldn’t delete the account. Sign out, sign back in, and try again.",
        );
      }
    },
    onSuccess: () => void navigate({ to: "/" }),
  });

  return (
    <LegalPage eyebrow="Account controls" title="Account & data deletion">
      <div className="legal-content">
        {isPending ? (
          <p className="flex items-center gap-2">
            <Loader2 className="animate-spin" aria-hidden="true" /> Loading your account…
          </p>
        ) : session ? (
          <>
            <section>
              <h2>Signed in as {session.user.email}</h2>
              <p>
                Deleting your account permanently removes your profile, sign-in methods, and active
                sessions. Your name and account ID are also replaced with “Deleted player” in saved
                online rooms. Anonymised game state and security logs may be retained as needed to
                operate and protect the service. This cannot be undone. Local game data stored on
                your device can be removed separately by clearing the app or browser storage.
              </p>
            </section>

            <section className="legal-action-card">
              <h2>Delete account permanently</h2>
              <div>
                <label htmlFor="delete-confirmation">
                  Type <strong>DELETE</strong> to confirm
                </label>
                <Input
                  id="delete-confirmation"
                  value={confirmation}
                  autoComplete="off"
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </div>
              {deleteAccount.error && (
                <p className="legal-error" role="alert">
                  {deleteAccount.error.message}
                </p>
              )}
              <Button
                type="button"
                variant="destructive"
                className="h-11 w-fit rounded-xl border border-destructive/40 px-5"
                disabled={confirmation !== "DELETE" || deleteAccount.isPending}
                onClick={() => deleteAccount.mutate()}
              >
                {deleteAccount.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 aria-hidden="true" />
                )}
                Permanently delete my account
              </Button>
            </section>
          </>
        ) : (
          <>
            <p>
              Sign in to permanently delete your Big Two Crew account and associated authentication
              data. Your identity will also be removed from saved online rooms. If you cannot sign
              in, email <a href="mailto:alexchiu11@gmail.com">alexchiu11@gmail.com</a> from the
              address on the account.
            </p>
            <div className="legal-action-card">
              <AuthPanel />
            </div>
          </>
        )}
      </div>
    </LegalPage>
  );
}
