import { access } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

await access(electronPath);
console.log(`Electron runtime is ready at ${electronPath}.`);
