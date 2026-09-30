import { ChevronDown, Pencil } from "lucide-react";
import { useCardHolography } from "./use-card-holography";
import { HomeLogo } from "./home-logo";
import "./membership-card.css";

export function MembershipCard({
  name,
  emoji,
  compact = false,
  enlarged = false,
  onInspect,
  onEditEmoji,
  onEditName,
}: {
  name: string;
  emoji: string;
  compact?: boolean;
  enlarged?: boolean;
  onInspect?: () => void;
  onEditEmoji?: () => void;
  onEditName?: () => void;
}) {
  const holography = useCardHolography(!compact);
  return (
    <span
      className={`membership-card-stage${compact ? " membership-card-stage--compact" : ""}${enlarged ? " membership-card-stage--enlarged" : ""}`}
      {...holography}
    >
      <span className="membership-card-turner">
        <span className={`membership-card${compact ? " membership-card--compact" : ""}`}>
          {!compact && (
            <>
              <span className="membership-card-foil" aria-hidden="true" />
              <span className="membership-card-glare" aria-hidden="true" />
              <span className="membership-card-watermark" aria-hidden="true" />
            </>
          )}
          {onInspect && !compact && (
            <button
              type="button"
              className="membership-card-inspect"
              onClick={onInspect}
              aria-label={enlarged ? "Return to your profile" : "Zoom in on your membership card"}
            />
          )}
          <span className="membership-card-brand">
            <span className="sr-only">Big Two Crew</span>
            <img
              className="membership-card-brand-emblem"
              src="/title-logo.png"
              alt=""
              width={1280}
              height={1280}
              draggable={false}
            />
            <span className="membership-card-wordmark" aria-hidden="true">
              <img
                className="membership-card-brand-text"
                src="/title-text.png"
                alt=""
                width={1456}
                height={1056}
                draggable={false}
              />
              <img
                className="membership-card-brand-crew"
                src="/title-crew.png"
                alt=""
                width={1456}
                height={1056}
                draggable={false}
              />
            </span>
          </span>
          {onEditEmoji ? (
            <button
              type="button"
              className="membership-card-seal membership-card-edit"
              onClick={onEditEmoji}
              aria-label="Edit profile emoji"
            >
              <span aria-hidden="true">{emoji}</span>
              <Pencil className="membership-card-edit-icon" aria-hidden="true" />
            </button>
          ) : (
            <span className="membership-card-seal" aria-hidden="true">
              {emoji}
            </span>
          )}
          <span className="membership-card-identity">
            <span className="membership-card-label">{compact ? "Member" : "Club member"}</span>
            {onEditName ? (
              <button
                type="button"
                className="membership-card-name membership-card-edit"
                onClick={onEditName}
                aria-label={`Edit username, currently ${name}`}
              >
                <span>{name}</span>
                <Pencil className="membership-card-edit-icon" aria-hidden="true" />
              </button>
            ) : (
              <strong className="membership-card-name">{name}</strong>
            )}
          </span>
          {compact ? (
            <ChevronDown className="membership-card-chevron" aria-hidden="true" />
          ) : (
            <span className="membership-card-footer">
              <span>
                Big Two Crew<span aria-hidden="true">/</span> 鋤大弟
              </span>
              <span aria-hidden="true">♠ · ♥ · ♣ · ♦</span>
            </span>
          )}
        </span>
        {!compact && (
          <span className="membership-card membership-card-back" aria-hidden="true">
            <HomeLogo />
          </span>
        )}
      </span>
    </span>
  );
}
