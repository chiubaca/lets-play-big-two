// Open the enlarged /profile card with reduced motion disabled, then run:
// agent-browser --session profile-review eval --stdin < agent/check-profile-card-motion.js
// This uses the browser's real CSS interpolation, which jsdom cannot exercise.
// oxlint-disable-next-line typescript-eslint/no-floating-promises -- agent-browser awaits this expression.
new Promise((resolve, reject) => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  requestAnimationFrame(() => {
    const dialog = document.querySelector(".profile-card-inspector");
    const stage =
      dialog?.querySelector(".profile-card-zoom") ??
      dialog?.querySelector(".membership-card-stage");
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
    const preview = document.querySelector(".profile-preview");
    const details = [
      ".membership-card-brand",
      ".membership-card-name",
      ".membership-card-seal",
      ".membership-card-footer",
      ".membership-card-watermark",
      ".membership-card-edit-icon",
    ];
    const detailErrors = details.flatMap((selector) => {
      const originals = [...preview.querySelectorAll(selector)];
      const returns = [...dialog.querySelectorAll(selector)];
      if (!originals.length || originals.length !== returns.length)
        return [{ selector, error: "missing element" }];
      return originals.map((original, index) => {
        const a = original.getBoundingClientRect();
        const b = returns[index].getBoundingClientRect();
        return {
          selector,
          error: Math.max(
            Math.abs(a.x - b.x),
            Math.abs(a.y - b.y),
            Math.abs(a.width - b.width),
            Math.abs(a.height - b.height),
          ),
        };
      });
    });
    const seamless = detailErrors.every(
      (detail) => typeof detail.error === "number" && detail.error < 0.05,
    );
    const styleErrors = [
      ".membership-card",
      ".membership-card-foil",
      ".membership-card-glare",
      ".membership-card-watermark",
      ...details,
    ].flatMap((selector) => {
      return [...preview.querySelectorAll(selector)].flatMap((original, index) => {
        const returned = dialog.querySelectorAll(selector)[index];
        if (!returned)
          return [{ selector, property: "element", original: "present", returned: "missing" }];
        return [null, ...(selector === ".membership-card" ? ["::before", "::after"] : [])].flatMap(
          (pseudo) => {
            const a = getComputedStyle(original, pseudo);
            const b = getComputedStyle(returned, pseudo);
            return [
              "opacity",
              "box-shadow",
              "border-radius",
              "background-image",
              "background-position",
              "line-height",
              "font-family",
              "font-size",
              "font-weight",
              "color",
              "border-color",
            ]
              .filter((property) => a.getPropertyValue(property) !== b.getPropertyValue(property))
              .map((property) => ({
                selector,
                property,
                original: a.getPropertyValue(property),
                returned: b.getPropertyValue(property),
              }));
          },
        );
      });
    });
    const imageSources = (root) =>
      [...root.querySelectorAll("img")].map((image) => image.getAttribute("src"));
    const sameArtwork =
      JSON.stringify(imageSources(preview)) === JSON.stringify(imageSources(dialog));
    const result = {
      pass:
        speedRatio < 4 &&
        monotonicallyShrinks &&
        shrinks &&
        landingError < 1 &&
        seamless &&
        styleErrors.length === 0 &&
        sameArtwork,
      speedRatio,
      landingError,
      detailErrors,
      styleErrors,
      samples,
    };
    animations.forEach((animation) => animation.play());
    if (result.pass) resolve(result);
    else
      reject(new Error(`Card return stutters or reverses its shrink: ${JSON.stringify(result)}`));
  });
});
