const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const callerId = process.env.TWILIO_CALLER_ID;

let client = null;
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
} else {
  console.warn(
    'Twilio credentials are not fully configured. Outbound calls will fail until configured.'
  );
}

async function startOutboundCall({ customerName, phoneNumber, department, baseUrl }) {
  if (!client) {
    throw new Error('Twilio client not initialized. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }

  if (!callerId) {
    throw new Error('TWILIO_CALLER_ID is not configured.');
  }

  const encodedCustomerName = encodeURIComponent(customerName);
  const encodedDepartment = encodeURIComponent(department);

  const twimlUrl = `${baseUrl}/twiml?customerName=${encodedCustomerName}&department=${encodedDepartment}`;

  const statusCallbackUrl = `${baseUrl}/call-status`;
  const recordingStatusCallbackUrl = `${baseUrl}/record-complete`;

  const call = await client.calls.create({
    to: phoneNumber,
    from: callerId,
    url: twimlUrl,
    statusCallback: statusCallbackUrl,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed', 'failed', 'busy'],
    record: true,
    recordingStatusCallback: recordingStatusCallbackUrl,
    recordingStatusCallbackMethod: 'POST',
    recordingStatusCallbackEvent: ['completed'],
  });

  return { callSid: call.sid };
}

function buildTwiML({ customerName, department }) {
  const { VoiceResponse } = twilio.twiml;
  const response = new VoiceResponse();

  const gather = response.gather({
    numDigits: 1,
    action: '/call-status',
    method: 'POST',
  });

  const safeName = customerName || 'Customer';
  const safeDepartment = department || 'Sales';

  gather.say(
    `Hello ${safeName}, this is an automated call from Lodha Group. This call is regarding your requirements.`
  );

  gather.say(
    'If you are interested, press 1. To schedule a call later, press 2. If not interested, press 3.'
  );

  response.say(
    `Thank you from the ${safeDepartment} team at Lodha Group. We will reach out to you shortly. Goodbye.`
  );

  return response.toString();
}

module.exports = {
  startOutboundCall,
  buildTwiML,
};


