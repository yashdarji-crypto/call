## Lodha Group – Twilio Automated Calling Backend

This project is a production-ready backend for **Lodha Group** that automates outbound calls using **Twilio Voice**, records calls, captures call status and IVR responses, supports department-based routing, and exposes dashboard/stat APIs. It is built with **Node.js (CommonJS)**, **Express**, and **SQLite**, and is ready to deploy on **Render**.

### Tech Stack

- **Runtime**: Node.js (LTS)
- **Framework**: Express
- **Database**: SQLite (via `sqlite3`)
- **Telephony**: Twilio Voice API
- **Security/Middleware**: `helmet`, `cors`, `dotenv`

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment configuration

Create a `.env` file in the project root (based on `.env.example`):

```bash
cp .env.example .env
```

Required variables:

- **PORT**: Port for the Express server (e.g. `3000`)
- **BASE_URL**: Public base URL of this service (Render URL in production, or your `ngrok` URL locally), e.g. `https://your-service.onrender.com`
- **TWILIO_ACCOUNT_SID**: Your Twilio Account SID
- **TWILIO_AUTH_TOKEN**: Your Twilio Auth Token
- **TWILIO_CALLER_ID**: Twilio phone number used as caller ID (E.164 format, e.g. `+1234567890`)
- **CORS_ORIGIN**: Frontend origin allowed for CORS (e.g. `https://your-frontend.com` or `*` for testing)

Example `.env`:

```bash
PORT=3000
BASE_URL=https://your-render-service.onrender.com
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_CALLER_ID=+1234567890
CORS_ORIGIN=https://your-frontend-domain.com
```

### 3. Start the server

```bash
npm start
```

The service will:

- Initialize the SQLite database at `db/database.sqlite`
- Create the `calls` table and indexes (idempotent)
- Start listening on `PORT`

---

## Database

- **Engine**: SQLite
- **File**: `db/database.sqlite`
- **Schema**: `db/schema.sql` (also re-created programmatically on startup)

Table `calls`:

- **id**: INTEGER PK AUTOINCREMENT
- **callSid**: TEXT UNIQUE
- **customerName**: TEXT
- **phoneNumber**: TEXT
- **department**: TEXT (`Sales`, `CRM`, `Collection`, `Support`)
- **status**: TEXT
- **duration**: INTEGER
- **recordingUrl**: TEXT
- **ivrSelection**: TEXT (e.g. `"1"`, `"2"`, `"3"`)
- **createdAt**: TEXT (default `datetime('now')`)
- **updatedAt**: TEXT (default `datetime('now')`)

Indexes:

- `idx_calls_department` on `department`
- `idx_calls_callSid` on `callSid`

---

## API Endpoints

### 1. **POST `/start-call`**

Start an outbound automated call.

**Request body (JSON)**:

```json
{
  "customerName": "John Doe",
  "phoneNumber": "+911234567890",
  "department": "Sales"
}
```

- **customerName**: required string
- **phoneNumber**: required string (E.164 recommended)
- **department**: required, one of `Sales`, `CRM`, `Collection`, `Support`

**Behavior**:

- Validates inputs
- Uses Twilio Voice API to initiate an outbound call:
  - `from`: `TWILIO_CALLER_ID`
  - `to`: `phoneNumber`
  - `url`: `{BASE_URL}/twiml?customerName=<encoded>&department=<encoded>`
  - `statusCallback`: `{BASE_URL}/call-status`
  - `statusCallbackEvent`: `initiated`, `ringing`, `answered`, `completed`, `failed`, `busy`
  - `record`: `true`
  - `recordingStatusCallback`: `{BASE_URL}/record-complete` with event `completed`
- Inserts/updates a call row in DB with initial `status = "initiated"`.

**Response (success)**:

```json
{
  "message": "Call started",
  "callSid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

---

### 2. **POST `/call-status`** (Twilio webhook + IVR gather action)

Twilio posts call status and IVR input to this endpoint.

**Typical form fields** (application/x-www-form-urlencoded):

- `CallSid`
- `CallStatus` (e.g. `queued`, `ringing`, `in-progress`, `completed`, `failed`, `busy`, etc.)
- `CallDuration`
- `To`
- `From`
- `Digits` (from IVR gather: `1`, `2`, or `3`)
- `Timestamp`, etc.

**Behavior**:

- Uses SQLite upsert on `callSid`:
  - Insert a new row if not present
  - Update `status`, `duration`, `phoneNumber`, `ivrSelection`, `updatedAt` if existing
- Always responds with **200 OK** to Twilio, even on DB errors (logs errors to console).

This endpoint is also the **`action`** URL for the IVR `Gather` in `/twiml` (so `Digits` are captured).

---

### 3. **POST `/record-complete`** (Twilio recording webhook)

Twilio sends recording callbacks here.

**Typical form fields**:

- `CallSid`
- `RecordingUrl`
- `RecordingSid`

**Behavior**:

- Validates `CallSid` is present (logs warning if not)
- Updates the `recordingUrl` for that `callSid` in DB
- Always responds **200 OK** (does not break Twilio recording flow)

---

### 4. **ALL `/twiml`**

TwiML endpoint used by Twilio to drive the call IVR.

**Query params**:

- `customerName`
- `department`

**Behavior**:

- Uses `twilio.twiml.VoiceResponse` to generate TwiML.
- IVR flow:
  - `Gather` 1 digit with:
    - `action="/call-status"`
    - `method="POST"`
  - Main TTS message:
    - `"Hello <CustomerName>, this is an automated call from Lodha Group. This call is regarding your requirements."`
  - IVR instruction:
    - `"If you are interested, press 1. To schedule a call later, press 2. If not interested, press 3."`
  - Closing message after gather:
    - `"Thank you from the <Department> team at Lodha Group. We will reach out to you shortly. Goodbye."`

**Response**:

- `Content-Type: text/xml`
- TwiML `<Response>...</Response>`

---

### 5. **GET `/calls`**

Returns all calls ordered by `createdAt DESC`.

**Response**:

```json
[
  {
    "id": 1,
    "callSid": "CA...",
    "customerName": "John Doe",
    "phoneNumber": "+91...",
    "department": "Sales",
    "status": "completed",
    "duration": 45,
    "recordingUrl": "https://api.twilio.com/...",
    "ivrSelection": "1",
    "createdAt": "2025-01-01 10:00:00",
    "updatedAt": "2025-01-01 10:05:00"
  }
]
```

---

### 6. **GET `/calls/:department`**

Returns calls for a specific department.

- **department** param must be one of `Sales`, `CRM`, `Collection`, `Support`.

**Response**:

- Same format as `/calls`, filtered by `department`.

---

### 7. **GET `/recordings/:callSid`**

Return recording URL for a specific `callSid`.

**Response (200)**:

```json
{
  "callSid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "recordingUrl": "https://api.twilio.com/2010-04-01/Accounts/..."
}
```

**Response (404)**:

- Empty 404 if no such callSid exists.

---

### 8. **GET `/stats`**

Aggregated statistics across calls.

**Response**:

```json
{
  "total": 100,
  "answered": 60,
  "failed": 20,
  "byDepartment": {
    "Sales": 40,
    "CRM": 30,
    "Collection": 20,
    "Support": 10
  }
}
```

- **total**: total number of calls
- **answered**: `status` in (`completed`, `answered`)
- **failed**: `status` in (`failed`, `busy`, `no-answer`, `canceled`)
- **byDepartment**: counts grouped by `department`

---

### 9. **GET `/health`**

Health check endpoint.

**Response**:

```json
{
  "status": "ok",
  "uptime": 123.456
}
```

---

## Twilio Configuration

Configure your Twilio phone number or Studio Flow to use these URLs:

- **Voice/TwiML URL**: `POST` or `GET` → `{BASE_URL}/twiml`
- **Status callback URL**: `POST` → `{BASE_URL}/call-status`
  - Enable events: `initiated`, `ringing`, `answered`, `completed`, `failed`, `busy`
- **Recording callback URL**: `POST` → `{BASE_URL}/record-complete`
  - Recording status events: `completed`

Make sure:

- `BASE_URL` in your `.env` matches the public URL Twilio can reach (Render URL or `ngrok` tunnel).
- Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_CALLER_ID`) are correctly set.

---

## Sample `curl` for `/start-call`

```bash
curl -X POST "$BASE_URL/start-call" \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "John Doe",
    "phoneNumber": "+911234567890",
    "department": "Sales"
  }'
```

Expected response:

```json
{
  "message": "Call started",
  "callSid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

---

## Render Deployment

This repo includes a `render.yaml` definition for a web service:

- **Type**: `web`
- **Env**: `node`
- **Build command**: `npm install`
- **Start command**: `node server.js`

Environment variables on Render:

- **PORT**: `3000`
- **BASE_URL**: your Render service URL (e.g. `https://your-service.onrender.com`)
- **TWILIO_ACCOUNT_SID**: *sync: false* (set in dashboard)
- **TWILIO_AUTH_TOKEN**: *sync: false*
- **TWILIO_CALLER_ID**: *sync: false*
- **CORS_ORIGIN**: *sync: false*

Once deployed, Twilio can call your Render URL directly and no further code changes are required.

---

## Notes

- The SQLite database file is created automatically at `db/database.sqlite` on first run.
- DB migration is idempotent; restarting the server is safe.
- The app logs non-fatal errors (e.g., missing webhook fields, DB update failures) but continues serving requests, ensuring Twilio webhooks are always acknowledged with `200 OK`.


