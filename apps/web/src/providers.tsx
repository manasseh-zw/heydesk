import { Toaster } from "@heydesk/ui/components/sonner";
import { TooltipProvider } from "@heydesk/ui/components/tooltip";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
      storageKey="heydesk-theme"
    >
      <TooltipProvider>
        {children}
        <Toaster richColors />
      </TooltipProvider>
    </ThemeProvider>
  );
}
