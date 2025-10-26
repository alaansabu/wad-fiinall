const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true
    },
    requester: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    postOwner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    scheduledDate: {
        type: Date,
        required: true
    },
    scheduledTime: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'cancelled'],
        default: 'pending'
    },
    acceptedAt: {
        type: Date,
        default: null
    },
    meetingType: {
        type: String,
        enum: ['virtual', 'in-person'],
        default: 'virtual'
    },
    meetingLink: {
        type: String,
        default: ''
    },
    // Email reminder sent 5 minutes before start
    reminder5SentAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Index for efficient queries
meetingSchema.index({ post: 1, requester: 1 });
meetingSchema.index({ postOwner: 1, status: 1 });
meetingSchema.index({ scheduledDate: 1 });

module.exports = mongoose.model('Meeting', meetingSchema);