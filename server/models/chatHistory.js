const mongoose = require('mongoose');

const chatHistorySchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    messages: [{
        role: { 
            type: String, 
            enum: ['user', 'assistant'],
            required: true 
        },
        content: {
            type: String,
            required: true
        },
        timestamp: { 
            type: Date, 
            default: Date.now 
        }
    }],
    context: {
        lastFeatureUsed: String,
        userInterests: [String]
    }
}, {
    timestamps: true
});

// Index for faster queries
chatHistorySchema.index({ userId: 1 });

module.exports = mongoose.model('ChatHistory', chatHistorySchema);