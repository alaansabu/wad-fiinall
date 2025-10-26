const Profile = require('../models/profile');
const User = require('../models/users');

// @desc    Get user profile
// @route   GET /api/profile/me
// @access  Private
const getMyProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.user.id })
      .populate('user', ['email', 'username']); // Adjust based on your User model

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Ensure counts are always present explicitly
    const profileObj = profile.toObject({ virtuals: true });
    profileObj.followersCount = Array.isArray(profileObj.followers) ? profileObj.followers.length : (profileObj.followersCount || 0);
    profileObj.followingCount = Array.isArray(profileObj.following) ? profileObj.following.length : (profileObj.followingCount || 0);

    res.json({
      success: true,
      data: profileObj
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create or update user profile
// @route   POST /api/profile
// @access  Private
const createOrUpdateProfile = async (req, res) => {
  try {
    const {
      firstName,
      surname,
      age,
      dob,
      phone,
      bio,
      socialLinks,
      investmentInterests,
      investmentStage,
      location
    } = req.body;

    // Build profile object
    const profileFields = {
      user: req.user.id,
      firstName,
      surname,
      age,
      dob,
      phone,
      bio
    };

    // Add optional fields if provided
    if (socialLinks) profileFields.socialLinks = socialLinks;
    if (investmentInterests) profileFields.investmentInterests = investmentInterests;
    if (investmentStage) profileFields.investmentStage = investmentStage;
    if (location) profileFields.location = location;
    if (req.file) {
      // Save relative path pointing to the public uploads/images directory
      profileFields.profilePicture = `/uploads/images/${req.file.filename}`;
    }

    let profile = await Profile.findOne({ user: req.user.id });

    if (profile) {
      // Update existing profile
      profile = await Profile.findOneAndUpdate(
        { user: req.user.id },
        { $set: profileFields },
        { new: true, runValidators: true }
      ).populate('user', ['email', 'username']);

      const updated = profile.toObject({ virtuals: true });
      updated.followersCount = Array.isArray(updated.followers) ? updated.followers.length : (updated.followersCount || 0);
      updated.followingCount = Array.isArray(updated.following) ? updated.following.length : (updated.followingCount || 0);

      return res.json({
        success: true,
        message: 'Profile updated successfully',
        data: updated
      });
    }

    // Create new profile
    profile = new Profile(profileFields);
    await profile.save();
    
    // We need to populate the user details on creation as well
    const newProfile = await Profile.findById(profile._id).populate('user', ['email', 'username']);

    const created = newProfile.toObject({ virtuals: true });
    created.followersCount = Array.isArray(created.followers) ? created.followers.length : (created.followersCount || 0);
    created.followingCount = Array.isArray(created.following) ? created.following.length : (created.followingCount || 0);

    res.status(201).json({
      success: true,
      message: 'Profile created successfully',
      data: created
    });
  } catch (error) {
    console.error('Create/update profile error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get profile by user ID
// @route   GET /api/profile/user/:userId
// @access  Public
const getProfileByUserId = async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.params.userId })
      .populate('user', ['username', 'email']);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    const profileObj = profile.toObject({ virtuals: true });
    profileObj.followersCount = Array.isArray(profileObj.followers) ? profileObj.followers.length : (profileObj.followersCount || 0);
    profileObj.followingCount = Array.isArray(profileObj.following) ? profileObj.following.length : (profileObj.followingCount || 0);

    res.json({
      success: true,
      data: profileObj
    });
  } catch (error) {
    console.error('Get profile by user ID error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get all profiles
// @route   GET /api/profiles
// @access  Public
const getAllProfiles = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      interests, 
      stage, 
      country 
    } = req.query;

    let query = {};
    
    // Filter by investment interests
    if (interests) {
      query.investmentInterests = { $in: interests.split(',') };
    }
    
    // Filter by investment stage
    if (stage) {
      query.investmentStage = stage;
    }
    
    // Filter by country
    if (country) {
      query['location.country'] = new RegExp(country, 'i');
    }

    const profiles = await Profile.find(query)
      .populate('user', ['username', 'email'])
      .select('-__v')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Profile.countDocuments(query);

    res.json({
      success: true,
      data: profiles,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get all profiles error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete profile
// @route   DELETE /api/profile
// @access  Private
const deleteProfile = async (req, res) => {
  try {
    await Profile.findOneAndRemove({ user: req.user.id });
    
    res.json({
      success: true,
      message: 'Profile deleted successfully'
    });
  } catch (error) {
    console.error('Delete profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Follow or unfollow a user
// @route   POST /api/profile/user/:userId/follow
// @access  Private
const toggleFollow = async (req, res) => {
  try {
    const targetUserId = req.params.userId;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Target user is required'
      });
    }

    if (targetUserId.toString() === req.user.id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot follow yourself'
      });
    }

    const [targetProfile, followerProfile] = await Promise.all([
      Profile.findOne({ user: targetUserId }),
      Profile.findOne({ user: req.user.id })
    ]);

    if (!targetProfile) {
      return res.status(404).json({
        success: false,
        message: 'Target profile not found'
      });
    }

    if (!followerProfile) {
      return res.status(400).json({
        success: false,
        message: 'Create your profile before following others'
      });
    }

    targetProfile.followers = targetProfile.followers || [];
    followerProfile.following = followerProfile.following || [];

    const alreadyFollowing = targetProfile.followers.some(
      followerId => followerId.toString() === req.user.id.toString()
    );

    if (alreadyFollowing) {
      targetProfile.followers = targetProfile.followers.filter(
        followerId => followerId.toString() !== req.user.id.toString()
      );
      followerProfile.following = followerProfile.following.filter(
        followedId => followedId.toString() !== targetUserId.toString()
      );
    } else {
      targetProfile.followers.push(req.user.id);
      followerProfile.following.push(targetUserId);
    }

    await Promise.all([targetProfile.save(), followerProfile.save()]);

    res.json({
      success: true,
      data: {
        isFollowing: !alreadyFollowing,
        followersCount: targetProfile.followers.length,
        followingCount: followerProfile.following.length
      },
      message: alreadyFollowing ? 'Unfollowed user' : 'Started following user'
    });
  } catch (error) {
    console.error('Toggle follow error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getMyProfile,
  createOrUpdateProfile,
  getProfileByUserId,
  getAllProfiles,
  deleteProfile,
  toggleFollow
};