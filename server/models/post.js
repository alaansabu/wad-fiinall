const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const postSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  imageUrl: {
    type: String,
    default: null
  },
  videoUrl: {
    type: String,
    default: null
  },
  location: {
    type: String,
    trim: true,
    maxlength: 200,
    default: null
  },
  categories: [{
    type: String,
    trim: true,
    maxlength: 40
  }],
  tags: [{
    type: String,
    trim: true,
    maxlength: 20
  }],
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [commentSchema]
}, {
  timestamps: true
});

// Index for better query performance
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ likes: -1 });
postSchema.index({ tags: 1 });
postSchema.index({ categories: 1 });

// Virtual for like count
postSchema.virtual('likeCount').get(function() {
  return Array.isArray(this.likes) ? this.likes.length : 0;
});

// Virtual for comment count
postSchema.virtual('commentCount').get(function() {
  return Array.isArray(this.comments) ? this.comments.length : 0;
});

// Ensure virtual fields are serialized
postSchema.set('toJSON', { virtuals: true });
postSchema.set('toObject', { virtuals: true });

const Post = mongoose.model('Post', postSchema);

// Drop legacy geospatial index so string-based locations can be saved
const removeLegacyLocationIndex = async () => {
  try {
    const indexes = await Post.collection.indexes();
    const hasLegacyIndex = indexes.some(index => index.name === 'location_2dsphere');

    if (hasLegacyIndex) {
      await Post.collection.dropIndex('location_2dsphere');
      console.log('Removed legacy location_2dsphere index from posts collection');
    }
  } catch (error) {
    if (error.codeName !== 'IndexNotFound') {
      console.warn('Failed to drop legacy location index:', error.message);
    }
  }
};

if (mongoose.connection.readyState === 1) {
  removeLegacyLocationIndex();
} else {
  mongoose.connection.once('connected', removeLegacyLocationIndex);
}

module.exports = Post;