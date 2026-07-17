import { createRouter } from "@tanstack/react-router";

import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultPendingComponent: () => <Loader />,
  context: {},
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
