const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const meetingController = require('../controllers/meetingController');
const { scanAndNotify } = require('../scheduler/meetingReminder');

// Meeting routes
router.post('/posts/:postId/meeting', authMiddleware, meetingController.scheduleMeeting);
router.get('/requests', authMiddleware, meetingController.getMyMeetingRequests);
router.get('/scheduled', authMiddleware, meetingController.getMyScheduledMeetings);
router.put('/:meetingId/accept', authMiddleware, meetingController.acceptMeeting);
router.put('/:meetingId/reject', authMiddleware, meetingController.rejectMeeting);
router.put('/:meetingId/cancel', authMiddleware, meetingController.cancelMeeting);

// Dev-only: trigger reminder scan manually
router.get('/reminders/run', authMiddleware, async (req, res) => {
	try {
		await scanAndNotify();
		res.json({ success: true, message: 'Reminder scan executed' });
	} catch (e) {
		res.status(500).json({ success: false, message: e?.message || 'Scan failed' });
	}
});

module.exports = router;