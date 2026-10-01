import { useMutation } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [inspecting, setInspecting] = useState(false);
  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [inspectionSize, setInspectionSize] = useState({ width: 440, height: 266, zoom: 1 });
  const previewRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);
  const measureInspection = useCallback(() => {
    const preview = previewRef.current?.querySelector(".membership-card-stage");
    if (!preview) return;
    const { width, height } = preview.getBoundingClientRect();
    if (!width || !height) return;
    const availableWidth =
      window.innerWidth <= 600 ? window.innerWidth - 16 : Math.min(656, window.innerWidth - 56);
    setInspectionSize({
      width,
      height,
      zoom: Math.min(availableWidth / width, (window.innerHeight - 160) / height),
    });
  }, []);
  useEffect(() => {
    if (!inspecting) return;
    window.addEventListener("resize", measureInspection);
    return () => window.removeEventListener("resize", measureInspection);
  }, [inspecting, measureInspection]);
  const changeInspection = (open: boolean) => {
    if (open) {
      const preview = previewRef.current?.querySelector<HTMLElement>(".membership-card-stage");
      if (preview) {
        preview.removeAttribute("data-interacting");
        preview.style.setProperty("--rotate-x", "0deg");
        preview.style.setProperty("--rotate-y", "0deg");
        measureInspection();
      }
      setInspectorVisible(true);
    }
    if (!open) {
      const inspector = inspectorRef.current;
      const preview = previewRef.current?.querySelector(".membership-card-stage");
      const enlarged = inspector?.querySelector<HTMLElement>(".membership-card-stage");
      const zoom = inspector?.querySelector(".profile-card-zoom");
      if (inspector && preview && enlarged && zoom) {
        enlarged
          .querySelector<HTMLButtonElement>(".membership-card-inspect")
          ?.focus({ preventScroll: true });
        enlarged.removeAttribute("data-interacting");
        const previewStyle = getComputedStyle(preview);
        for (const property of ["--pointer-x", "--pointer-y", "--foil-x", "--foil-y"]) {
          enlarged.style.setProperty(property, previewStyle.getPropertyValue(property));
        }
        const turner = enlarged.querySelector(".membership-card-turner");
        if (turner) {
          inspector.style.setProperty(
            "--card-return-start",
            getComputedStyle(turner).transform || "none",
          );
        }
        const target = preview.getBoundingClientRect();
        const source = zoom.getBoundingClientRect();
        if (source.width && source.height) {
          inspector.style.setProperty(
            "--card-return-x",
            `${target.x + target.width / 2 - source.x - source.width / 2}px`,
          );
          inspector.style.setProperty(
            "--card-return-y",
            `${target.y + target.height / 2 - source.y - source.height / 2}px`,
          );
          inspector.style.setProperty("--card-return-scale-x", `${target.width / source.width}`);
          inspector.style.setProperty("--card-return-scale-y", `${target.height / source.height}`);
        }
      }
    }
    setInspecting(open);
  };
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
      <div
        className="profile-preview"
        aria-label="Profile preview"
        ref={previewRef}
        data-inspecting={inspectorVisible}
      >
        <MembershipCard
          name={username.trim() || user.name}
          emoji={emoji}
          onEditEmoji={() => openEditor("emoji")}
          onEditName={() => openEditor("username")}
          onInspect={() => changeInspection(true)}
          interactive={!inspectorVisible}
        />
      </div>
      <p className="profile-card-caption">Your seat at the members’ table.</p>
      <Dialog open={inspecting} onOpenChange={changeInspection}>
        <DialogContent
          ref={inspectorRef}
          className="profile-card-inspector"
          overlayClassName="profile-card-inspector-overlay"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            setInspectorVisible(false);
            // Reveal before restoring focus; React applies the state update after this callback.
            previewRef.current?.setAttribute("data-inspecting", "false");
            previewRef.current
              ?.querySelector<HTMLButtonElement>(".membership-card-inspect")
              ?.focus();
          }}
        >
          <DialogTitle className="sr-only">Your membership card</DialogTitle>
          <div
            className="profile-card-zoom"
            style={{
              width: inspectionSize.width * inspectionSize.zoom,
              height: inspectionSize.height * inspectionSize.zoom,
            }}
          >
            <div
              className="profile-card-zoom-layout"
              style={{ width: inspectionSize.width, transform: `scale(${inspectionSize.zoom})` }}
            >
              <MembershipCard
                name={saved.username || user.name}
                emoji={saved.emoji}
                enlarged
                interactive={inspecting}
                onInspect={() => changeInspection(false)}
                onEditName={() => changeInspection(false)}
                onEditEmoji={() => changeInspection(false)}
              />
            </div>
          </div>
          <DialogDescription className="profile-card-inspector-hint">
            Move across the card to catch the light. Close to return to your profile.
          </DialogDescription>
        </DialogContent>
      </Dialog>
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
          <div className="profile-editor-heading">
            {editor === "emoji" && (
              <span className="profile-emoji-preview" aria-label={`Selected emoji: ${emoji}`}>
                {emoji}
              </span>
            )}
            <DialogTitle>
              {editor === "emoji" ? "Choose your emoji" : "Edit your username"}
            </DialogTitle>
          </div>
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
                <p className="profile-emoji-scroll-hint" id="profile-emoji-scroll-hint">
                  Scroll for more — find your table personality.
                </p>
                <div
                  className="profile-emoji-picker"
                  role="region"
                  aria-label="Emoji choices"
                  aria-describedby="profile-emoji-scroll-hint"
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
                            {emoji === choice && (
                              <Check className="profile-emoji-check" aria-hidden="true" />
                            )}
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
