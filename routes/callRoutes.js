const express = require('express');
const router = express.Router();

const callController = require('../controllers/callController');

// Outbound call start
router.post('/start-call', callController.startCall);

// Twilio webhooks
router.post('/call-status', callController.handleCallStatus);
router.post('/record-complete', callController.handleRecordComplete);

// TwiML endpoint (all methods)
router.all('/twiml', callController.twimlHandler);

// Dashboard APIs
router.get('/calls', callController.getAllCalls);
router.get('/calls/:department', callController.getCallsByDepartment);
router.get('/recordings/:callSid', callController.getRecordingByCallSid);
router.get('/stats', callController.getStats);

module.exports = router;


