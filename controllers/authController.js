/* eslint-disable @typescript-eslint/no-require-imports */
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator"); // 🔒 TAMBAHKAN
const { getPool } = require("../config/db"); // 🔒 GUNAKAN getPool()

// LOGIN
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        code: "EMPTY_FROM",
        message: "Email dan password harus diisi",
      });
    }

    const pool = getPool();

    const result = await pool.query(
      `SELECT id, email, password_hash, username, role_id, 
              login_attempts, locked_until 
       FROM public."users" 
       WHERE email = $1`,
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        code: "WRONG_ACCOUNT",
        message: "Email atau password salah",
      });
    }

    const user = result.rows[0]; // <-- INI YANG DIPAKAI

    // Cek password
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        code: "WRONG_PASSWORD",
        message: "Password salah",
      });
    }

    await pool.query(
      `UPDATE public."users" 
       SET is_online = true, 
           last_login = CURRENT_TIMESTAMP, 
           last_seen = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [user.id],
    );

    // Konversi role
    const roleStr =
      user.role_id === 1 ? "ADMIN" : user.role_id === 2 ? "USER" : "GUEST";

    // Buat token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
        role: roleStr,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    // Set cookie
    // res.cookie('token', token, {
    //   httpOnly: true,
    //   secure: process.env.NODE_ENV === 'production',
    //   sameSite: 'strict',
    //   maxAge: 24 * 60 * 60 * 1000,
    // })

    // Kirim response
    res.json({
      success: true,
      message: "Login berhasil",
      token: token, // Untuk localStorage
      accessToken: token,
      user: {
        id: user.id,
        name: user.username,
        email: user.email,
        role: roleStr,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
};

// Refresh token function
exports.refreshToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      // Verifikasi token tanpa mempedulikan status expired
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        ignoreExpiration: true,
      });
    } catch (err) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid token structure" });
    }

    // (Opsional) Cek ke database apakah user masih aktif/tidak di-ban
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, username, email, role_id FROM public."users" WHERE id = $1',
      [decoded.id],
    );

    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({ success: false, message: "User no longer exists" });
    }

    const user = result.rows[0];
    const roleStr =
      user.role_id === 1 ? "ADMIN" : user.role_id === 2 ? "USER" : "GUEST";

    // Generate token baru berdurasi 1 hari lagi
    const newToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
        role: roleStr,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.json({
      success: true,
      accessToken: newToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ========================
// REGISTER USER
// ========================
// REGISTER USER
exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validasi gagal",
        errors: errors.array(),
      });
    }

    const { name, email, password, role } = req.body;
    const pool = getPool();

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Semua field harus diisi",
      });
    }

    // Validasi Password Strength
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password minimal 8 karakter, mengandung huruf besar, huruf kecil, angka, dan karakter khusus",
      });
    }

    const sanitizedEmail = email.toLowerCase().trim();
    const sanitizedName = name.trim();

    // Cek Email
    const existingUser = await pool.query(
      'SELECT id FROM public."users" WHERE email = $1',
      [sanitizedEmail],
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Email sudah terdaftar",
      });
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 🔒 TENTUKAN ROLE (ADMIN = 1, USER = 2, GUEST = 3)
    let role_id = 2; // Default USER
    if (role === "ADMIN") role_id = 1;
    else if (role === "GUEST") role_id = 3;
    else if (role === "USER") role_id = 2;

    const result = await pool.query(
      `INSERT INTO public."users" 
       (email, password_hash, username, role_id, created_at, login_attempts) 
       VALUES ($1, $2, $3, $4, NOW(), 0) 
       RETURNING id, email, username, role_id`,
      [sanitizedEmail, hashedPassword, sanitizedName, role_id],
    );

    res.status(201).json({
      success: true,
      message: "User berhasil didaftarkan",
      user: {
        id: result.rows[0].id,
        name: result.rows[0].username,
        email: result.rows[0].email,
        role: role === "ADMIN" ? "ADMIN" : role === "GUEST" ? "GUEST" : "USER",
      },
    });
  } catch (error) {
    console.error("❌ Register error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
};

// ========================
// LOGOUT
// ========================
exports.logout = async (req, res) => {
  try {
    // 🔒 HAPUS COOKIE TOKEN
    const isProduction = process.env.NODE_ENV === "production";
    const cookieSecure = process.env.COOKIE_SECURE === "true" || isProduction;
    const cookieSameSite = process.env.COOKIE_SAME_SITE || "strict";

    const userId = req.user?.id;

    if (userId) {
      const pool = getPool();

      await pool.query(
        `UPDATE public."users" 
         SET is_online = false 
         WHERE id = $1`,
        [userId],
      );
    }

    res.clearCookie("token", {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
    });

    res.json({
      success: true,
      message: "Logout berhasil",
    });
  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
};

// ========================
// VERIFY TOKEN
// ========================
// VERIFY TOKEN
// VERIFY TOKEN
// VERIFY TOKEN
exports.verify = (req, res) => {
  try {
    // User sudah ditambahkan oleh authMiddleware
    console.log("✅ Verify success:", req.user.email);
    res.json({
      success: true,
      authenticated: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
      },
    });
  } catch (error) {
    console.error("❌ Verify error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
};
// ========================
// CREATE ADMIN DEFAULT (HANYA UNTUK DEVELOPMENT)
// ========================
exports.createAdmin = async (req, res) => {
  // 🔒 CEK ENVIRONMENT (HANYA BOLEH DI DEVELOPMENT)
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({
      success: false,
      message: "Forbidden in production",
    });
  }

  try {
    const email = "admin@test.com";
    const password = "admin123";
    const name = "Admin Test";

    const pool = getPool();

    // 🔒 CEK APAKAH ADMIN SUDAH ADA
    const existingAdmin = await pool.query(
      'SELECT id FROM public."users" WHERE email = $1',
      [email],
    );

    if (existingAdmin.rows.length > 0) {
      return res.json({
        success: true,
        message: "Admin already exists",
        credentials: { email, password },
      });
    }

    // 🔒 BUAT ADMIN BARU
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO public."users" 
       (email, password_hash, username, role_id, created_at, login_attempts) 
       VALUES ($1, $2, $3, 1, NOW(), 0) 
       RETURNING id, email, username, role_id`,
      [email, hashedPassword, name],
    );

    res.json({
      success: true,
      message: "Admin created successfully",
      user: {
        id: result.rows[0].id,
        name: result.rows[0].username,
        email: result.rows[0].email,
        role: "ADMIN",
      },
      credentials: { email, password },
    });
  } catch (error) {
    console.error("❌ Create admin error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
};
