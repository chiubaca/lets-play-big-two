import { Hono } from "hono";
import { auth } from "../lib/auth";

export const App = new Hono<{ Bindings: Cloudflare.Env }>();

App.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

App.get("/", async (c) => {
  return c.text("Hello, World!!!!!!!!!");
});
