import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { CasinoBackdrop } from "~/components/casino/casino";
import "./legal-page.css";

export function LegalPage({
  children,
  eyebrow,
  title,
  backControl,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  backControl?: ReactNode;
}) {
  return (
    <main className="legal-page">
      <CasinoBackdrop />
      <div className="legal-shell">
        {backControl ?? (
          <Link to="/" className="legal-back">
            <ArrowLeft aria-hidden="true" />
            Back to Big Two Crew
          </Link>
        )}
        <article className="legal-card">
          <header>
            <p>{eyebrow}</p>
            <h1>{title}</h1>
          </header>
          {children}
        </article>
      </div>
    </main>
  );
}
