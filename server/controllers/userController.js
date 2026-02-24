const nodemailer = require('nodemailer');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/users'); // Model name fixed

const JWT_SECRET = process.env.JWT_SECRET || 'fallbacksecret';

require('dotenv').config();

// Nodemailer transporter - uses Ethereal for testing if Gmail credentials fail
let transport;

const setupTransporter = async () => {
  // Try Gmail first if credentials exist
  if (process.env.EMAIL_ADDRESS && process.env.EMAIL_PASS) {
    transport = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_ADDRESS,
        pass: process.env.EMAIL_PASS
      }
    });
    
    // Verify connection
    try {
      await transport.verify();
      console.log('✅ Gmail transporter ready');
      return;
    } catch (err) {
      console.log('⚠️ Gmail auth failed, falling back to Ethereal test account');
    }
  }
  
  // Fallback to Ethereal test account
  const testAccount = await nodemailer.createTestAccount();
  transport = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass
    }
  });
  console.log('✅ Using Ethereal test email account');
  console.log('📧 Test emails will be viewable at: https://ethereal.email');
  console.log('   Login: ' + testAccount.user);
};

// Initialize transporter
setupTransporter();

// Helper to send email and get preview URL for Ethereal
const sendEmail = async (mailOptions) => {
  if (!transport) await setupTransporter();
  const info = await transport.sendMail(mailOptions);
  
  // If using Ethereal, log the preview URL
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log('📧 Preview OTP email at: ' + previewUrl);
  }
  return info;
};

// Generate 6-digit OTP
const generateOtp = () => crypto.randomInt(100000, 999999).toString();

// REGISTER
exports.register = async (req, res) => {
  try {
    const { name, password, email, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Try to send email FIRST before saving user
    try {
      await sendEmail({
        from: process.env.EMAIL_ADDRESS || 'noreply@investorconnect.com',
        to: email,
        subject: "Your OTP for Investor Connect",
        text: `Your OTP is ${otp}. It will expire in 10 minutes.`
      });
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
      return res.status(500).json({ message: "Failed to send OTP email. Please try again later." });
    }

    // Only save user after email is sent successfully
    user = new User({ name, email, password, confirmPassword, otp, otpExpiry, isVerified: false });
    await user.save();

    res.status(200).json({ message: "OTP sent successfully. Check your email or console for preview link." });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
};

// VERIFY OTP
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    // Add explicit selection of OTP fields
    const user = await User.findOne({ email }).select('+otp +otpExpiry');
    
    if (!user) {
      console.log(`User not found for email: ${email}`);
      return res.status(404).json({ message: "User not found" });
    }

    console.log(`User found: ${user.email}`);
    console.log(`DB OTP: ${user.otp}, DB Expiry: ${user.otpExpiry}`);
    console.log(`Received OTP: ${otp}`);

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified" });
    }

    // Check if OTP exists in document
    if (user.otp === undefined || user.otp === null) {
      console.log("OTP missing in user document");
      return res.status(400).json({ message: "No OTP generated for this user" });
    }

    // Check expiry first
    if (new Date() > user.otpExpiry) {
      console.log("OTP expired - Current time:", new Date(), "Expiry:", user.otpExpiry);
      return res.status(400).json({ message: "OTP expired" });
    }

    // Compare OTPs
    if (user.otp.toString() !== otp.toString()) {
      console.log(`OTP mismatch: DB(${typeof user.otp})=${user.otp} vs Input(${typeof otp})=${otp}`);
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Update verification status
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    
    await user.save();
    res.status(200).json({ message: "User verified successfully" });

  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
// RESEND OTP
exports.resendOTP = async (req, res) => {
  try {

    
    const { email } = req.body;
    
    // Select hidden fields
    const user = await User.findOne({ email }).select('+otp +otpExpiry');
    
    if (!user) {
      return res.status(404).json({ message: "User does not exist" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified" });
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await user.save();

    await transport.sendMail({
      from: process.env.EMAIL_ADDRESS, // Use environment variable
      to: email,
      subject: "Your new OTP",
      text: `Your OTP is ${otp}`
    });

    res.status(200).json({ message: "OTP resent successfully" });

  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// REQUEST PASSWORD RESET
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.isVerified) {
      return res.status(400).json({ success: false, message: 'Account is not verified yet. Please verify first.' });
    }

    const otp = generateOtp();
    user.resetOtp = otp;
    user.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    user.resetOtpVerified = false;
    user.resetOtpVerifiedAt = null;
    await user.save();

    await transport.sendMail({
      from: process.env.EMAIL_ADRESS,
      to: email,
      subject: 'Password Reset OTP',
      text: `Your password reset OTP is ${otp}. It expires in 10 minutes.`
    });

    res.status(200).json({ success: true, message: 'Password reset OTP sent to your email.' });
  } catch (error) {
    console.error('Password reset OTP error:', error);
    res.status(500).json({ success: false, message: 'Unable to process password reset request.' });
  }
};

// VERIFY PASSWORD RESET OTP
exports.verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');

    if (!user || !user.resetOtp) {
      return res.status(404).json({ success: false, message: 'No reset request found for this account.' });
    }

    if (new Date() > user.resetOtpExpiry) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }

    if (user.resetOtp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please double-check and try again.' });
    }

    user.resetOtpVerified = true;
    user.resetOtpVerifiedAt = new Date();
    await user.save();

    res.status(200).json({ success: true, message: 'OTP verified. You can now reset your password.' });
  } catch (error) {
    console.error('Verify reset OTP error:', error);
    res.status(500).json({ success: false, message: 'Unable to verify OTP at the moment.' });
  }
};

// RESET PASSWORD
exports.resetPasswordWithOtp = async (req, res) => {
  try {
    const { email, otp, password, confirmPassword } = req.body;

    if (!email || !otp || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Email, OTP, and new password are required.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    const user = await User.findOne({ email }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');

    if (!user || !user.resetOtp) {
      return res.status(404).json({ success: false, message: 'No reset request found for this account.' });
    }

    if (new Date() > user.resetOtpExpiry) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }

    if (user.resetOtp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP provided.' });
    }

    if (!user.resetOtpVerified) {
      return res.status(400).json({ success: false, message: 'Please verify the OTP before resetting your password.' });
    }

    user.password = password;
    user.confirmPassword = password;
    user.resetOtp = null;
    user.resetOtpExpiry = null;
    user.resetOtpVerified = false;
    user.resetOtpVerifiedAt = null;

    await user.save();

    res.status(200).json({ success: true, message: 'Password updated successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Unable to reset password at the moment.' });
  }
};

// LOGIN
exports.userLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (user.password !== password) {
      return res.status(400).json({ success: false, message: "Incorrect password" });
    }

    if (!user.isVerified) {
      return res.status(400).json({ success: false, message: "User not verified" });
    }

    req.session.user = { id: user._id, email: user.email, name: user.name };

    const token = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: "Unable to login", error });
  }
};

// LOGOUT
exports.logoutUser = async (req, res) => {
  try {
    req.session.destroy(err => {
      if (err) return res.status(400).json({ message: "Unable to logout", err });
      res.status(200).json({ message: "Session ended" });
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// DASHBOARD
exports.dashboard = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Not logged in" });
  }
  res.json({ message: `Welcome ${req.session.user.name}` });
};
