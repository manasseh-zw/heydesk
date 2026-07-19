import { env } from "@heydesk/env/web";

export function getServerUrl(): string {
  return (
    (typeof window === "undefined"
      ? undefined
      : window.heydeskDesktop?.apiOrigin) ?? env.VITE_SERVER_URL
  );
}

declare global {
  interface Window {
    heydeskDesktop?: {
      apiOrigin: string;
      appVersion: string;
      pickWorkspaceFolder: () => Promise<string | null>;
      platform: string;
      setWindowMode: (mode: "launcher" | "workspace") => Promise<void>;
    };
  }
}
