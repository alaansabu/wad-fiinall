const mongoose = require('mongoose');
const User = require('../models/users');
const Profile = require('../models/profile');

const ensureArrayField = (doc, field) => {
  if (!Array.isArray(doc[field])) {
    doc[field] = [];
  }
};

const toObjectId = value => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return null;
};

const addFollowRelation = async (followerId, targetUserId) => {
  const followerObjectId = toObjectId(followerId);
  const targetObjectId = toObjectId(targetUserId);

  if (!followerObjectId || !targetObjectId) {
    return { followerFollowing: 0, targetFollowers: 0 };
  }

  const [followerProfile, targetProfile] = await Promise.all([
    Profile.findOneAndUpdate(
      { user: followerObjectId },
      { $addToSet: { following: targetObjectId }, $setOnInsert: { user: followerObjectId } },
      { new: true, upsert: true }
    ),
    Profile.findOneAndUpdate(
      { user: targetObjectId },
      { $addToSet: { followers: followerObjectId }, $setOnInsert: { user: targetObjectId } },
      { new: true, upsert: true }
    )
  ]);

  return {
    followerFollowing: followerProfile ? followerProfile.following.length : 0,
    targetFollowers: targetProfile ? targetProfile.followers.length : 0
  };
};

const removeFollowRelation = async (followerId, targetUserId) => {
  const followerObjectId = toObjectId(followerId);
  const targetObjectId = toObjectId(targetUserId);

  if (!followerObjectId || !targetObjectId) {
    return {
      followerFollowing: 0,
      targetFollowers: 0
    };
  }

  const [followerProfile, targetProfile] = await Promise.all([
    Profile.findOneAndUpdate(
      { user: followerObjectId },
      { $pull: { following: targetObjectId }, $setOnInsert: { user: followerObjectId } },
      { new: true, upsert: true }
    ),
    Profile.findOneAndUpdate(
      { user: targetObjectId },
      { $pull: { followers: followerObjectId }, $setOnInsert: { user: targetObjectId } },
      { new: true, upsert: true }
    )
  ]);

  return {
    followerFollowing: followerProfile ? followerProfile.following.length : 0,
    targetFollowers: targetProfile ? targetProfile.followers.length : 0
  };
};

// Send connection request
exports.sendConnectionRequest = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?._id?.toString();

    if (!currentUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to send connection requests'
      });
    }

    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send connection request to yourself'
      });
    }

    const [targetUser, currentUser] = await Promise.all([
      User.findById(userId),
      User.findById(currentUserId)
    ]);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if connection already exists
    ensureArrayField(currentUser, 'connections');
    ensureArrayField(targetUser, 'connections');
    ensureArrayField(targetUser, 'notifications');

    const existingConnection = currentUser.connections.find(
      conn => conn.user.toString() === userId && conn.status === 'pending'
    );

    if (existingConnection) {
      // If a pending request already exists, ensure follow relation is present
      try {
        const followStats = await addFollowRelation(currentUserId, userId);
        // Save users in case other fields were touched
        await Promise.all([currentUser.save(), targetUser.save()]);
        return res.status(200).json({
          success: true,
          message: 'Connection request already sent',
          data: {
            followerFollowing: followStats.followerFollowing,
            targetFollowers: followStats.targetFollowers
          }
        });
      } catch (err) {
        console.warn('Warning: failed to sync follow relation for existing pending request', err);
        return res.status(200).json({
          success: true,
          message: 'Connection request already sent'
        });
      }
    }

    // Check if already connected
    const alreadyConnected = currentUser.connections.find(
      conn => conn.user.toString() === userId && conn.status === 'accepted'
    );

    if (alreadyConnected) {
      return res.status(400).json({
        success: false,
        message: 'Already connected with this user'
      });
    }

    // Add to current user's connections (pending)
    currentUser.connections.push({
      user: userId,
      status: 'pending'
    });

    // Add to target user's connections (they'll see it as pending)
    targetUser.connections.push({
      user: currentUserId,
      status: 'pending'
    });

    // Create notification for target user
    targetUser.notifications.push({
      type: 'connection_request',
      fromUser: currentUserId,
      message: `${currentUser.name} sent you a connection request`
    });

    const followStats = await addFollowRelation(currentUserId, userId);

    await Promise.all([
      currentUser.save(),
      targetUser.save()
    ]);

    res.status(200).json({
      success: true,
      message: 'Connection request sent successfully',
      data: {
        followerFollowing: followStats.followerFollowing,
        targetFollowers: followStats.targetFollowers,
        // Standardized keys so clients can rely on these
        followingCount: followStats.followerFollowing,
        followersCount: followStats.targetFollowers
      }
    });

    return;

  } catch (error) {
    console.error('Send connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while sending connection request'
    });
  }
};

// Accept connection request
exports.acceptConnection = async (req, res) => {
  try {
    const { requestId } = req.params;
    const currentUserId = req.user?._id?.toString();

    if (!currentUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to manage connection requests'
      });
    }

    const currentUser = await User.findById(currentUserId);

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    ensureArrayField(currentUser, 'connections');

    // Find the connection request
    const connection = currentUser.connections.id(requestId);
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Connection request not found'
      });
    }

    if (connection.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Connection request already processed'
      });
    }

    // Update status to accepted
    connection.status = 'accepted';

    const targetUserId = connection.user;

    // Update target user's connection status
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Target user not found'
      });
    }

    ensureArrayField(targetUser, 'connections');
    ensureArrayField(targetUser, 'notifications');

    const targetConnection = targetUser.connections.find(
      conn => conn.user.toString() === currentUserId
    );
    if (targetConnection) {
      targetConnection.status = 'accepted';
    }

    // Create notification for the requester
    targetUser.notifications.push({
      type: 'connection_accepted',
      fromUser: currentUserId,
      message: `${currentUser.name} accepted your connection request`
    });

    const followStats = await addFollowRelation(currentUserId, targetUserId.toString());

    await Promise.all([currentUser.save(), targetUser.save()]);

    res.status(200).json({
      success: true,
      message: 'Connection request accepted',
      data: {
        followerFollowing: followStats.followerFollowing,
        targetFollowers: followStats.targetFollowers,
        followingCount: followStats.followerFollowing,
        followersCount: followStats.targetFollowers
      }
    });

  } catch (error) {
    console.error('Accept connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while accepting connection'
    });
  }
};

// Reject connection request
exports.rejectConnection = async (req, res) => {
  try {
    const { requestId } = req.params;
    const currentUserId = req.user?._id?.toString();

    if (!currentUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to manage connection requests'
      });
    }

    const currentUser = await User.findById(currentUserId);

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    ensureArrayField(currentUser, 'connections');

    // Find the connection request
    const connection = currentUser.connections.id(requestId);
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Connection request not found'
      });
    }

    if (connection.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Connection request already processed'
      });
    }

    // Remove the connection request
    currentUser.connections.pull(requestId);

    // Also remove from the other user's connections
    const targetUser = await User.findById(connection.user);

    if (targetUser) {
      ensureArrayField(targetUser, 'connections');
      const targetConnection = targetUser.connections.find(
      conn => conn.user.toString() === currentUserId
    );
      if (targetConnection) {
        targetUser.connections.pull(targetConnection._id);
      }
    }

    const followStats = await removeFollowRelation(connection.user.toString(), currentUserId);

    const saveJobs = [currentUser.save()];
    if (targetUser) {
      saveJobs.push(targetUser.save());
    }
    await Promise.all(saveJobs);

    res.status(200).json({
      success: true,
      message: 'Connection request rejected',
      data: {
        followerFollowing: followStats.followerFollowing,
        targetFollowers: followStats.targetFollowers,
        followingCount: followStats.followerFollowing,
        followersCount: followStats.targetFollowers
      }
    });

  } catch (error) {
    console.error('Reject connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while rejecting connection'
    });
  }
};

// Get user's connections
exports.getConnections = async (req, res) => {
  try {
    const userId = req.user?._id?.toString();

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to view connections'
      });
    }

    const user = await User.findById(userId)
      .populate('connections.user', 'name email profilePicture bio location')
      .populate('followers', 'name email profilePicture bio location')
      .populate('following', 'name email profilePicture bio location');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    ensureArrayField(user, 'connections');
    ensureArrayField(user, 'followers');
    ensureArrayField(user, 'following');

    const pendingRequests = user.connections.filter(conn => conn.status === 'pending');
    const acceptedConnections = user.connections.filter(conn => conn.status === 'accepted');

    res.status(200).json({
      success: true,
      data: {
        pendingRequests,
        acceptedConnections,
        followers: user.followers,
        following: user.following,
        followersCount: user.followers.length,
        followingCount: user.following.length
      }
    });

  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching connections'
    });
  }
};

// Remove connection
exports.removeConnection = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?._id?.toString();

    if (!currentUserId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to remove connections'
      });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(userId)
    ]);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    ensureArrayField(currentUser, 'connections');
    ensureArrayField(targetUser, 'connections');

    // Remove from current user's connections
    currentUser.connections = currentUser.connections.filter(
      conn => conn.user.toString() !== userId
    );

    // Remove from target user's connections
    targetUser.connections = targetUser.connections.filter(
      conn => conn.user.toString() !== currentUserId
    );

    await Promise.all([
      currentUser.save(),
      targetUser.save()
    ]);

    await removeFollowRelation(currentUserId, userId);
    await removeFollowRelation(userId, currentUserId);

    res.status(200).json({
      success: true,
      message: 'Connection removed successfully'
    });

  } catch (error) {
    console.error('Remove connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while removing connection'
    });
  }
};
