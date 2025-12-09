const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbDir = path.join(__dirname);
const dbFile = path.join(dbDir, 'database.sqlite');

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbFile);

function runMigrations() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS calls (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          callSid TEXT UNIQUE,
          customerName TEXT,
          phoneNumber TEXT,
          department TEXT,
          status TEXT,
          duration INTEGER,
          recordingUrl TEXT,
          ivrSelection TEXT,
          createdAt TEXT DEFAULT (datetime('now')),
          updatedAt TEXT DEFAULT (datetime('now'))
        )`,
        (err) => {
          if (err) {
            return reject(err);
          }

          db.run(
            `CREATE INDEX IF NOT EXISTS idx_calls_department ON calls(department)`,
            (idxErr1) => {
              if (idxErr1) {
                return reject(idxErr1);
              }
              db.run(
                `CREATE INDEX IF NOT EXISTS idx_calls_callSid ON calls(callSid)`,
                (idxErr2) => {
                  if (idxErr2) {
                    return reject(idxErr2);
                  }
                  resolve();
                }
              );
            }
          );
        }
      );
    });
  });
}

async function initDb() {
  await runMigrations();
  console.log('SQLite database initialized at', dbFile);
}

module.exports = {
  db,
  initDb,
};


