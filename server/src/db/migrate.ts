import { loadConfig } from "../config/env.js";
import { createDatabase } from "./database.js";

const config = loadConfig();
const db = createDatabase(config.databasePath);

db.close();
console.log(`Database ready at ${config.databasePath}`);

