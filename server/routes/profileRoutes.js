const express = require('express');
const router = express.Router();
const {
  getMyProfile,
  createOrUpdateProfile,
  getProfileByUserId,
  getAllProfiles,
  deleteProfile,
  toggleFollow
} = require('../controllers/profileController');
const { protect } = require('../middleware/authMiddleware');
const { validateProfile } = require('../middleware/validationMiddleware');
const upload = require('../middleware/uploadMiddleware');

// @route   GET /api/profile/me
// @desc    Get current user's profile
// @access  Private
router.get('/me', protect, getMyProfile);

// @route   POST /api/profile
// @desc    Create or update user profile
// @access  Private
router.post(
  '/',
  protect,
  upload.single('profilePicture'), // Use your existing upload middleware
  validateProfile,
  createOrUpdateProfile
);

// @route   GET /api/profile/user/:userId
// @desc    Get profile by user ID
// @access  Public
router.get('/user/:userId', getProfileByUserId);

// @route   POST /api/profile/user/:userId/follow
// @desc    Follow or unfollow a user profile
// @access  Private
router.post('/user/:userId/follow', protect, toggleFollow);

// @route   GET /api/profiles
// @desc    Get all profiles with filtering
// @access  Public
router.get('/', getAllProfiles);

// @route   DELETE /api/profile
// @desc    Delete profile
// @access  Private
router.delete('/', protect, deleteProfile);

module.exports = router;