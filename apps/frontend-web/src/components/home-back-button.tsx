import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "~/lib/utils";
import "./home-back-button.css";

export function HomeBackButton({ className, onBack }: { className?: string; onBack?: () => void }) {
  const classes = cn("home-back-button", className);
  return onBack ? (
    <button type="button" className={classes} aria-label="Back home" onClick={onBack}>
      <ArrowLeft aria-hidden="true" />
    </button>
  ) : (
    <Link to="/" className={classes} aria-label="Back home">
      <ArrowLeft aria-hidden="true" />
    </Link>
  );
}
