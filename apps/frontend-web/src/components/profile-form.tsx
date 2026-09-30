import { useMutation } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { authClient } from "~/libs/auth-client";
import { PROFILE_EMOJI_GROUPS } from "./profile-emojis";
import { MembershipCard } from "./membership-card";
import { profileUsernameError } from "~/libs/profile-username";
import "./profile-form.css";

export function ProfileForm({
  user,
}: {
  user: {
    name: string;
    username?: string | null;
    displayUsername?: string | null;
    emoji?: string | null;
  };
}) {
  const initialUsername = user.displayUsername ?? user.username ?? "";
  const [username, setUsername] = useState(initialUsername);
  const [emoji, setEmoji] = useState(user.emoji ?? "♠️");
  const [saved, setSaved] = useState({ username: initialUsername, emoji: user.emoji ?? "♠️" });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [editor, setEditor] = useState<"emoji" | "username" | null>(null);
  const saveProfile = useMutation({
    mutationFn: async (profile: { username: string; emoji: string }) => {
      const result = await authClient.updateUser({
        name: profile.username,
        username: profile.username,
        displayUsername: profile.username,
        emoji: profile.emoji,
      });
      if (result.error)
        throw new Error(result.error.message ?? "Couldn’t save your profile. Please try again.");
      return profile;
    },
    onSuccess: (profile) => {
      setUsername(profile.username);
      setSaved(profile);
      setEditor(null);
      toast.success("Profile updated!");
    },
  });
  const changed = username.trim() !== saved.username || emoji !== saved.emoji;
  const error = validationError ?? saveProfile.error?.message;
  const openEditor = (field: "emoji" | "username") => {
    setUsername(saved.username);
    setEmoji(saved.emoji);
    setValidationError(null);
    saveProfile.reset();
    setEditor(field);
  };

  return (
    <div className="profile-form">
      <div className="profile-preview" aria-label="Profile preview">
        <MembershipCard
          name={username.trim() || user.name}
          emoji={emoji}
          onEditEmoji={() => openEditor("emoji")}
          onEditName={() => openEditor("username")}
        />
      </div>
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open && !saveProfile.isPending) {
            setUsername(saved.username);
            setEmoji(saved.emoji);
            setEditor(null);
          }
        }}
      >
        <DialogContent className="profile-editor" showCloseButton={!saveProfile.isPending}>
          <DialogTitle>
            {editor === "emoji" ? "Choose your emoji" : "Edit your username"}
          </DialogTitle>
          <DialogDescription>
            {editor === "emoji"
              ? "A little personality for your membership card."
              : "Your name at the members’ table."}
          </DialogDescription>
          <form
            className="profile-editor-form"
            onSubmit={(event) => {
              event.preventDefault();
              const name = username.trim().normalize("NFC");
              const usernameError = editor === "username" ? profileUsernameError(name) : null;
              if (usernameError) {
                setValidationError(usernameError);
                return;
              }
              setValidationError(null);
              saveProfile.mutate({
                username: editor === "username" ? name : saved.username,
                emoji,
              });
            }}
          >
            {editor === "emoji" && (
              <fieldset disabled={saveProfile.isPending}>
                <legend className="sr-only">Emoji choices</legend>
                <div
                  className="profile-emoji-picker"
                  role="region"
                  aria-label="Emoji choices"
                  tabIndex={0}
                >
                  {PROFILE_EMOJI_GROUPS.map((group) => (
                    <div key={group.label} className="profile-emoji-group">
                      <h2>{group.label}</h2>
                      <div className="profile-emoji-grid">
                        {group.emojis.map((choice) => (
                          <Button
                            key={choice}
                            type="button"
                            variant="ghost"
                            className="profile-emoji-option"
                            aria-label={`Choose ${choice}`}
                            aria-pressed={emoji === choice}
                            onClick={() => {
                              setEmoji(choice);
                              saveProfile.reset();
                            }}
                          >
                            {choice}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}
            {editor === "username" && (
              <div className="profile-username">
                <label htmlFor="profile-username">Username</label>
                <Input
                  id="profile-username"
                  value={username}
                  autoComplete="username"
                  maxLength={1024}
                  aria-describedby="profile-username-hint"
                  aria-invalid={!!error}
                  disabled={saveProfile.isPending}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setValidationError(null);
                    saveProfile.reset();
                  }}
                />
                <p className="profile-hint" id="profile-username-hint">
                  3–30 characters. Any language, emoji, symbols, and spaces welcome.
                </p>
              </div>
            )}
            {error && (
              <p className="legal-error" role="alert">
                {error}
              </p>
            )}
            <div className="profile-editor-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={saveProfile.isPending}
                onClick={() => {
                  setUsername(saved.username);
                  setEmoji(saved.emoji);
                  setEditor(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="gold"
                className="h-11 w-fit rounded-xl px-5"
                disabled={!changed || saveProfile.isPending}
              >
                {saveProfile.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Check aria-hidden="true" />
                )}
                {saveProfile.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
