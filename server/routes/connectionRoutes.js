const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const connectionController = require('../controllers/connectionController');

// Connection routes
router.post('/:userId/connect', authMiddleware, connectionController.sendConnectionRequest);
router.put('/:requestId/accept', authMiddleware, connectionController.acceptConnection);
router.put('/:requestId/reject', authMiddleware, connectionController.rejectConnection);
router.get('/', authMiddleware, connectionController.getConnections);
router.delete('/:userId', authMiddleware, connectionController.removeConnection);

module.exports = router;