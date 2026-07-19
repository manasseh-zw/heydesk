import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { Providers } from "@/providers";

import "../index.css";

export type RouterAppContext = Record<string, never>;

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "heydesk",
      },
      {
        name: "description",
        content:
          "A local-first workspace for turning context into useful work.",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  const isDesktop =
    typeof window !== "undefined" && Boolean(window.heydeskDesktop);

  return (
    <>
      <HeadContent />
      <Providers>
        <div className="relative h-svh overflow-hidden">
          {isDesktop && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 z-50 h-2 [-webkit-app-region:drag]"
            />
          )}
          <div className="h-full min-h-0">
            <Outlet />
          </div>
        </div>
      </Providers>
      {!isDesktop && <TanStackRouterDevtools position="bottom-left" />}
    </>
  );
}
