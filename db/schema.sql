CREATE TABLE IF NOT EXISTS calls (
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
);

CREATE INDEX IF NOT EXISTS idx_calls_department ON calls (department);
CREATE INDEX IF NOT EXISTS idx_calls_callSid ON calls (callSid);


