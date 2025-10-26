const Meeting = require('../models/meetings');
const Post = require('../models/post');
const User = require('../models/users');

const ensureArrayField = (doc, field) => {
  if (!Array.isArray(doc[field])) {
    doc[field] = [];
  }
};

// Schedule a meeting
exports.scheduleMeeting = async (req, res) => {
  try {
    const { postId } = req.params;
    const { date, time, message, meetingType = 'virtual' } = req.body;
    const requesterId = req.user?._id?.toString();

    if (!requesterId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to schedule a meeting'
      });
    }

    // Validate required fields
    if (!date || !time || !message) {
      return res.status(400).json({
        success: false,
        message: 'Date, time, and message are required'
      });
    }

    // Find the post
    const post = await Post.findById(postId).populate('author');
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user is trying to schedule meeting with themselves
    if (post.author._id.toString() === requesterId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot schedule meeting with yourself'
      });
    }

    // Parse date and time
    const scheduledDate = new Date(date);
    const scheduledDateTime = new Date(`${date}T${time}`);
    const now = new Date();

    // Only require the meeting time to be in the future (no 2-hour-in-advance restriction)
    if (scheduledDateTime <= now) {
      return res.status(400).json({
        success: false,
        message: 'Meeting must be scheduled for a future time'
      });
    }

    // Check for existing meetings at the same time
    const existingMeeting = await Meeting.findOne({
      postOwner: post.author._id,
      scheduledDate: scheduledDate,
      scheduledTime: time,
      status: { $in: ['pending', 'accepted'] }
    });

    if (existingMeeting) {
      return res.status(400).json({
        success: false,
        message: 'The post owner already has a meeting scheduled at this time'
      });
    }

    // Enforce 2-hour cooldown after an accepted meeting between the same two users (either direction)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recentAccepted = await Meeting.findOne({
      status: 'accepted',
      acceptedAt: { $ne: null, $gt: twoHoursAgo },
      $or: [
        { requester: requesterId, postOwner: post.author._id },
        { requester: post.author._id, postOwner: requesterId }
      ]
    }).sort({ acceptedAt: -1 });

    if (recentAccepted) {
      return res.status(400).json({
        success: false,
        message: 'Please wait 2 hours after the last accepted meeting before sending another meeting request between these users.'
      });
    }

    // Create new meeting
    const meeting = new Meeting({
      post: postId,
      requester: requesterId,
      postOwner: post.author._id,
      scheduledDate: scheduledDate,
      scheduledTime: time,
      message: message,
      meetingType: meetingType
    });

    await meeting.save();

    // Create notification for post owner
    const postOwner = await User.findById(post.author._id);

    if (!postOwner) {
      return res.status(404).json({
        success: false,
        message: 'Post owner not found'
      });
    }

    ensureArrayField(postOwner, 'notifications');

    postOwner.notifications.push({
      type: 'meeting_request',
      fromUser: requesterId,
      message: `New meeting request for your post: ${post.title}`,
      meeting: meeting._id
    });
    await postOwner.save();

    // Populate the meeting with user details
    await meeting.populate('requester', 'name email profilePicture');
    await meeting.populate('postOwner', 'name email profilePicture');

    res.status(201).json({
      success: true,
      message: 'Meeting request sent successfully',
      data: meeting
    });

  } catch (error) {
    console.error('Schedule meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while scheduling meeting'
    });
  }
};

// Get user's meeting requests (as post owner)
exports.getMyMeetingRequests = async (req, res) => {
  try {
    const userId = req.user?._id?.toString();

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to view meeting requests'
      });
    }
    const { status } = req.query;

    const filter = { postOwner: userId };
    if (status) {
      filter.status = status;
    }

    const meetings = await Meeting.find(filter)
      .populate('requester', 'name email profilePicture')
      .populate('post', 'title content')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: meetings
    });

  } catch (error) {
    console.error('Get meeting requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching meeting requests'
    });
  }
};

// Get meetings I requested
exports.getMyScheduledMeetings = async (req, res) => {
  try {
    const userId = req.user?._id?.toString();

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to view scheduled meetings'
      });
    }
    const { status } = req.query;

    const filter = { requester: userId };
    if (status) {
      filter.status = status;
    }

    const meetings = await Meeting.find(filter)
      .populate('postOwner', 'name email profilePicture')
      .populate('post', 'title content')
      .sort({ scheduledDate: 1 });

    res.status(200).json({
      success: true,
      data: meetings
    });

  } catch (error) {
    console.error('Get scheduled meetings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching scheduled meetings'
    });
  }
};

// Accept meeting request
exports.acceptMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user?._id?.toString();

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to manage meetings'
      });
    }

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Check if user is the post owner
    if (meeting.postOwner.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to accept this meeting'
      });
    }

    if (meeting.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Meeting request already processed'
      });
    }

  meeting.status = 'accepted';
  meeting.acceptedAt = new Date();
    await meeting.save();

    // Create notification for requester
    const requester = await User.findById(meeting.requester);

    if (!requester) {
      return res.status(404).json({
        success: false,
        message: 'Requester not found'
      });
    }

    ensureArrayField(requester, 'notifications');

    requester.notifications.push({
      type: 'meeting_accepted',
      fromUser: userId,
      message: `Your meeting request has been accepted`,
      meeting: meeting._id
    });
    await requester.save();

    res.status(200).json({
      success: true,
      message: 'Meeting request accepted',
      data: meeting
    });

  } catch (error) {
    console.error('Accept meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while accepting meeting'
    });
  }
};

// Reject meeting request
exports.rejectMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user?._id?.toString();

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to manage meetings'
      });
    }

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Check if user is the post owner
    if (meeting.postOwner.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reject this meeting'
      });
    }

    if (meeting.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Meeting request already processed'
      });
    }

    meeting.status = 'rejected';
    await meeting.save();

    // Create notification for requester
    const requester = await User.findById(meeting.requester);

    if (!requester) {
      return res.status(404).json({
        success: false,
        message: 'Requester not found'
      });
    }

    ensureArrayField(requester, 'notifications');

    requester.notifications.push({
      type: 'meeting_rejected',
      fromUser: userId,
      message: `Your meeting request has been declined`,
      meeting: meeting._id
    });
    await requester.save();

    res.status(200).json({
      success: true,
      message: 'Meeting request rejected',
      data: meeting
    });

  } catch (error) {
    console.error('Reject meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rejecting meeting'
    });
  }
};

// Cancel meeting
exports.cancelMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user?._id?.toString();

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to cancel meetings'
      });
    }

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }

    // Check if user is either requester or post owner
    if (meeting.requester.toString() !== userId && meeting.postOwner.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this meeting'
      });
    }

    meeting.status = 'cancelled';
    await meeting.save();

    res.status(200).json({
      success: true,
      message: 'Meeting cancelled successfully',
      data: meeting
    });

  } catch (error) {
    console.error('Cancel meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling meeting'
    });
  }
};