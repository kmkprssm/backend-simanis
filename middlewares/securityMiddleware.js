// backend/middleware/securityMiddleware.js
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Rate limiting KHUSUS untuk login (5 percobaan dalam 15 menit)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit dalam millisecond
  //max: 5, // maksimal 5 kali percobaan
  max: 99999,
  message: { 
    error: 'Terlalu banyak percobaan login. Coba lagi setelah 15 menit.' 
  },
  standardHeaders: true, // Mengembalikan rate limit info di headers
  legacyHeaders: false,
});

// 🔥 TAMBAHKAN RATE LIMITING UNTUK REGISTER (3 percobaan per jam)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 100, 
  message: { 
    success: false,
    message: 'Terlalu banyak percobaan registrasi. Coba lagi setelah 1 jam.' 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting untuk semua API (100 request per 15 menit)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Terlalu banyak request dari IP ini' }
});

// Konfigurasi Helmet untuk keamanan headers
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
});

module.exports = { 
  loginLimiter, 
  apiLimiter, 
  registerLimiter, 
  helmetConfig 
};