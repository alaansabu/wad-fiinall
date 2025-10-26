const jwt = require('jsonwebtoken');
const User = require('../models/users');

const JWT_SECRET = process.env.JWT_SECRET || 'fallbacksecret';

const protect = async (req, res, next) => {
    try {
        const token = req.header('Authorization');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token, authorization denied'
            });
        }

        // Remove "Bearer " prefix if present
        const jwtToken = token.replace('Bearer ', '').trim();
        
        // Verify token
    const decoded = jwt.verify(jwtToken, JWT_SECRET);
        
        // Find user and attach to request
    const userId = decoded.id || decoded.userId;
    const user = await User.findById(userId).select('-password');
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Token is valid but user not found'
            });
        }

        req.user = user;
        next();

    } catch (error) {
        console.error('Auth middleware error:', error);

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired, please log in again'
            });
        }

        return res.status(401).json({
            success: false,
            message: 'Token is not valid'
        });
    }
};

module.exports = protect;
module.exports.protect = protect;