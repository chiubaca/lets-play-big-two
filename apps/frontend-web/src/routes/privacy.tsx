import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "~/components/legal-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy · Big Two Crew" },
      {
        name: "description",
        content: "How Big Two Crew collects, uses, and deletes personal data.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage eyebrow="Effective 19 September 2026" title="Privacy policy">
      <div className="legal-content">
        <p>
          This policy explains how Big Two Crew handles information when you play on the web or in
          the Android app. You can play solo or pass-and-play without creating an account.
        </p>

        <section>
          <h2>Information we collect</h2>
          <ul>
            <li>
              If you create an account, we store your name, username, email address, authentication
              details, and optional profile image. Passwords are stored as secure hashes, not as
              readable passwords.
            </li>
            <li>
              We process session information such as IP address, browser or device details, and
              sign-in cookies to secure your account and prevent abuse.
            </li>
            <li>
              We process room codes, player names, and game actions needed to run online matches.
            </li>
            <li>
              Basic usage and diagnostic data may be collected to keep the service reliable and
              understand aggregate traffic.
            </li>
          </ul>
        </section>

        <section>
          <h2>How we use information</h2>
          <p>
            We use this information to authenticate players, operate online rooms, maintain service
            security, respond to support requests, and improve reliability. We do not sell personal
            information or use it for targeted advertising.
          </p>
        </section>

        <section>
          <h2>Service providers</h2>
          <p>
            Cloudflare provides hosting, security, analytics, real-time game infrastructure, and AI
            processing for the optional Jev opponent. If you choose Google sign-in, Google processes
            that sign-in under its own privacy policy. These providers receive only the information
            needed to deliver their services.
          </p>
        </section>

        <section>
          <h2>Storage and retention</h2>
          <p>
            Account and authentication records are kept while your account is active. Operational
            records and security logs are retained only as needed to run and protect the service. If
            you delete your account, your player name and account ID are replaced in saved online
            rooms; anonymised game state may remain as an operational record. Local game state and
            preferences may remain on your device until you clear the app or browser data.
          </p>
        </section>

        <section>
          <h2>Your choices</h2>
          <p>
            You can play local modes without an account. You can permanently delete an account and
            its associated authentication data from the{" "}
            <a href="/account">account and data deletion page</a>. You may also contact us with a
            privacy or deletion request.
          </p>
        </section>

        <section>
          <h2>Children</h2>
          <p>
            Big Two Crew is not directed to children under 13, and we do not knowingly collect their
            personal information. Contact us if you believe a child has provided personal
            information.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Questions or requests can be sent to{" "}
            <a href="mailto:alexchiu11@gmail.com">alexchiu11@gmail.com</a>.
          </p>
        </section>
      </div>
    </LegalPage>
  );
}
