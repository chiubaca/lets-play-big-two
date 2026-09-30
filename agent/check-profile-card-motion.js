// Open the enlarged /profile card with reduced motion disabled, then run:
// agent-browser --session profile-review eval --stdin < agent/check-profile-card-motion.js
// This uses the browser's real CSS interpolation, which jsdom cannot exercise.
// oxlint-disable-next-line typescript-eslint/no-floating-promises -- agent-browser awaits this expression.
new Promise((resolve, reject) => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  requestAnimationFrame(() => {
    const dialog = document.querySelector(".profile-card-inspector");
    const stage = dialog?.querySelector(".membership-card-stage");
    const animations = dialog?.getAnimations({ subtree: true }) ?? [];
    animations.forEach((animation) => animation.pause());
    const motion = animations.find(
      (animation) =>
        animation.effect.target === stage && animation.animationName === "profile-card-return",
    );
    if (!motion) {
      animations.forEach((animation) => animation.play());
      reject(new Error("Open the enlarged card with reduced motion disabled first."));
      return;
    }
    const samples = [0, 270, 280, 290, 295, 305, 315, 650].map((time) => {
      animations.forEach((animation) => {
        animation.currentTime = time;
      });
      const matrix = new DOMMatrix(getComputedStyle(motion.effect.target).transform);
      return { time, y: matrix.m42, scale: Math.hypot(matrix.m11, matrix.m12, matrix.m13) };
    });
    const before = Math.abs(samples[3].scale - samples[2].scale) / 10;
    const after = Math.abs(samples[5].scale - samples[4].scale) / 10;
    const speedRatio = Math.max(before, after) / Math.max(Math.min(before, after), 1e-8);
    const monotonicallyShrinks = samples.every(
      (sample, index) => index === 0 || sample.scale <= samples[index - 1].scale + 0.0001,
    );
    const target = document
      .querySelector(".profile-preview .membership-card-stage")
      .getBoundingClientRect();
    const final = stage.getBoundingClientRect();
    const landingError = Math.max(
      Math.abs(final.x - target.x),
      Math.abs(final.y - target.y),
      Math.abs(final.width - target.width),
      Math.abs(final.height - target.height),
    );
    const shrinks = samples[0].scale - samples.at(-1).scale > 0.005;
    const result = {
      pass: speedRatio < 4 && monotonicallyShrinks && shrinks && landingError < 1,
      speedRatio,
      landingError,
      samples,
    };
    animations.forEach((animation) => animation.play());
    if (result.pass) resolve(result);
    else
      reject(new Error(`Card return stutters or reverses its shrink: ${JSON.stringify(result)}`));
  });
});
