// moved from client/investor.js (jQuery)
$(document).ready(function () {
  // keep original functionality but now loaded from assets/js
  let generatedOtp = null; let otpVerified = false;
  function loadInvestor(){ let investor = JSON.parse(localStorage.getItem('investorProfile')); if(investor){ $('#investorForm').addClass('hidden'); $('#investorDetails').removeClass('hidden'); $('#invName').text(investor.firstName+' '+investor.lastName); $('#invEmail').text(investor.email); $('#invPhone').text(investor.phone); $('#invFields').text(investor.fields.join(', ')); }}
  loadInvestor();
  $('#invFirstName, #invLastName').on('input', function(){ this.value=this.value.replace(/[^a-zA-Z]/g,''); });
  $('#invPhoneInput').on('input',function(){ this.value=this.value.replace(/[^0-9]/g,''); });
  $('#sendOtpBtn').click(function(){ const email = $('#invEmailInput').val().trim(); const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/; if(!emailPattern.test(email)){ alert('Enter a valid email first!'); return; } generatedOtp=Math.floor(100000+Math.random()*900000).toString(); otpVerified=false; $('#otpSection').removeClass('hidden'); $('#otpStatus').text('OTP sent to your email (demo: '+generatedOtp+')').css('color','yellow'); });
  $('#verifyOtpBtn').click(function(){ const enteredOtp=$('#otpInput').val().trim(); if(enteredOtp===generatedOtp){ otpVerified=true; $('#otpStatus').text('OTP Verified ✅').css('color','lightgreen'); } else { $('#otpStatus').text('Invalid OTP ❌').css('color','red'); } });
  $('#investorForm').on('submit', function(e){ e.preventDefault(); const firstName=$('#invFirstName').val().trim(); const lastName=$('#invLastName').val().trim(); const email=$('#invEmailInput').val().trim(); const phone=$('#invPhoneInput').val().trim(); const fields=$('#invFieldsInput').val(); if(!firstName||!lastName||!email||!phone||fields.length===0){ alert('All fields are required!'); return; } if(!otpVerified){ alert('Please verify OTP before creating profile.'); return; } const investorProfile={ firstName,lastName,email,phone,fields }; localStorage.setItem('investorProfile',JSON.stringify(investorProfile)); loadInvestor(); });
  $('#editInvestorBtn').click(function(){ let investor = JSON.parse(localStorage.getItem('investorProfile')); if(investor){ $('#invFirstName').val(investor.firstName); $('#invLastName').val(investor.lastName); $('#invEmailInput').val(investor.email); $('#invPhoneInput').val(investor.phone); $('#invFieldsInput').val(investor.fields); } $('#investorDetails').addClass('hidden'); $('#investorForm').removeClass('hidden'); otpVerified=false; });
});
