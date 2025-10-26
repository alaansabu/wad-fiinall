const express = require('express')
const {
	register,
	verifyOtp,
	resendOTP,
	userLogin,
	logoutUser,
	dashboard,
	requestPasswordReset,
	verifyResetOtp,
	resetPasswordWithOtp
} = require('../controllers/userController')
const authMiddleware = require('../middleware/authMiddleware')
const router = express.Router()

router.post('/register',register);
router.post('/verifyotp',verifyOtp);
router.post('/resendotp',resendOTP);
router.post('/login',userLogin);
router.post('/logout',logoutUser);
router.post('/forgot-password', requestPasswordReset);
router.post('/forgot-password/verify', verifyResetOtp);
router.post('/forgot-password/reset', resetPasswordWithOtp);
router.get('/dashboard',authMiddleware,dashboard)

module.exports = router;