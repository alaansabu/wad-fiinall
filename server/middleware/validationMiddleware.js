const { body, validationResult } = require('express-validator');

// Validation rules for profile
const validateProfile = [
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .isAlpha('en-US', { ignore: ' -' })
    .withMessage('First name can only contain letters, spaces, and hyphens'),
  
  body('surname')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Surname must be between 2 and 50 characters')
    .isAlpha('en-US', { ignore: ' -' })
    .withMessage('Surname can only contain letters, spaces, and hyphens'),
  
  body('age')
    .isInt({ min: 18, max: 120 })
    .withMessage('Age must be between 18 and 120'),
  
  body('dob')
    .isISO8601()
    .withMessage('Please provide a valid date of birth'),
  
  body('phone')
    .matches(/^[0-9]{10,15}$/)
    .withMessage('Phone number must contain 10 to 15 digits'),
  
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

module.exports = {
  validateProfile
};