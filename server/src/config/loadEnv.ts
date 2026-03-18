import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

let loaded = false;

function getRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function loadEnvironment(): void {
  if (loaded) {
    return;
  }

  const envPath = path.join(getRepoRoot(), ".env");

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  loaded = true;
}

