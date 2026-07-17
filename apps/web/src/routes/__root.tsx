import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import Header from "@/components/header";
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
        content: "A local-first workspace for turning context into useful work.",
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
  return (
    <>
      <HeadContent />
      <Providers>
        <div className="grid h-svh grid-rows-[auto_1fr]">
          <Header />
          <Outlet />
        </div>
      </Providers>
      <TanStackRouterDevtools position="bottom-left" />
    </>
  );
}
