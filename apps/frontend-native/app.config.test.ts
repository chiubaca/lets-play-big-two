import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function configFor(variant: string | undefined) {
  vi.resetModules();
  vi.stubEnv("EXPO_PUBLIC_APP_VARIANT", variant);
  return (await import("./app.config")).default;
}

it("keeps the production identity when no variant is selected", async () => {
  const config = await configFor(undefined);
  expect(config.name).toBe("Big Two Crew");
  expect(config.android?.package).toBe("com.chiubaca.bigtwocrew");
  expect(config.ios?.bundleIdentifier).toBe("com.chiubaca.bigtwocrew");
  expect(config.scheme).toBe("bigtwocrew");
});

it("isolates development installations and links from production", async () => {
  const production = await configFor(undefined);
  const development = await configFor("development");
  expect(development.name).toBe("Big Two Crew Dev");
  expect(development.android?.package).toBe("com.chiubaca.bigtwocrew.dev");
  expect(development.android?.package).not.toBe(production.android?.package);
  expect(development.ios?.bundleIdentifier).toBe("com.chiubaca.bigtwocrew.dev");
  expect(development.scheme).toBe("bigtwocrew-dev");
  expect(development.android?.intentFilters).toEqual([]);
  expect(development.ios?.associatedDomains).toEqual([]);
  const { NATIVE_SCHEME, NATIVE_ORIGIN } = await import("./src/network/config");
  expect(NATIVE_SCHEME).toBe(development.scheme);
  expect(NATIVE_ORIGIN).toBe("bigtwocrew-dev://");
});

it("does not reuse production Firebase configuration in the development app", async () => {
  vi.stubEnv("GOOGLE_SERVICES_JSON", "./production-firebase.json");
  vi.stubEnv("DEV_GOOGLE_SERVICES_JSON", undefined);
  expect((await configFor(undefined)).android?.googleServicesFile).toBe(
    "./production-firebase.json",
  );
  expect((await configFor("development")).android?.googleServicesFile).toBeUndefined();
  vi.stubEnv("DEV_GOOGLE_SERVICES_JSON", "./development-firebase.json");
  expect((await configFor("development")).android?.googleServicesFile).toBe(
    "./development-firebase.json",
  );
});

it("fails closed instead of silently building production for an invalid variant", async () => {
  await expect(configFor("developmnt")).rejects.toThrow("EXPO_PUBLIC_APP_VARIANT");
});
