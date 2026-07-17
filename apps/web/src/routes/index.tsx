import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceOnboarding } from "@/features/workspace/components/workspace-onboarding";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return <WorkspaceOnboarding />;
}
