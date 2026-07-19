import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  shell,
  utilityProcess,
  type IpcMainInvokeEvent,
  type UtilityProcess,
} from "electron";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";

type ServerReadyMessage = {
  type: "server-ready";
  origin: string;
};

type ServerConnection = {
  apiOrigin: string;
  bootstrapToken: string;
};

const serverStartupTimeoutMs = 20_000;
const openWorkspaceFolderChannel = "heydesk:dialog:open-workspace-folder";
let mainWindow: BrowserWindow | null = null;
let serverProcess: UtilityProcess | null = null;
let serverConnection: ServerConnection | null = null;
let isQuitting = false;

app.setName("Heydesk");

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) app.quit();

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  denyUnexpectedPermissions();
  registerDesktopHandlers();

  try {
    const connection = await startServer();
    mainWindow = createWindow(connection.apiOrigin);
    await loadRenderer(mainWindow, connection);
  } catch (error) {
    console.error("Heydesk failed to start", error);
    app.exit(1);
  }
});

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
    return;
  }
  void startServer().then(async (connection) => {
    mainWindow = createWindow(connection.apiOrigin);
    await loadRenderer(mainWindow, connection);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  void stopServer().finally(() => app.quit());
});

async function startServer(): Promise<ServerConnection> {
  if (serverProcess && serverConnection) return serverConnection;
  if (serverProcess) throw new Error("The Heydesk server is already starting.");

  const serverEntry = getServerEntry();
  if (!existsSync(serverEntry)) {
    throw new Error(`Heydesk server bundle is missing at ${serverEntry}.`);
  }

  const rendererDirectory = app.isPackaged
    ? join(process.resourcesPath, "renderer")
    : undefined;
  const developmentRendererUrl = process.env.ELECTRON_RENDERER_URL;
  const bootstrapToken = randomBytes(32).toString("hex");
  const corsOrigin = developmentRendererUrl
    ? new URL(developmentRendererUrl).origin
    : "http://127.0.0.1";

  serverProcess = utilityProcess.fork(serverEntry, [], {
    env: {
      ...process.env,
      CORS_ORIGIN: corsOrigin,
      DATABASE_URL: `file:${join(app.getPath("userData"), "heydesk.sqlite")}`,
      HEYDESK_BOOTSTRAP_TOKEN: bootstrapToken,
      ...(rendererDirectory ? { HEYDESK_RENDERER_DIR: rendererDirectory } : {}),
      NODE_ENV: app.isPackaged ? "production" : "development",
    },
    serviceName: "Heydesk Local Server",
    stdio: "pipe",
  });

  pipeServerLogs(serverProcess);

  const processForServer = serverProcess;
  return new Promise<ServerConnection>((complete, fail) => {
    const timeout = setTimeout(() => {
      finish(() => {
        processForServer.kill();
        serverProcess = null;
        fail(new Error("Heydesk local server did not become ready in time."));
      });
    }, serverStartupTimeoutMs);

    const finish = (callback: () => void) => {
      clearTimeout(timeout);
      processForServer.removeListener("message", onMessage);
      processForServer.removeListener("exit", onExit);
      callback();
    };
    const onMessage = (message: unknown) => {
      if (!isServerReadyMessage(message)) return;
      finish(() => {
        serverConnection = { apiOrigin: message.origin, bootstrapToken };
        processForServer.once("exit", handleUnexpectedServerExit);
        complete(serverConnection);
      });
    };
    const onExit = (code: number) => {
      finish(() => {
        serverProcess = null;
        fail(new Error(`Heydesk local server exited with code ${code}.`));
      });
    };

    processForServer.on("message", onMessage);
    processForServer.once("exit", onExit);
  });
}

function createWindow(apiOrigin: string): BrowserWindow {
  const window = new BrowserWindow({
    backgroundColor: "#ffffff",
    height: 900,
    minHeight: 640,
    minWidth: 960,
    show: false,
    title: "Heydesk",
    width: 1440,
    webPreferences: {
      additionalArguments: [
        `--heydesk-api-origin=${apiOrigin}`,
        `--heydesk-app-version=${app.getVersion()}`,
      ],
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadEntry(),
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    mainWindow = null;
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const allowedOrigin = process.env.ELECTRON_RENDERER_URL
      ? new URL(process.env.ELECTRON_RENDERER_URL).origin
      : apiOrigin;
    if (new URL(url).origin !== allowedOrigin) {
      event.preventDefault();
      if (isExternalWebUrl(url)) void shell.openExternal(url);
    }
  });

  return window;
}

function registerDesktopHandlers(): void {
  ipcMain.removeHandler(openWorkspaceFolderChannel);
  ipcMain.handle(
    openWorkspaceFolderChannel,
    async (event: IpcMainInvokeEvent): Promise<string | null> => {
      if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
        throw new Error("The folder picker is not available for this window.");
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        buttonLabel: "Open workspace",
        message: "Choose a folder to open in Heydesk",
        properties: ["openDirectory"],
        title: "Open existing workspace",
      });

      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  );
}

async function loadRenderer(
  window: BrowserWindow,
  connection: ServerConnection,
): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
    return;
  }
  await window.loadURL(
    `${connection.apiOrigin}/desktop/bootstrap?token=${encodeURIComponent(connection.bootstrapToken)}`,
  );
}

async function stopServer(): Promise<void> {
  const processToStop = serverProcess;
  serverProcess = null;
  serverConnection = null;
  if (!processToStop) return;

  await new Promise<void>((complete) => {
    const timeout = setTimeout(() => {
      processToStop.kill();
      complete();
    }, 5_000);
    processToStop.once("exit", () => {
      clearTimeout(timeout);
      complete();
    });
    processToStop.postMessage({ type: "shutdown" });
  });
}

function handleUnexpectedServerExit(code: number): void {
  serverProcess = null;
  serverConnection = null;
  if (isQuitting) return;
  console.error(`Heydesk local server stopped unexpectedly with code ${code}.`);
  app.quit();
}

function getServerEntry(): string {
  if (app.isPackaged) return join(process.resourcesPath, "server/desktop.mjs");
  return resolve(app.getAppPath(), "../server/dist/desktop.mjs");
}

function getPreloadEntry(): string {
  return join(import.meta.dirname, "../preload/preload.cjs");
}

function pipeServerLogs(process: UtilityProcess): void {
  process.stdout?.on("data", (chunk: Buffer) => {
    console.log(`[server] ${chunk.toString().trimEnd()}`);
  });
  process.stderr?.on("data", (chunk: Buffer) => {
    console.error(`[server] ${chunk.toString().trimEnd()}`);
  });
}

function denyUnexpectedPermissions(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );
}

function isExternalWebUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isServerReadyMessage(value: unknown): value is ServerReadyMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === "server-ready" && typeof candidate.origin === "string"
  );
}
