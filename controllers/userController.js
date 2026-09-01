/* eslint-disable prettier/prettier */
const { getPool } = require("../config/db");

exports.getUsersForFilter = async (req, res) => {
  try {
    const pool = getPool();
    const user = req.user;

    // 🔐 Proteksi ketat: Tolak jika bukan ADMIN
    if (user?.role !== "ADMIN") {
      return res
        .status(403)
        .json({ message: "Akses ditolak. Khusus Administrator." });
    }

    // Ambil parameter untuk pagination dan pencarian teks (search)
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    let search = req.query.search || "";
    let offset = (page - 1) * limit;

    let query = `SELECT id, username, email FROM users`;
    let countQuery = `SELECT COUNT(*) FROM users`;
    let params = [];
    let paramCounter = 1;

    if (search.trim() !== "") {
      query += ` WHERE username ILIKE $${paramCounter} OR email ILIKE $${paramCounter}`;
      countQuery += ` WHERE username ILIKE $${paramCounter} OR email ILIKE $${paramCounter}`;
      params.push(`%${search}%`);
      paramCounter++;
    }

    query += ` ORDER BY username ASC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    params.push(limit, offset);

    // Jalankan query data dan total data secara bersamaan (parallel)
    const [dataResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, search.trim() !== "" ? [`%${search}%`] : []),
    ]);

    const totalRows = parseInt(countResult.rows[0].count);
    const hasMore = offset + dataResult.rows.length < totalRows;

    res.json({
      users: dataResult.rows,
      meta: {
        page,
        limit,
        totalRows,
        hasMore, // Penanda bagi frontend untuk memicu load data berikutnya
      },
    });
  } catch (error) {
    console.error("❌ GET USERS FILTER ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const pool = getPool();
    const user = req.user;

    if (user?.role !== "ADMIN") {
      return res
        .status(403)
        .json({ message: "Akses ditolak. Khusus Administrator." });
    }

    // Mengambil seluruh data user + nama role dari tabel roles
    const query = `
      SELECT 
        u.id, 
        u.username as name, 
        u.email, 
        u.password_hash,
        u.department,
        u.is_online,
        u.last_seen,
        u.last_login,
        u.created_at,
        r.name as role 
      FROM users u 
      LEFT JOIN roles r ON r.id = u.role_id 
      ORDER BY r.name ASC
    `;
    const { rows } = await pool.query(query);

    res.json({
      users: rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("❌ GET ALL USERS ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};
