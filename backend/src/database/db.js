const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

const dataDir = path.join(__dirname, "../../data");
const databasePath = path.join(dataDir, "database.sqlite");
const schemaPath = path.join(__dirname, "schema.sql");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(databasePath);

db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(schemaPath, "utf8"));

module.exports = db;
