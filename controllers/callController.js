const twilioService = require('../services/twilioService');
const { db } = require('../db/init');

const ALLOWED_DEPARTMENTS = ['Sales', 'CRM', 'Collection', 'Support'];

function validateDepartment(dept) {
  return ALLOWED_DEPARTMENTS.includes(dept);
}

exports.startCall = async (req, res) => {
  try {
    const { customerName, phoneNumber, department } = req.body || {};

    if (
      !customerName ||
      typeof customerName !== 'string' ||
      !customerName.trim()
    ) {
      return res.status(400).json({ error: 'customerName is required' });
    }

    if (
      !phoneNumber ||
      typeof phoneNumber !== 'string' ||
      !phoneNumber.trim()
    ) {
      return res.status(400).json({ error: 'phoneNumber is required' });
    }

    if (!department || !validateDepartment(department)) {
      return res.status(400).json({
        error: 'department is required and must be one of Sales, CRM, Collection, Support',
      });
    }

    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      return res
        .status(500)
        .json({ error: 'BASE_URL is not configured on the server' });
    }

    const result = await twilioService.startOutboundCall({
      customerName: customerName.trim(),
      phoneNumber: phoneNumber.trim(),
      department,
      baseUrl,
    });

    // Insert initial call row (idempotent in case webhook arrives first)
    db.run(
      `INSERT INTO calls (callSid, customerName, phoneNumber, department, status)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(callSid) DO UPDATE SET
         customerName = excluded.customerName,
         phoneNumber = excluded.phoneNumber,
         department = excluded.department,
         status = excluded.status,
         updatedAt = datetime('now')`,
      [
        result.callSid,
        customerName.trim(),
        phoneNumber.trim(),
        department,
        'initiated',
      ],
      (err) => {
        if (err) {
          console.error('Error inserting initial call record', err);
        }
      }
    );

    return res.json({
      message: 'Call started',
      callSid: result.callSid,
    });
  } catch (err) {
    console.error('Error in startCall', err);
    return res.status(500).json({ error: 'Failed to start call' });
  }
};

exports.handleRecordComplete = (req, res) => {
  // Twilio sends application/x-www-form-urlencoded by default
  const { CallSid, RecordingUrl } = req.body || {};

  if (!CallSid) {
    // Still respond 200 to Twilio
    console.warn('record-complete webhook without CallSid');
    return res.sendStatus(200);
  }

  db.run(
    `UPDATE calls
     SET recordingUrl = ?, updatedAt = datetime('now')
     WHERE callSid = ?`,
    [RecordingUrl || null, CallSid],
    (err) => {
      if (err) {
        console.error('Error updating recordingUrl', err);
      }
      return res.sendStatus(200);
    }
  );
};

exports.handleCallStatus = (req, res) => {
  const {
    CallSid,
    CallStatus,
    CallDuration,
    To,
    From,
    Digits,
    Timestamp,
  } = req.body || {};

  if (!CallSid) {
    console.warn('call-status webhook without CallSid');
    return res.sendStatus(200);
  }

  const duration = CallDuration ? parseInt(CallDuration, 10) : null;
  const ivrSelection = Digits || null;

  db.run(
    `INSERT INTO calls (callSid, phoneNumber, status, duration, ivrSelection)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(callSid) DO UPDATE SET
       phoneNumber = COALESCE(excluded.phoneNumber, calls.phoneNumber),
       status = excluded.status,
       duration = COALESCE(excluded.duration, calls.duration),
       ivrSelection = COALESCE(excluded.ivrSelection, calls.ivrSelection),
       updatedAt = datetime('now')`,
    [CallSid, To || null, CallStatus || null, duration, ivrSelection],
    (err) => {
      if (err) {
        console.error('Error upserting call status', err);
      }
      return res.sendStatus(200);
    }
  );
};

exports.twimlHandler = (req, res) => {
  try {
    const { customerName = 'Customer', department = 'Sales' } = req.query || {};

    const twiml = twilioService.buildTwiML({
      customerName,
      department,
    });

    res.type('text/xml');
    return res.send(twiml);
  } catch (err) {
    console.error('Error building TwiML', err);
    res.type('text/xml');
    return res.send(
      '<Response><Say>We are unable to process your call right now. Goodbye.</Say></Response>'
    );
  }
};

exports.getAllCalls = (req, res) => {
  db.all(
    `SELECT * FROM calls ORDER BY datetime(createdAt) DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('Error fetching calls', err);
        return res.status(500).json({ error: 'Failed to fetch calls' });
      }
      return res.json(rows || []);
    }
  );
};

exports.getCallsByDepartment = (req, res) => {
  const { department } = req.params;

  if (!validateDepartment(department)) {
    return res.status(400).json({
      error: 'Invalid department. Must be one of Sales, CRM, Collection, Support',
    });
  }

  db.all(
    `SELECT * FROM calls
     WHERE department = ?
     ORDER BY datetime(createdAt) DESC`,
    [department],
    (err, rows) => {
      if (err) {
        console.error('Error fetching calls by department', err);
        return res
          .status(500)
          .json({ error: 'Failed to fetch department calls' });
      }
      return res.json(rows || []);
    }
  );
};

exports.getRecordingByCallSid = (req, res) => {
  const { callSid } = req.params;

  db.get(
    `SELECT callSid, recordingUrl FROM calls WHERE callSid = ?`,
    [callSid],
    (err, row) => {
      if (err) {
        console.error('Error fetching recording by CallSid', err);
        return res.status(500).json({ error: 'Failed to fetch recording' });
      }
      if (!row) {
        return res.sendStatus(404);
      }
      return res.json(row);
    }
  );
};

exports.getStats = (req, res) => {
  const statusAnswered = ['completed', 'answered'];
  const statusFailed = ['failed', 'busy', 'no-answer', 'canceled'];

  db.get(
    `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status IN (${statusAnswered
        .map(() => '?')
        .join(',')}) THEN 1 ELSE 0 END) AS answered,
      SUM(CASE WHEN status IN (${statusFailed
        .map(() => '?')
        .join(',')}) THEN 1 ELSE 0 END) AS failed
    FROM calls
  `,
    [...statusAnswered, ...statusFailed],
    (err, row) => {
      if (err) {
        console.error('Error computing stats', err);
        return res.status(500).json({ error: 'Failed to compute stats' });
      }

      db.all(
        `
        SELECT department, COUNT(*) as count
        FROM calls
        GROUP BY department
      `,
        [],
        (err2, deptRows) => {
          if (err2) {
            console.error('Error computing byDepartment stats', err2);
            return res
              .status(500)
              .json({ error: 'Failed to compute department stats' });
          }

          const byDepartment = {};
          (deptRows || []).forEach((r) => {
            if (r.department) {
              byDepartment[r.department] = r.count;
            }
          });

          return res.json({
            total: row ? row.total : 0,
            answered: row ? row.answered : 0,
            failed: row ? row.failed : 0,
            byDepartment,
          });
        }
      );
    }
  );
};


