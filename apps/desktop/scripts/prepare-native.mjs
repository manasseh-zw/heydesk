import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(desktopRoot, "../..");
const requestedTarget = process.argv[2];

if (!requestedTarget) {
  throw new Error("Pass the libsql native target to prepare-native.mjs.");
}

const target = requestedTarget === "current" ? currentTarget() : requestedTarget;

const packageName = `@libsql/${target}`;
const rootRequire = createRequire(join(repositoryRoot, "package.json"));
const packageJson = rootRequire.resolve(`${packageName}/package.json`, {
  paths: [join(repositoryRoot, "node_modules/.pnpm/node_modules")],
});
const source = dirname(packageJson);
const destination = join(desktopRoot, "resources/native/@libsql", target);

await rm(join(desktopRoot, "resources/native"), { recursive: true, force: true });
await mkdir(dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });

if (process.argv.includes("--development")) {
  const developmentDestination = join(
    repositoryRoot,
    "apps/server/dist/node_modules/@libsql",
    target,
  );
  await mkdir(dirname(developmentDestination), { recursive: true });
  await cp(source, developmentDestination, { recursive: true });
}

console.log(`Prepared ${packageName} for desktop packaging.`);

function currentTarget() {
  if (process.platform === "darwin") return `darwin-${process.arch}`;
  if (process.platform === "win32" && process.arch === "x64") {
    return "win32-x64-msvc";
  }
  if (process.platform === "linux") return `linux-${process.arch}-gnu`;
  throw new Error(
    `No libsql desktop target is configured for ${process.platform}-${process.arch}.`,
  );
}
