const nodemailer = require('nodemailer');
require('dotenv').config();

const fromAddress = process.env.EMAIL_ADRESS || process.env.EMAIL_ADDRESS || 'no-reply@example.com';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: fromAddress,
    pass: process.env.EMAIL_PASS
  }
});

async function sendMail({ to, subject, text, html }) {
  const mail = {
    from: fromAddress,
    to,
    subject,
    text,
    html
  };
  return transporter.sendMail(mail);
}

module.exports = { sendMail, transporter, fromAddress };
