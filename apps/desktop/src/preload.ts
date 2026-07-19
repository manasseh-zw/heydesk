import { contextBridge, ipcRenderer } from "electron";

const apiOriginArgument = process.argv.find((argument) =>
  argument.startsWith("--heydesk-api-origin="),
);
const apiOrigin = apiOriginArgument?.slice("--heydesk-api-origin=".length);
const appVersionArgument = process.argv.find((argument) =>
  argument.startsWith("--heydesk-app-version="),
);
const appVersion = appVersionArgument?.slice("--heydesk-app-version=".length);

if (!apiOrigin) throw new Error("Heydesk desktop did not receive its API origin.");
if (!appVersion) throw new Error("Heydesk desktop did not receive its application version.");

contextBridge.exposeInMainWorld("heydeskDesktop", {
  apiOrigin,
  appVersion,
  pickWorkspaceFolder: () =>
    ipcRenderer.invoke("heydesk:dialog:open-workspace-folder") as Promise<string | null>,
  platform: process.platform,
  setWindowMode: (mode: "launcher" | "workspace") =>
    ipcRenderer.invoke("heydesk:window:set-mode", mode) as Promise<void>,
});
