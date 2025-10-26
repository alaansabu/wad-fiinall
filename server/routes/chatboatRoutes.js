const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbotController');
const authMiddleware = require('../middleware/authMiddleware');

// Apply auth middleware to all routes
router.use(authMiddleware);

// POST /api/v1/chatbot/chat - Send message to AI
router.post('/chat', chatbotController.chat);

// GET /api/v1/chatbot/history - Get chat history
router.get('/history', chatbotController.getHistory);

// DELETE /api/v1/chatbot/history - Clear chat history
router.delete('/history', chatbotController.clearHistory);

module.exports = router;