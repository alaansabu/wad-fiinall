const Post = require('../models/post');
const asyncHandler = require('express-async-handler');

// @desc    Create new post
// @route   POST /api/v1/posts
// @access  Private
const createPost = asyncHandler(async (req, res) => {
  console.log('Incoming createPost body:', req.body);
  let { title, content, tags, categories, category, latitude, longitude, address, location } = req.body;

  // Support location sent as JSON string or object (GeoJSON format)
  let parsedLocation = null;
  if (location) {
    try {
      parsedLocation = typeof location === 'string' ? JSON.parse(location) : location;
      if (
        parsedLocation &&
        parsedLocation.type === 'Point' &&
        Array.isArray(parsedLocation.coordinates) &&
        parsedLocation.coordinates.length === 2
      ) {
        longitude = longitude ?? parsedLocation.coordinates[0];
        latitude = latitude ?? parsedLocation.coordinates[1];
        address = address ?? parsedLocation.address ?? parsedLocation.placeName ?? null;
      }
    } catch (err) {
      console.warn('Failed to parse location payload:', err.message);
    }
  }

  let normalizedTags = [];
  if (Array.isArray(tags)) {
    normalizedTags = tags.map(tag => tag.trim()).filter(Boolean);
  } else if (typeof tags === 'string') {
    normalizedTags = tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  // Normalize categories (array or comma-separated) and map single 'category' fallback
  let normalizedCategories = [];
  if (Array.isArray(categories)) {
    normalizedCategories = categories.map(c => String(c).trim()).filter(Boolean);
  } else if (typeof categories === 'string') {
    normalizedCategories = categories.split(',').map(c => c.trim()).filter(Boolean);
  }
  if (!normalizedCategories.length && category) {
    normalizedCategories = [String(category).trim()].filter(Boolean);
  }

  // Basic validation
  if (!title || !content) {
    return res.status(400).json({
      success: false,
      message: 'Title and content are required'
    });
  }

  // Create post
  const latNum = latitude !== undefined && latitude !== null ? parseFloat(latitude) : null;
  const lngNum = longitude !== undefined && longitude !== null ? parseFloat(longitude) : null;
  const hasValidLocation = Number.isFinite(latNum) && Number.isFinite(lngNum);
  const locationText = address || parsedLocation?.address || parsedLocation?.placeName || null;

  const postData = {
    title,
    content,
    author: req.user._id,
    imageUrl: null,
    videoUrl: null,
    tags: normalizedTags,
    categories: normalizedCategories
  };

  // Add location if valid
  if (locationText) {
    postData.location = locationText;
  } else if (hasValidLocation) {
    postData.location = `Lat: ${latNum}, Lng: ${lngNum}`;
  }

  if (req.file) {
    if (req.file.mimetype.startsWith('video/')) {
      postData.videoUrl = `/uploads/videos/${req.file.filename}`;
    } else {
      postData.imageUrl = `/uploads/images/${req.file.filename}`;
    }
  }

  const post = await Post.create(postData);

  // Populate author details
  await post.populate('author', 'name username profilePicture firstName lastName email');

  res.status(201).json({
    success: true,
    data: post,
    message: 'Post created successfully'
  });
});

// @desc    Get all posts for explore page with pagination
// @route   GET /api/v1/posts
// @access  Public
const getPosts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Build query for filtering
  let query = {};
  
  // Filter by tags if provided
  if (req.query.tags) {
    const tags = req.query.tags.split(',').map(tag => tag.trim());
    query.tags = { $in: tags };
  }

  // Filter by author if provided
  if (req.query.author) {
    query.author = req.query.author;
  }

  // Filter by category/categories (primary: categories field; fallback: tags)
  if (req.query.category) {
    const val = String(req.query.category).trim();
    query.$or = [
      { categories: { $in: [val] } },
      { tags: { $in: [val] } }
    ];
  }
  if (req.query.categories) {
    const list = req.query.categories.split(',').map(v => v.trim()).filter(Boolean);
    if (list.length) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { categories: { $in: list } },
          { tags: { $in: list } }
        ]
      });
    }
  }

  // Search in title, content, and tags
  if (req.query.search) {
    const searchRegex = { $regex: req.query.search, $options: 'i' };
    query.$or = [
      { title: searchRegex },
      { content: searchRegex },
      { tags: { $in: [new RegExp(req.query.search, 'i')] } },
      { location: searchRegex },
      { 'location.address': searchRegex }
    ];
  }

  // Location filter - search in human-readable location text
  if (req.query.location) {
    const locationRegex = { $regex: req.query.location, $options: 'i' };
    query.$and = query.$and || [];
    // Support both new string field and legacy GeoJSON documents
    query.$and.push({
      $or: [
        { location: locationRegex },
        { 'location.address': locationRegex }
      ]
    });
  }

  console.log('Database Query:', query); // Debug log

  try {
    // Get posts with pagination
    const posts = await Post.find(query)
  .populate('author', 'name username profilePicture firstName lastName email')
  .populate('likes', 'name username profilePicture firstName lastName email')
  .populate('comments.user', 'name username profilePicture firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Transform posts for frontend
    const transformedPosts = posts.map(post => {
      const postObj = post.toObject ? post.toObject() : { ...post };

      // Ensure likeCount and commentCount exist
      if (!postObj.likeCount && postObj.likes) {
        postObj.likeCount = postObj.likes.length;
      }
      
      if (!postObj.commentCount && postObj.comments) {
        postObj.commentCount = postObj.comments.length;
      }
      
      return postObj;
    });

    // Get total count for pagination
    const total = await Post.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: transformedPosts,
      pagination: {
        current: page,
        total: totalPages,
        count: transformedPosts.length,
        totalItems: total
      }
    });
  } catch (error) {
    console.error('Error in getPosts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching posts',
      error: error.message
    });
  }
});

// @desc    Get single post by ID
// @route   GET /api/v1/posts/:id
// @access  Public
const getPostById = asyncHandler(async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'name username profilePicture firstName lastName email')
      .populate('likes', 'name username profilePicture firstName lastName email')
      .populate('comments.user', 'name username profilePicture firstName lastName email');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Transform location data for frontend
    const postObj = post.toObject ? post.toObject() : { ...post };
    
    // Ensure virtual fields exist
    if (!postObj.likeCount && postObj.likes) {
      postObj.likeCount = postObj.likes.length;
    }
    
    if (!postObj.commentCount && postObj.comments) {
      postObj.commentCount = postObj.comments.length;
    }

    res.json({
      success: true,
      data: postObj
    });
  } catch (error) {
    console.error('Error in getPostById:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching post',
      error: error.message
    });
  }
});

// @desc    Update post
// @route   PUT /api/v1/posts/:id
// @access  Private (Author only)
const updatePost = asyncHandler(async (req, res) => {
  let post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }

  // Check if user is the author
  if (post.author.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this post'
    });
  }

  const { title, content, tags, categories, category, latitude, longitude, address, location } = req.body;

  // Update fields
  if (title) post.title = title;
  if (content) post.content = content;
  
  if (tags) {
    if (Array.isArray(tags)) {
      post.tags = tags.map(tag => tag.trim()).filter(Boolean);
    } else if (typeof tags === 'string') {
      post.tags = tags.split(',').map(tag => tag.trim()).filter(Boolean);
    }
  }

  // Update categories if provided (array or comma-separated), support single 'category'
  if (categories || category) {
    let normalizedCategories = [];
    if (Array.isArray(categories)) {
      normalizedCategories = categories.map(c => String(c).trim()).filter(Boolean);
    } else if (typeof categories === 'string') {
      normalizedCategories = categories.split(',').map(c => c.trim()).filter(Boolean);
    }
    if (!normalizedCategories.length && category) {
      normalizedCategories = [String(category).trim()].filter(Boolean);
    }
    post.categories = normalizedCategories;
  }
  
  if (req.file) {
    if (req.file.mimetype.startsWith('video/')) {
      post.videoUrl = `/uploads/videos/${req.file.filename}`;
      post.imageUrl = null;
    } else {
      post.imageUrl = `/uploads/images/${req.file.filename}`;
      post.videoUrl = null;
    }
  }

  // Update location if provided
  let locationText = address || null;
  if (!locationText && location) {
    try {
      const parsedLocation = typeof location === 'string' ? JSON.parse(location) : location;
      if (parsedLocation) {
        locationText = parsedLocation.address || parsedLocation.placeName || (parsedLocation.type === 'Point' && Array.isArray(parsedLocation.coordinates)
          ? `Lat: ${parsedLocation.coordinates[1]}, Lng: ${parsedLocation.coordinates[0]}`
          : null);
      }
    } catch (err) {
      locationText = typeof location === 'string' ? location : null;
    }
  }

  if (!locationText && latitude !== undefined && longitude !== undefined) {
    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
      locationText = `Lat: ${latNum}, Lng: ${lngNum}`;
    }
  }

  if (locationText) {
    post.location = locationText;
  }

  await post.save();

  // Populate author details
  await post.populate('author', 'name username profilePicture firstName lastName email');

  // Transform location for response
  const postObj = post.toObject ? post.toObject() : { ...post };
  if (postObj.location && postObj.location.coordinates) {
    postObj.location = {
      longitude: postObj.location.coordinates[0],
      latitude: postObj.location.coordinates[1],
      address: postObj.location.address || null
    };
  }

  res.json({
    success: true,
    data: postObj,
    message: 'Post updated successfully'
  });
});

// @desc    Delete post
// @route   DELETE /api/v1/posts/:id
// @access  Private (Author only)
const deletePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }

  // Check if user is the author
  if (post.author.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this post'
    });
  }

  await Post.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'Post deleted successfully'
  });
});

// @desc    Like/unlike post
// @route   POST /api/v1/posts/:id/like
// @access  Private
const likePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }

  const userId = req.user._id;
  const hasLiked = post.likes.includes(userId);

  if (hasLiked) {
    // Unlike the post
    post.likes = post.likes.filter(like => like.toString() !== userId.toString());
    await post.save();
    
    res.json({
      success: true,
      data: { 
        liked: false, 
        likeCount: post.likes.length 
      },
      message: 'Post unliked successfully'
    });
  } else {
    // Like the post
    post.likes.push(userId);
    await post.save();
    
    res.json({
      success: true,
      data: { 
        liked: true, 
        likeCount: post.likes.length 
      },
      message: 'Post liked successfully'
    });
  }
});

// @desc    Add comment to post
// @route   POST /api/v1/posts/:id/comments
// @access  Private
const addComment = asyncHandler(async (req, res) => {
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({
      success: false,
      message: 'Comment content is required'
    });
  }

  const post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }

  // Add comment
  post.comments.push({
    user: req.user._id,
    content
  });

  await post.save();

  // Populate the new comment's user details
  await post.populate('comments.user', 'username profilePicture firstName lastName');

  const newComment = post.comments[post.comments.length - 1];

  res.status(201).json({
    success: true,
    data: newComment,
    message: 'Comment added successfully'
  });
});

// @desc    Delete comment
// @route   DELETE /api/v1/posts/:postId/comments/:commentId
// @access  Private (Comment author or post author)
const deleteComment = asyncHandler(async (req, res) => {
  const { postId, commentId } = req.params;

  const post = await Post.findById(postId);

  if (!post) {
    return res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }

  const comment = post.comments.id(commentId);

  if (!comment) {
    return res.status(404).json({
      success: false,
      message: 'Comment not found'
    });
  }

  // Check if user is comment author or post author
  const isCommentAuthor = comment.user.toString() === req.user._id.toString();
  const isPostAuthor = post.author.toString() === req.user._id.toString();

  if (!isCommentAuthor && !isPostAuthor) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this comment'
    });
  }

  // Remove comment
  post.comments = post.comments.filter(comment => comment._id.toString() !== commentId);
  await post.save();

  res.json({
    success: true,
    message: 'Comment deleted successfully'
  });
});

// @desc    Request meeting for a post
// @route   POST /api/v1/posts/:id/meeting
// @access  Private
const requestMeeting = asyncHandler(async (req, res) => {
  const { date, time, message } = req.body;
  
  if (!date || !time || !message) {
    return res.status(400).json({
      success: false,
      message: 'Date, time, and message are required'
    });
  }

  const post = await Post.findById(req.params.id);
  
  if (!post) {
    return res.status(404).json({
      success: false,
      message: 'Post not found'
    });
  }

  // In a real application, you would:
  // 1. Save meeting request to database
  // 2. Send email notification to post author
  // 3. Notify both parties
  
  console.log('Meeting request received:', {
    postId: req.params.id,
    requestedBy: req.user._id,
    date,
    time,
    message
  });

  res.json({
    success: true,
    message: 'Meeting request sent successfully',
    data: {
      meeting: {
        date,
        time,
        message,
        requestedBy: req.user._id,
        post: post._id,
        postAuthor: post.author
      }
    }
  });
});

module.exports = {
  createPost,
  getPosts,
  getPostById,
  updatePost,
  deletePost,
  likePost,
  addComment,
  deleteComment,
  requestMeeting
};