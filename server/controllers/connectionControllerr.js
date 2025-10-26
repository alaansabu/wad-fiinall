const User = require('../models/users');

// Send connection request
exports.sendConnectionRequest = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.session.user.id;

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
    const existingConnection = currentUser.connections.find(
      conn => conn.user.toString() === userId && conn.status === 'pending'
    );

    if (existingConnection) {
      return res.status(400).json({
        success: false,
        message: 'Connection request already sent'
      });
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

    await Promise.all([currentUser.save(), targetUser.save()]);

    res.status(200).json({
      success: true,
      message: 'Connection request sent successfully'
    });

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
    const currentUserId = req.session.user.id;

    const currentUser = await User.findById(currentUserId);

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

    await Promise.all([currentUser.save(), targetUser.save()]);

    res.status(200).json({
      success: true,
      message: 'Connection request accepted'
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
    const currentUserId = req.session.user.id;

    const currentUser = await User.findById(currentUserId);

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
    const targetConnection = targetUser.connections.find(
      conn => conn.user.toString() === currentUserId
    );
    if (targetConnection) {
      targetUser.connections.pull(targetConnection._id);
    }

    await Promise.all([currentUser.save(), targetUser.save()]);

    res.status(200).json({
      success: true,
      message: 'Connection request rejected'
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
    const userId = req.session.user.id;
    const user = await User.findById(userId)
      .populate('connections.user', 'name email profilePicture bio location')
      .populate('followers', 'name email profilePicture bio location')
      .populate('following', 'name email profilePicture bio location');

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
    const currentUserId = req.session.user.id;

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(userId)
    ]);

    // Remove from current user's connections
    currentUser.connections = currentUser.connections.filter(
      conn => conn.user.toString() !== userId
    );

    // Remove from target user's connections
    targetUser.connections = targetUser.connections.filter(
      conn => conn.user.toString() !== currentUserId
    );

    await Promise.all([currentUser.save(), targetUser.save()]);

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