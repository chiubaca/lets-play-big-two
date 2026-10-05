export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  json?: unknown;
}

export function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error("Could not connect. Please try again.");
}

export function authenticatedHeaders(
  cookie: string,
  origin: string,
  initial?: HeadersInit,
): Headers {
  const headers = new Headers(initial);
  headers.set("Origin", origin);
  headers.delete("Cookie");
  if (cookie) headers.set("Cookie", cookie);
  return headers;
}

// Paths stay on the configured backend: never forward a SecureStore cookie to
// an arbitrary absolute URL supplied by a caller.
export function apiUrl(baseURL: string, path: string): string {
  if (!path.startsWith("/api/") || path.includes("\\")) throw new Error("Expected an API path");
  const base = new URL(baseURL);
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password)
    throw new Error("Invalid backend URL");
  const url = new URL(path, base);
  if (url.origin !== base.origin || !url.pathname.startsWith("/api/"))
    throw new Error("Expected a same-origin API path");
  return url.toString();
}

export function createRequest({
  baseURL,
  origin,
  getCookie,
  fetcher = fetch,
}: {
  baseURL: string;
  origin: string;
  getCookie: () => string | Promise<string>;
  fetcher?: typeof fetch;
}) {
  return async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = apiUrl(baseURL, path);
    const { json, ...init } = options;
    const headers = authenticatedHeaders(await getCookie(), origin, init.headers);
    headers.set("Accept", "application/json");
    if (json !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetcher(url, {
      ...init,
      headers,
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      // Native cookie jars must not override the official Expo cookie bridge.
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (response.ok && response.status !== 204)
        throw new ApiError("The server returned an invalid response", response.status, null);
    }
    if (!response.ok) {
      const message =
        body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : response.status === 404
            ? "This room could not be found."
            : "Could not complete the request. Please try again.";
      throw new ApiError(message, response.status, body);
    }
    return body as T;
  };
}
