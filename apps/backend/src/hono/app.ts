import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "../lib/auth";

export const App = new Hono<{ Bindings: Cloudflare.Env }>();

App.use(
  "*",
  cors({
    origin: ["https://local.bigtwo.com"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

App.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

App.get("/", async (c) => {
  return c.text("Hello, World!!!!!!!!!");
});
