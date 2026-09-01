const express = require('express')
const router = express.Router()
const { body } = require('express-validator')
const { loginLimiter, registerLimiter } = require('../middlewares/securityMiddleware') // <-- TAMBAHKAN registerLimiter!
const {
  register,
  login,
  createAdmin,
  logout,
  verify,
  refreshToken,
} = require('../controllers/authController')
const authMiddleware = require('../middlewares/authMiddleware')

// Validasi untuk register
const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  body('email').isEmail().normalizeEmail().withMessage('Must be a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),
]

// Validasi untuk login
const loginValidation = [
  body('email').notEmpty().withMessage('Email harus diisi'),
  body('password').notEmpty().withMessage('Password harus diisi'),
]

// Routes
router.post('/register', registerLimiter, registerValidation, register)
router.post('/login', loginLimiter, loginValidation, login)
router.post('/refresh-token', refreshToken)
router.post('/logout', logout)
router.get('/verify', authMiddleware, verify)

// Route create admin (hanya development)
if (process.env.NODE_ENV !== 'production') {
  router.get('/create-admin', createAdmin)
}

module.exports = router
