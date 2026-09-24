import { lazy, Suspense } from "react";
import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import TanStackQueryProvider from "../integrations/tanstack-query/root-provider";

import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";

import { Toaster } from "~/components/ui/sonner";
import { JevDevtoolsProvider } from "~/components/game-room/jev-devtools-context";

import appCss from "../styles.css?url";

import type { QueryClient } from "@tanstack/react-query";

interface MyRouterContext {
  queryClient: QueryClient;
}

const THEME_INIT_SCRIPT = `(function(){try{var root=document.documentElement;root.classList.remove('light');root.classList.add('dark');root.style.colorScheme='dark';}catch(e){}})();`;
const SERVICE_WORKER_SCRIPT = `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/service-worker.js');});}`;

const LazyJevDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("~/components/game-room/jev-devtools").then(({ JevDevtools }) => ({
        default: JevDevtools,
      })),
    )
  : null;

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      {
        title: "Big Two Crew",
      },
      {
        name: "description",
        content:
          "The classic four-player Chinese card game - refined, real-time, and ready when you are.",
      },
      {
        name: "application-name",
        content: "Big Two Crew",
      },
      {
        name: "theme-color",
        content: "#030e09",
      },
      {
        name: "mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "apple-mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      {
        name: "apple-mobile-web-app-title",
        content: "Big Two Crew",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "manifest",
        href: "/manifest.webmanifest",
      },
      {
        rel: "icon",
        href: "/favicon.ico",
        sizes: "any",
      },
      {
        rel: "icon",
        href: "/favicon-32x32.png",
        type: "image/png",
        sizes: "32x32",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
        sizes: "180x180",
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased wrap-anywhere selection:bg-gold/30">
        <TanStackQueryProvider>
          <JevDevtoolsProvider>
            {children}
            <Toaster
              toastOptions={{
                className: "border-gold/30 bg-card/95 text-foreground",
              }}
            />
            <TanStackDevtools
              config={{
                position: "bottom-right",
              }}
              plugins={[
                {
                  name: "Tanstack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                },
                TanStackQueryDevtools,
                ...(LazyJevDevtools
                  ? [
                      {
                        name: "Jev Decisions",
                        render: (
                          <Suspense fallback={null}>
                            <LazyJevDevtools />
                          </Suspense>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </JevDevtoolsProvider>
        </TanStackQueryProvider>
        <script dangerouslySetInnerHTML={{ __html: SERVICE_WORKER_SCRIPT }} />
        <Scripts />
      </body>
    </html>
  );
}
