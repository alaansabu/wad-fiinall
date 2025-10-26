const chatbotService = require('../services/chatbotServices');

exports.chat = async (req, res) => {
    try {
        const { message } = req.body;
        const userId = req.user.id; // From your auth middleware

        if (!message || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Message is required'
            });
        }

        if (message.length > 500) {
            return res.status(400).json({
                success: false,
                message: 'Message too long (max 500 characters)'
            });
        }

        const aiResponse = await chatbotService.getAIResponse(userId, message.trim());

        res.json({
            success: true,
            response: aiResponse,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('Chatbot controller error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            response: "I'm having trouble responding right now. Please try again later."
        });
    }
};

exports.getHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const history = await chatbotService.getChatHistory(userId);

        res.json({
            success: true,
            history: history
        });

    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving chat history'
        });
    }
};

exports.clearHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const success = await chatbotService.clearChatHistory(userId);

        if (success) {
            res.json({
                success: true,
                message: 'Chat history cleared'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to clear chat history'
            });
        }

    } catch (error) {
        console.error('Clear history error:', error);
        res.status(500).json({
            success: false,
            message: 'Error clearing chat history'
        });
    }
};