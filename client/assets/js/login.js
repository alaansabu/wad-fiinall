// =============================
// LOGIN & SIGNUP PAGE HANDLER
// =============================

// State variables
let currentUserEmail = null;
let resetEmail = null;
let verifiedResetOtp = null;

// =============================
// API BASE URL
// =============================
const BASE_URL = "http://localhost:5000/api/v1/userAuth";

// =============================
// DOM ELEMENTS
// =============================
const signup = document.querySelector(".sign_up");
const loginContainer = document.querySelector(".login-container");

// =============================
// EVENT LISTENERS
// =============================
document.addEventListener("DOMContentLoaded", () => {
  console.log("Login page loaded");
  
  // Check if user is already logged in
  checkExistingAuth();

  // Login form handler
  const loginForm = document.querySelector("#loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  // Signup toggle handler
  if (signup) {
    signup.addEventListener("click", showSignupForm);
  }

  const forgotPasswordLink = document.querySelector("#forgotPasswordLink");
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", showForgotPassword);
  }

  const forgotPasswordForm = document.querySelector("#forgotPasswordForm");
  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", handleForgotPasswordRequest);
  }

  const resetOtpForm = document.querySelector("#resetOtpForm");
  if (resetOtpForm) {
    resetOtpForm.addEventListener("submit", handleResetOtpVerification);
  }

  const resendResetOtpBtn = document.querySelector("#resendResetOtpBtn");
  if (resendResetOtpBtn) {
    resendResetOtpBtn.addEventListener("click", resendResetOtp);
  }

  const resetPasswordForm = document.querySelector("#resetPasswordForm");
  if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", handlePasswordReset);
  }

  const backToLoginBtn = document.querySelector("#backToLoginBtn");
  if (backToLoginBtn) {
    backToLoginBtn.addEventListener("click", restoreLoginView);
  }
});

// =============================
// CHECK EXISTING AUTHENTICATION
// =============================
function checkExistingAuth() {
  const token = localStorage.getItem("token");
  const user = localStorage.getItem("user");
  
  console.log("Existing auth check:");
  console.log("Token:", token);
  console.log("User:", user);
  
  if (token && user) {
    console.log("User already logged in, redirecting...");
    // Optional: Redirect to home if already logged in
    // window.location.href = "index.html";
  }
}

// =============================
// LOGIN FUNCTION - IMPROVED
// =============================
async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.querySelector("#loginEmail").value.trim();
  const password = document.querySelector("#loginPassword").value;

  if (!email || !password) {
    alert("❌ Please fill in all fields");
    return;
  }

  // Show loading state
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
  submitBtn.disabled = true;

  try {
    console.log("Attempting login with:", { email, password: "***" });
    
    const res = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    
    console.log("Login API Response:", data);
    console.log("Response status:", res.status);

    if (res.ok && data.success) {
      console.log("✅ Login successful, processing response...");
      
      // Clear any existing auth data
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("userEmail");
      
      // Save authentication data - handle different response structures
      let tokenSaved = false;
      let userSaved = false;
      
      // Try different possible token locations in response
      if (data.token) {
        localStorage.setItem("token", data.token);
        tokenSaved = true;
        console.log("✅ Token saved from data.token");
      } else if (data.data && data.data.token) {
        localStorage.setItem("token", data.data.token);
        tokenSaved = true;
        console.log("✅ Token saved from data.data.token");
      }
      
      // Try different possible user locations in response
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
        userSaved = true;
        console.log("✅ User saved from data.user");
      } else if (data.data && data.data.user) {
        localStorage.setItem("user", JSON.stringify(data.data.user));
        userSaved = true;
        console.log("✅ User saved from data.data.user");
      } else {
        // Create minimal user object from available data
        const userObj = {
          email: email,
          name: data.name || email.split('@')[0]
        };
        localStorage.setItem("user", JSON.stringify(userObj));
        userSaved = true;
        console.log("✅ User saved from constructed object");
      }
      
      // Always save email
      localStorage.setItem("userEmail", email);
      
      console.log("Final localStorage state:");
      console.log("Token:", localStorage.getItem("token"));
      console.log("User:", localStorage.getItem("user"));
      console.log("UserEmail:", localStorage.getItem("userEmail"));
      
      if (!tokenSaved) {
        console.warn("⚠️ No token found in response. Posts may not work.");
      }
      
      alert("✅ Login successful! Redirecting...");
      
      // Brief delay to ensure localStorage is updated
      setTimeout(() => {
        window.location.href = "index.html";
      }, 500);
      
    } else {
      // Login failed
      const errorMessage = data.message || "Invalid login credentials";
      console.error("❌ Login failed:", errorMessage);
      alert(`❌ ${errorMessage}`);
    }
  } catch (err) {
    console.error("🚨 Login error:", err);
    alert("❌ Server error. Please try again later.");
  } finally {
    // Restore button state
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

// =============================
// SHOW SIGNUP FORM
// =============================
function showSignupForm() {
  loginContainer.innerHTML = `
    <h1>Sign Up</h1>
    <div class="innerContainer">
      <form id="signupForm">
        <input type="text" id="username" placeholder="Full Name" required>
        <input type="email" id="gmail" placeholder="Email" required>
        <input type="password" id="password" placeholder="Password" required>
        <input type="password" id="confirmPassword" placeholder="Confirm Password" required>
        <button type="submit">Sign Up</button>
      </form>

      <!-- OTP Verification Section -->
      <div id="otpVerificationSection" class="otp-section hidden">
        <h3>Verify OTP</h3>
        <form id="otpForm">
          <input type="text" id="otpInput" placeholder="Enter OTP" maxlength="6" required>
          <button type="submit">Verify OTP</button>
          <p id="otpMessage"></p>
          <button type="button" id="resendOtpBtn" class="resend-btn">Resend OTP</button>
        </form>
      </div>

      <p class="reload">Back to Login</p>
    </div>
  `;

  const loginReload = document.querySelector(".reload");
  loginReload.addEventListener("click", () => location.reload());

  const signupForm = document.querySelector("#signupForm");
  signupForm.addEventListener("submit", registerUser);
}

// =============================
// REGISTER FUNCTION - IMPROVED
// =============================
async function registerUser(e) {
  e.preventDefault();
  
  const name = document.querySelector("#username").value.trim();
  const email = document.querySelector("#gmail").value.trim();
  const password = document.querySelector("#password").value;
  const confirmPassword = document.querySelector("#confirmPassword").value;

  if (password !== confirmPassword) {
    alert("❌ Passwords do not match!");
    return;
  }

  if (!name || !email || !password) {
    alert("❌ Please fill in all fields");
    return;
  }

  // Show loading state
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering...';
  submitBtn.disabled = true;

  try {
    console.log("Attempting registration:", { name, email, password: "***" });
    
    const res = await fetch(`${BASE_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, confirmPassword }),
    });

    const data = await res.json();
    console.log("Registration response:", data);

    if (res.ok) {
      alert("✅ OTP sent to your email. Please verify.");
      currentUserEmail = email;
      
      document.querySelector("#signupForm").classList.add("hidden");
      document.querySelector("#otpVerificationSection").classList.remove("hidden");

      attachOtpHandler(email);
    } else {
      alert(data.message || "❌ Registration failed");
    }
  } catch (err) {
    console.error("Registration error:", err);
    alert("❌ Server error. Try again later.");
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

// =============================
// OTP VERIFICATION HANDLER - IMPROVED
// =============================
function attachOtpHandler(email) {
  const otpForm = document.querySelector("#otpForm");
  const resendBtn = document.querySelector("#resendOtpBtn");
  const otpMessage = document.querySelector("#otpMessage");

  otpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const otp = document.querySelector("#otpInput").value.trim();

    if (!otp) {
      otpMessage.textContent = "❌ Please enter OTP";
      otpMessage.className = "error";
      return;
    }

    // Show loading
    const verifyBtn = e.target.querySelector('button[type="submit"]');
    const originalText = verifyBtn.innerHTML;
    verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    verifyBtn.disabled = true;

    try {
      const res = await fetch(`${BASE_URL}/verifyotp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await res.json();
      console.log("OTP verification response:", data);

      if (res.ok) {
        otpMessage.textContent = "✅ OTP verified successfully!";
        otpMessage.className = "success";
        
        // Auto-login after successful verification
        if (data.token || data.data?.token) {
          const token = data.token || data.data.token;
          const user = data.user || data.data?.user || { email, name: document.querySelector("#username")?.value || email.split('@')[0] };
          
          localStorage.setItem("token", token);
          localStorage.setItem("user", JSON.stringify(user));
          localStorage.setItem("userEmail", email);
          
          console.log("Auto-login after OTP verification successful");
          
          setTimeout(() => {
            alert("🎉 Registration complete! You are now logged in.");
            window.location.href = "index.html";
          }, 1500);
        } else {
          setTimeout(() => {
            alert("Registration complete! Please login now.");
            location.reload();
          }, 1500);
        }
      } else {
        otpMessage.textContent = "❌ " + (data.message || "Invalid OTP");
        otpMessage.className = "error";
      }
    } catch (err) {
      console.error("OTP verification error:", err);
      otpMessage.textContent = "❌ Server error. Try again later.";
      otpMessage.className = "error";
    } finally {
      verifyBtn.innerHTML = originalText;
      verifyBtn.disabled = false;
    }
  });

  resendBtn.addEventListener("click", async () => {
    // Show loading on resend button
    const originalText = resendBtn.innerHTML;
    resendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    resendBtn.disabled = true;

    try {
      const res = await fetch(`${BASE_URL}/resendotp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (res.ok) {
        otpMessage.textContent = "✅ OTP resent to your email!";
        otpMessage.className = "success";
        setTimeout(() => {
          otpMessage.textContent = "";
        }, 3000);
      } else {
        otpMessage.textContent = "❌ " + (data.message || "Failed to resend OTP");
        otpMessage.className = "error";
      }
    } catch (err) {
      console.error("Resend OTP error:", err);
      otpMessage.textContent = "❌ Server error. Try again later.";
      otpMessage.className = "error";
    } finally {
      resendBtn.innerHTML = originalText;
      resendBtn.disabled = false;
    }
  });
}

// =============================
// LOGOUT FUNCTION
// =============================
async function logoutUser() {
  try {
    // Clear localStorage first
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("userEmail");
    
    console.log("LocalStorage cleared, calling logout API...");
    
    const res = await fetch(`${BASE_URL}/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data = await res.json();
    alert(data.message || "Logged out successfully");
    
    // Redirect to login page
    window.location.href = "login.html";
  } catch (err) {
    console.error("Logout error:", err);
    // Still clear localStorage and redirect even if API call fails
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("userEmail");
    window.location.href = "login.html";
  }
}

// =============================
// UTILITY FUNCTIONS
// =============================
function getAuthToken() {
  return localStorage.getItem("token");
}

function getCurrentUser() {
  const userStr = localStorage.getItem("user");
  return userStr ? JSON.parse(userStr) : null;
}

function isLoggedIn() {
  return !!localStorage.getItem("token");
}

// =============================
// FORGOT PASSWORD FLOW
// =============================
function showForgotPassword() {
  const loginForm = document.querySelector('#loginForm');
  const links = document.querySelector('.links');
  const forgotSection = document.querySelector('#forgotPasswordSection');
  const otpSection = document.querySelector('#resetOtpSection');
  const resetSection = document.querySelector('#resetPasswordSection');

  if (loginForm) loginForm.classList.add('hidden');
  if (links) links.classList.add('hidden');

  if (otpSection) otpSection.classList.add('hidden');
  if (resetSection) resetSection.classList.add('hidden');
  if (forgotSection) {
    forgotSection.classList.remove('hidden');
  }

  const emailInput = document.querySelector('#forgotEmail');
  const loginEmail = document.querySelector('#loginEmail')?.value?.trim();
  if (emailInput) {
    emailInput.value = loginEmail || '';
    emailInput.focus();
  }

  resetEmail = null;
  verifiedResetOtp = null;
  clearForgotPasswordMessages();
}

function restoreLoginView() {
  const loginForm = document.querySelector('#loginForm');
  const links = document.querySelector('.links');
  const forgotSection = document.querySelector('#forgotPasswordSection');
  const otpSection = document.querySelector('#resetOtpSection');
  const resetSection = document.querySelector('#resetPasswordSection');

  if (loginForm) loginForm.classList.remove('hidden');
  if (links) links.classList.remove('hidden');
  if (forgotSection) forgotSection.classList.add('hidden');
  if (otpSection) otpSection.classList.add('hidden');
  if (resetSection) resetSection.classList.add('hidden');

  resetEmail = null;
  verifiedResetOtp = null;
  clearForgotPasswordMessages();

  const forgotForm = document.querySelector('#forgotPasswordForm');
  const otpForm = document.querySelector('#resetOtpForm');
  const resetForm = document.querySelector('#resetPasswordForm');
  if (forgotForm) forgotForm.reset();
  if (otpForm) otpForm.reset();
  if (resetForm) resetForm.reset();
}

async function handleForgotPasswordRequest(e) {
  e.preventDefault();
  const emailInput = document.querySelector('#forgotEmail');
  const messageEl = document.querySelector('#forgotPasswordMessage');
  const otpSection = document.querySelector('#resetOtpSection');
  const resetSection = document.querySelector('#resetPasswordSection');

  const email = emailInput?.value.trim();
  if (!email) {
    setMessage(messageEl, 'Please enter your registered email.', 'error');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${BASE_URL}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      resetEmail = email;
      verifiedResetOtp = null;
      setMessage(messageEl, 'OTP sent! Check your email and enter it below.', 'success');
      setMessage(document.querySelector('#resetOtpMessage'), '');
      setMessage(document.querySelector('#resetPasswordMessage'), '');
      if (otpSection) {
        otpSection.classList.remove('hidden');
        document.querySelector('#resetOtpInput')?.focus();
      }
      if (resetSection) {
        resetSection.classList.add('hidden');
      }
    } else {
      setMessage(messageEl, data.message || 'Unable to send OTP right now.', 'error');
    }
  } catch (error) {
    console.error('Forgot password request error:', error);
    setMessage(messageEl, 'Server error. Please try again later.', 'error');
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

async function resendResetOtp() {
  const messageEl = document.querySelector('#resetOtpMessage');
  const emailInput = document.querySelector('#forgotEmail');
  const button = document.querySelector('#resendResetOtpBtn');

  if (!button) {
    setMessage(messageEl, 'Cannot resend OTP right now.', 'error');
    return;
  }

  const email = resetEmail || emailInput?.value.trim();
  if (!email) {
    setMessage(messageEl, 'Enter your email above before requesting a resend.', 'error');
    return;
  }

  const originalText = button.innerHTML;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  button.disabled = true;

  try {
    const res = await fetch(`${BASE_URL}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      resetEmail = email;
      verifiedResetOtp = null;
      setMessage(messageEl, 'A new OTP has been sent to your email.', 'success');
    } else {
      setMessage(messageEl, data.message || 'Unable to resend OTP.', 'error');
    }
  } catch (error) {
    console.error('Resend reset OTP error:', error);
    setMessage(messageEl, 'Server error. Please try again later.', 'error');
  } finally {
    button.innerHTML = originalText;
    button.disabled = false;
  }
}

async function handleResetOtpVerification(e) {
  e.preventDefault();
  const otpInput = document.querySelector('#resetOtpInput');
  const messageEl = document.querySelector('#resetOtpMessage');
  const resetSection = document.querySelector('#resetPasswordSection');

  if (!resetEmail) {
    setMessage(messageEl, 'Please request an OTP first.', 'error');
    return;
  }

  const otp = otpInput?.value.trim();
  if (!otp || otp.length !== 6) {
    setMessage(messageEl, 'Enter the 6-digit OTP you received.', 'error');
    return;
  }

  const verifyBtn = e.target.querySelector('button[type="submit"]');
  const originalText = verifyBtn.innerHTML;
  verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
  verifyBtn.disabled = true;

  try {
    const res = await fetch(`${BASE_URL}/forgot-password/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail, otp })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      verifiedResetOtp = otp;
      setMessage(messageEl, 'OTP verified! Set your new password below.', 'success');
      setMessage(document.querySelector('#resetPasswordMessage'), '');
      if (resetSection) {
        resetSection.classList.remove('hidden');
        document.querySelector('#newPassword')?.focus();
      }
    } else {
      setMessage(messageEl, data.message || 'Invalid OTP. Please try again.', 'error');
    }
  } catch (error) {
    console.error('Reset OTP verification error:', error);
    setMessage(messageEl, 'Server error. Please try again later.', 'error');
  } finally {
    verifyBtn.innerHTML = originalText;
    verifyBtn.disabled = false;
  }
}

async function handlePasswordReset(e) {
  e.preventDefault();
  const newPasswordInput = document.querySelector('#newPassword');
  const confirmPasswordInput = document.querySelector('#confirmNewPassword');
  const messageEl = document.querySelector('#resetPasswordMessage');

  if (!resetEmail || !verifiedResetOtp) {
    setMessage(messageEl, 'Please verify the OTP before updating your password.', 'error');
    return;
  }

  const password = newPasswordInput?.value || '';
  const confirmPassword = confirmPasswordInput?.value || '';

  if (!password || !confirmPassword) {
    setMessage(messageEl, 'Enter and confirm your new password.', 'error');
    return;
  }

  if (password !== confirmPassword) {
    setMessage(messageEl, 'Passwords do not match.', 'error');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${BASE_URL}/forgot-password/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: resetEmail,
        otp: verifiedResetOtp,
        password,
        confirmPassword
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      setMessage(messageEl, 'Password updated! You can now log in with the new password.', 'success');
      const loginEmailInput = document.querySelector('#loginEmail');
      if (loginEmailInput) {
        loginEmailInput.value = resetEmail;
      }
      setTimeout(() => {
        restoreLoginView();
      }, 1500);
    } else {
      setMessage(messageEl, data.message || 'Unable to update password.', 'error');
    }
  } catch (error) {
    console.error('Password reset error:', error);
    setMessage(messageEl, 'Server error. Please try again later.', 'error');
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

function clearForgotPasswordMessages() {
  setMessage(document.querySelector('#forgotPasswordMessage'), '');
  setMessage(document.querySelector('#resetOtpMessage'), '');
  setMessage(document.querySelector('#resetPasswordMessage'), '');
}

function setMessage(element, message, type = 'info') {
  if (!element) {
    return;
  }
  element.textContent = message || '';
  element.classList.remove('error', 'success');
  if (!message) {
    return;
  }
  if (type === 'error') {
    element.classList.add('error');
  } else if (type === 'success') {
    element.classList.add('success');
  }
}
