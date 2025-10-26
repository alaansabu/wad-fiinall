const jwt = require('jsonwebtoken');
const User = require('./models/users');

let ioRef = null;
const userSockets = new Map(); // userId -> Set(socket.id)

function addUserSocket(userId, socketId) {
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(socketId);
}

function removeUserSocket(userId, socketId) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) userSockets.delete(userId);
}

function init(httpServer, opts = {}) {
  const { corsOrigin = ['http://localhost:3000', 'http://localhost:5000'], jwtSecret = process.env.JWT_SECRET || 'fallbacksecret' } = opts;
  const { Server } = require('socket.io');
  const io = new Server(httpServer, { cors: { origin: corsOrigin, credentials: true } });
  ioRef = io;

  io.on('connection', (socket) => {
    let authedUserId = null;

    socket.on('auth', async (token) => {
      try {
        if (!token) return;
        const t = token.replace('Bearer ', '').trim();
        const decoded = jwt.verify(t, jwtSecret);
        const userId = decoded.id || decoded.userId;
        if (!userId) return;
        const user = await User.findById(userId).select('_id');
        if (!user) return;
        authedUserId = user._id.toString();
        addUserSocket(authedUserId, socket.id);
        socket.emit('auth:ok');
      } catch (e) {
        socket.emit('auth:error', 'Invalid token');
      }
    });

    socket.on('disconnect', () => {
      if (authedUserId) removeUserSocket(authedUserId, socket.id);
    });
  });

  return io;
}

function getIo() {
  return ioRef;
}

function emitToUser(userId, event, payload) {
  if (!ioRef) return;
  const set = userSockets.get(userId?.toString());
  if (!set) return;
  for (const sid of set) {
    ioRef.to(sid).emit(event, payload);
  }
}

module.exports = { init, getIo, emitToUser };
