const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    minlength: [2, 'First name must be at least 2 characters'],
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  surname: {
    type: String,
    required: [true, 'Surname is required'],
    trim: true,
    minlength: [2, 'Surname must be at least 2 characters'],
    maxlength: [50, 'Surname cannot exceed 50 characters']
  },
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: [18, 'You must be at least 18 years old'],
    max: [120, 'Age cannot exceed 120']
  },
  dob: {
    type: Date,
    required: [true, 'Date of birth is required']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[0-9]{10,15}$/, 'Please enter a valid phone number (10-15 digits)']
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: ''
  },
  profilePicture: {
    type: String,
    default: null
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  socialLinks: {
    linkedin: { type: String, default: '' },
    twitter: { type: String, default: '' },
    website: { type: String, default: '' }
  },
  investmentInterests: [{
    type: String,
    enum: ['Tech Startups', 'Real Estate', 'Healthcare', 'Fintech', 'E-commerce', 'AI/ML', 'Clean Energy', 'Biotech', 'EdTech', 'Other']
  }],
  investmentStage: {
    type: String,
    enum: ['Angel', 'Seed', 'Series A', 'Series B', 'Series C+', 'Pre-IPO', 'All Stages'],
    default: 'Seed'
  },
  location: {
    city: { type: String, default: '' },
    country: { type: String, default: '' }
  }
}, {
  timestamps: true
});

// Index for faster queries
profileSchema.index({ user: 1 });
profileSchema.index({ 'location.country': 1 });
profileSchema.index({ investmentInterests: 1 });

// Virtual for full name
profileSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.surname}`;
});

profileSchema.virtual('followersCount').get(function() {
  return this.followers ? this.followers.length : 0;
});

profileSchema.virtual('followingCount').get(function() {
  return this.following ? this.following.length : 0;
});

// Ensure virtual fields are serialized
profileSchema.set('toJSON', { virtuals: true });
profileSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Profile', profileSchema);