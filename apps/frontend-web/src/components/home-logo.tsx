import "./home-logo.css";

export function HomeLogo() {
  return (
    <h1 className="home-logo-title" aria-label="Big Two Crew">
      <span className="home-logo-emblem" aria-hidden="true">
        <img src="/title-logo.png" alt="" />
      </span>
      <img className="home-logo-text" src="/title-text.png" alt="" aria-hidden="true" />
      <img className="home-logo-crew" src="/title-crew.png" alt="" aria-hidden="true" />
    </h1>
  );
}
