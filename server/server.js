const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const path = require('path');
const connectDb = require("./config/connect")
const userRoutes = require('./routes/userRoutes')
const postRoutes = require('./routes/postRoutes');
const profileRoutes = require('./routes/profileRoutes');
const connectionRoutes = require('./routes/connectionRoutes');
const meetingRoutes = require('./routes/meetingRoutes');
const messageRoutes = require('./routes/messageRoutes');
const chatbotRoutes = require('./routes/chatboatRoutes'); // ✅ ADDED CHATBOT ROUTES
const socket = require('./socket');
const session = require("express-session");
const { initMeetingReminder } = require('./scheduler/meetingReminder');

dotenv.config();

connectDb()
const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: "supersecreatkey",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}))

const cors = require("cors");
// Broaden CORS during development to allow opening client pages from various dev ports or file:// (Origin: null)
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or same-origin)
    if (!origin) return callback(null, true);
    const allowed = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5000',
      'http://127.0.0.1:5000',
      'http://localhost:5500', // Live Server default
      'http://127.0.0.1:5500',
      'null' // some browsers send Origin: null for file://
    ];
    if (allowed.includes(origin)) return callback(null, true);
    // As a dev fallback, allow any local origin; tighten in prod
    if (/^http:\/\/localhost:\d+$/i.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/i.test(origin)) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Serve static files from client folder
app.use(express.static(path.join(__dirname, '../client')));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve index.html as root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// API Routes
app.use('/api/v1/userAuth', userRoutes);
app.use('/api/v1/posts', postRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/connections', connectionRoutes);
app.use('/api/v1/meetings', meetingRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/chatbot', chatbotRoutes); // ✅ ADDED CHATBOT ROUTES

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large. Images must be 5MB or less and videos 50MB or less.'
    });
  }
  
  // Multer file type error
  if (['Only image or video files are allowed!', 'Unsupported media type'].includes(err.message)) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? {} : err.message
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API route not found'
  });
});

// For client-side routing - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Initialize Socket.IO
socket.init(httpServer, { corsOrigin: 'http://localhost:3000', jwtSecret: process.env.JWT_SECRET || 'fallbacksecret' });

httpServer.listen(PORT, (error) => {
  if (error) {
    console.log('Server error:', error);
  } else {
    console.log(`Server running successfully at port ${PORT}`);
    // Start background scheduler for 5-minute email reminders
    try { initMeetingReminder(); } catch (e) { console.error('Failed to start reminder scheduler:', e?.message || e); }
  }
});