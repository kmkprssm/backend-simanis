const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // 1. COBA AMBIL DARI COOKIE DULU
  let token = req.cookies?.token;
  
  // 2. KALAU TIDAK ADA, COBA DARI HEADER (untuk backward compatibility)
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 3. KALAU TETAP TIDAK ADA, TOLAK
  if (!token) {
    console.log('❌ AuthMiddleware: No token found');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log('✅ AuthMiddleware: Token valid for', decoded.email);
    next();
  } catch (err) {
    console.log('❌ AuthMiddleware: Invalid token', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = authMiddleware;