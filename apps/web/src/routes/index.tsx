import { createFileRoute } from "@tanstack/react-router";
import { Blocks, FilePenLine, Sparkles } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@heydesk/ui/components/card";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <main className="min-h-0 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-6 py-12 md:py-20">
        <section className="relative isolate overflow-hidden rounded-[2rem] bg-primary px-7 py-10 text-primary-foreground shadow-lg shadow-primary/10 md:px-12 md:py-16">
          <div className="relative z-10 max-w-2xl">
            <p className="mb-5 text-xs font-semibold tracking-[0.24em] uppercase opacity-75">
              Your local workspace
            </p>
            <h1 className="font-heading text-4xl leading-tight font-semibold tracking-tight md:text-6xl">
              Make space for better work.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 opacity-85 md:text-lg">
              Heydesk helps you turn everyday context into organized, editable
              results with a local-first AI workspace.
            </p>
          </div>
          <div
            aria-hidden="true"
            className="absolute -right-20 -bottom-32 size-80 rounded-full bg-white/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute top-10 right-20 size-24 rounded-full border border-white/30"
          />
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <Sparkles className="mb-3 size-5 text-primary" />
              <CardTitle>Capture context</CardTitle>
              <CardDescription>Bring the messy starting point with you.</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Keep ideas, notes, and source material close to the work they inform.
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <FilePenLine className="mb-3 size-5 text-primary" />
              <CardTitle>Shape useful results</CardTitle>
              <CardDescription>Work alongside an assistant you can direct.</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Ask for a first draft, a clearer structure, or the next practical step.
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <Blocks className="mb-3 size-5 text-primary" />
              <CardTitle>Stay in control</CardTitle>
              <CardDescription>Keep the result editable and local.</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Your workspace remains durable, inspectable, and ready to build on.
            </CardContent>
          </Card>
        </section>

        <p className="mt-auto pt-12 text-sm text-muted-foreground">
          Press <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs">D</kbd>{" "}
          anytime to switch between light and dark mode.
        </p>
      </div>
    </main>
  );
}
