export const colors = {
  background: "#030e09",
  panel: "#071b10",
  felt: "#06462a",
  gold: "#f4ce78",
  goldDark: "#a5681f",
  cream: "#f9e8b9",
  muted: "#cdb77f",
  line: "rgba(241,201,106,0.35)",
  pink: "#f20b90",
  red: "#b91e25",
};

export const fonts = {
  body: "Inter",
  strong: "InterSemiBold",
  display: "Fraunces",
  mono: "IBMPlexMono",
};

export const artwork = {
  portrait: require("../../assets/vertical-bg.png"),
  landscape: require("../../assets/desktop-bg.png"),
  spade: require("../../assets/title-logo.png"),
  title: require("../../assets/title-text.png"),
  crew: require("../../assets/title-crew.png"),
  pass: require("../../assets/title-pass-and-play.png"),
  winner: require("../../assets/winner.png"),
  loser: require("../../assets/too-bad.png"),
};

// SVG image elements decode their full source dimensions. Card-sized copies
// prevent the SVGs from continually evicting each other's decoded logo assets.
export const membershipArtwork = {
  spade: require("../../assets/membership-card-logo.png"),
  title: require("../../assets/membership-card-title.png"),
  crew: require("../../assets/membership-card-crew.png"),
};
