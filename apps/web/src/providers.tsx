import { Toaster } from "@heydesk/ui/components/sonner";
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
      {children}
      <Toaster richColors />
    </ThemeProvider>
  );
}
