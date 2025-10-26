const Message = require('../models/message');
const User = require('../models/users');
const { emitToUser } = require('../socket');

// POST /api/v1/messages/:userId
exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user?._id?.toString();
    const { userId } = req.params;
    const { content } = req.body;

    if (!senderId) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!userId || senderId === userId) return res.status(400).json({ success: false, message: 'Invalid recipient' });
    if (!content || !content.trim()) return res.status(400).json({ success: false, message: 'Message content required' });

    const recipient = await User.findById(userId).select('_id name');
    if (!recipient) return res.status(404).json({ success: false, message: 'Recipient not found' });

    const message = await Message.create({
      participants: [senderId, userId],
      sender: senderId,
      recipient: userId,
      content: content.trim()
    });

    const populated = await Message.findById(message._id)
      .populate('sender', 'name email profilePicture')
      .populate('recipient', 'name email profilePicture');

    // Emit to recipient if online
    emitToUser(userId, 'message:new', populated);

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    console.error('sendMessage error:', err);
    res.status(500).json({ success: false, message: 'Server error sending message' });
  }
};

// GET /api/v1/messages/conversations
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

    const msgs = await Message.find({ participants: userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('sender', 'name')
      .populate('recipient', 'name');

    const map = new Map();
    for (const m of msgs) {
      const otherId = m.sender._id.toString() === userId ? m.recipient._id.toString() : m.sender._id.toString();
      if (!map.has(otherId)) map.set(otherId, m);
    }

    const conversations = Array.from(map.entries()).map(([otherId, m]) => ({
      counterpartId: otherId,
      counterpartName: m.sender._id.toString() === userId ? m.recipient.name : m.sender.name,
      lastMessage: m
    }));

    res.json({ success: true, data: conversations });
  } catch (err) {
    console.error('getConversations error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching conversations' });
  }
};

// GET /api/v1/messages/with/:userId?limit=20&before=<iso>
exports.getChatWithUser = async (req, res) => {
  try {
    const userId = req.user?._id?.toString();
    const { userId: otherId } = req.params;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!otherId || otherId === userId) return res.status(400).json({ success: false, message: 'Invalid user' });

    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    const filter = {
      participants: { $all: [userId, otherId] }
    };
    if (before && !isNaN(before.getTime())) {
      filter.createdAt = { $lt: before };
    }

    const messages = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('sender', 'name')
      .populate('recipient', 'name');

    res.json({ success: true, data: messages.reverse() });
  } catch (err) {
    console.error('getChatWithUser error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching chat' });
  }
};
