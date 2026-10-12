import { membershipGradient } from "./membership-card-motion";

export interface MembershipCardLighting {
  x: number;
  y: number;
  foilX: number;
  foilY: number;
  active: boolean;
}

export const restingCardLight: MembershipCardLighting = {
  x: 0.65,
  y: 0.25,
  foilX: 0.5,
  foilY: 0.5,
  active: false,
};

// Native color-dodge has more gain than the browser's masked/filter-composited foil.
// Calibrate intensity instead of masking away parts of the card's surface.
export const foilIntensity = { idle: 0.11, active: 0.22 };
export const glareIntensity = { idle: 0.07, active: 0.14 };

// Same colors, repeating stops, image sizes and angles as membership-card.css.
export const foilColors = ["#f5a9c5", "#efd58d", "#a3e5b0", "#85dce5", "#b5a5e8"];
export const foilStops = Array.from({ length: 9 }, (_, index) => ({
  offset: index * 0.12,
  color: foilColors[index % foilColors.length]!,
})).concat({ offset: 1, color: "#95cae6" });
export const metalStops = Array.from({ length: 10 }, (_, repeat) =>
  [
    { offset: 0, color: "#071712" },
    { offset: 0.028, color: "#92aaa1" },
    { offset: 0.035, color: "#d1ece0" },
    { offset: 0.042, color: "#92aaa1" },
    { offset: 0.07, color: "#071712" },
  ].map((stop) => ({ ...stop, offset: repeat * 0.1 + stop.offset })),
)
  .flat()
  .concat({ offset: 1, color: "#071712" });

export function membershipFoilGeometry(
  width: number,
  height: number,
  light: MembershipCardLighting,
) {
  "worklet";
  const background = (angle: number, scale: number) => {
    const gradient = membershipGradient(width * scale, height * scale, angle);
    const x = width * (1 - scale) * light.foilX;
    const y = height * (1 - scale) * light.foilY;
    return {
      ...gradient,
      x1: gradient.x1 + x,
      x2: gradient.x2 + x,
      y1: gradient.y1 + y,
      y2: gradient.y2 + y,
    };
  };
  return {
    rainbow: background(115, 3.5),
    metal: background(137, 2.5),
    reflection: background(115, 2.5),
    lightX: width * light.x,
    lightY: height * light.y,
    lightRadius: Math.hypot(
      width * Math.max(light.x, 1 - light.x),
      height * Math.max(light.y, 1 - light.y),
    ),
  };
}
