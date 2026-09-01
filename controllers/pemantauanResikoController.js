/* eslint-disable prettier/prettier */
const { getPool } = require("../config/db"); // <-- UBAH INI!

/* =========================
   GET ALL PEMANTAUAN
========================= */
exports.getAll = async (req, res) => {
  try {
    const pool = getPool(); // <-- TAMBAHKAN INI!
    const user = req.user;
    const filter = req.filter;

    console.log("📋 Pemantauan - User:", user?.email, "Role:", user?.role);
    console.log("🔍 Filter:", filter);

    let query = `
      SELECT 
        p.*,
        i.nama_resiko,
        i.created_by_uuid,
        u.username AS pemilik_risiko
      FROM pemantauan_resiko p
      JOIN identifikasi_resiko i ON i.id = p.risk_id
      LEFT JOIN users u ON i.created_by_uuid = u.id
    `;

    let params = [];
    let conditions = [];

    // 🔥 FILTER DARI RISKFILTER MIDDLEWARE
    if (filter?.created_by_uuid) {
      conditions.push(`i.created_by_uuid = $${params.length + 1}`);
      params.push(filter.created_by_uuid);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(" AND ");
    }

    query += ` ORDER BY p.updated_at DESC`;

    console.log("📝 Query:", query);
    console.log("📦 Params:", params);

    const result = await pool.query(query, params);
    console.log(`✅ Mendapatkan ${result.rows.length} data pemantauan`);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error get pemantauan:", err);
    res.status(500).json({ message: "Gagal mengambil data pemantauan" });
  }
};

/* =========================
   GET PEMANTAUAN PER RISIKO
========================= */
exports.getByRisk = async (req, res) => {
  try {
    const pool = getPool(); // <-- TAMBAHKAN INI!
    const { risk_id } = req.params;
    const user = req.user;
    const filter = req.filter;

    console.log("🔍 getByRisk - risk_id:", risk_id);
    console.log("👤 User:", user?.email, "Role:", user?.role);
    console.log("📋 Filter:", filter);

    // 🔥 CEK APAKAH USER BERHAK LIHAT RISIKO INI?
    if (filter?.created_by_uuid) {
      const cekRisiko = await pool.query(
        "SELECT created_by_uuid FROM identifikasi_resiko WHERE id = $1",
        [risk_id],
      );

      if (cekRisiko.rows.length === 0) {
        return res.status(404).json({ message: "Risiko tidak ditemukan" });
      }

      if (cekRisiko.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message:
            "Anda hanya bisa melihat pemantauan pada risiko milik sendiri",
        });
      }
    }

    const result = await pool.query(
      `
      SELECT *
      FROM pemantauan_resiko
      WHERE risk_id = $1
      ORDER BY updated_at DESC
    `,
      [risk_id],
    );

    console.log(`✅ Mendapatkan ${result.rows.length} riwayat pemantauan`);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error get pemantauan by risk:", err);
    res.status(500).json({ message: "Gagal mengambil riwayat pemantauan" });
  }
};

/* =========================
   CREATE PEMANTAUAN
========================= */
exports.create = async (req, res) => {
  try {
    const pool = getPool(); // <-- TAMBAHKAN INI!
    const user = req.user;
    const filter = req.filter;

    const { risk_id, progress_persen, efektivitas, review_kendala } = req.body;

    console.log("📝 Create pemantauan oleh user:", user?.email);
    console.log("Body:", req.body);

    if (!risk_id) {
      return res.status(400).json({ message: "risk_id wajib diisi" });
    }

    // 🔥 CEK APAKAH USER BERHAK MEMBUAT PEMANTAUAN UNTUK RISIKO INI?
    if (filter?.created_by_uuid) {
      const cekRisiko = await pool.query(
        "SELECT created_by_uuid, status FROM identifikasi_resiko WHERE id = $1",
        [risk_id],
      );

      if (cekRisiko.rows.length === 0) {
        return res.status(404).json({ message: "Risiko tidak ditemukan" });
      }

      if (cekRisiko.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message:
            "Anda hanya bisa menambah pemantauan pada risiko milik sendiri",
        });
      }

      // Cek apakah risiko sudah closed?
      if (
        cekRisiko.rows[0].status === "Closed" ||
        cekRisiko.rows[0].status === "CLOSED"
      ) {
        return res.status(400).json({
          message:
            "Tidak dapat menambah pemantauan pada risiko yang sudah CLOSED",
        });
      }
    }

    const result = await pool.query(
      `
      INSERT INTO pemantauan_resiko (
        risk_id,
        progress_persen,
        efektivitas,
        review_kendala,
        created_by,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
    `,
      [
        risk_id,
        progress_persen || 0,
        efektivitas || null,
        review_kendala || null,
        user.id, // <-- TAMBAHKAN created_by
      ],
    );

    console.log("✅ Pemantauan berhasil disimpan");
    res.status(201).json({
      success: true,
      message: "Pemantauan berhasil disimpan",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("❌ Error create pemantauan:", err);
    res.status(500).json({
      message: "Gagal menyimpan pemantauan",
      error: err.message,
    });
  }
};

/* =========================
   UPDATE PEMANTAUAN
========================= */
exports.update = async (req, res) => {
  try {
    const pool = getPool(); // <-- TAMBAHKAN INI!
    const { id } = req.params;
    const user = req.user;
    const filter = req.filter;

    const { progress_persen, efektivitas, review_kendala } = req.body;

    console.log("📝 Update pemantauan id:", id);

    // 🔥 CEK KEPEMILIKAN
    if (filter?.created_by_uuid) {
      const cek = await pool.query(
        `
        SELECT p.*, i.created_by_uuid, i.status
        FROM pemantauan_resiko p
        JOIN identifikasi_resiko i ON i.id = p.risk_id
        WHERE p.id = $1
      `,
        [id],
      );

      if (cek.rows.length === 0) {
        return res.status(404).json({ message: "Pemantauan tidak ditemukan" });
      }

      if (cek.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message:
            "Anda hanya bisa mengupdate pemantauan pada risiko milik sendiri",
        });
      }

      if (cek.rows[0].status === "Closed" || cek.rows[0].status === "CLOSED") {
        return res.status(400).json({
          message:
            "Tidak dapat mengupdate pemantauan pada risiko yang sudah CLOSED",
        });
      }
    }

    const result = await pool.query(
      `
      UPDATE pemantauan_resiko
      SET 
        progress_persen = COALESCE($1, progress_persen),
        efektivitas = COALESCE($2, efektivitas),
        review_kendala = COALESCE($3, review_kendala),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `,
      [progress_persen, efektivitas, review_kendala, id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Pemantauan tidak ditemukan" });
    }

    res.json({
      success: true,
      message: "Pemantauan berhasil diupdate",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("❌ Error update pemantauan:", err);
    res.status(500).json({ message: "Gagal mengupdate pemantauan" });
  }
};

/* =========================
   DELETE PEMANTAUAN
========================= */
exports.delete = async (req, res) => {
  try {
    const pool = getPool(); // <-- TAMBAHKAN INI!
    const { id } = req.params;
    const user = req.user;
    const filter = req.filter;

    // 🔥 CEK KEPEMILIKAN
    if (filter?.created_by_uuid) {
      const cek = await pool.query(
        `
        SELECT p.*, i.created_by_uuid
        FROM pemantauan_resiko p
        JOIN identifikasi_resiko i ON i.id = p.risk_id
        WHERE p.id = $1
      `,
        [id],
      );

      if (cek.rows.length === 0) {
        return res.status(404).json({ message: "Pemantauan tidak ditemukan" });
      }

      if (cek.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message:
            "Anda hanya bisa menghapus pemantauan pada risiko milik sendiri",
        });
      }
    }

    const result = await pool.query(
      "DELETE FROM pemantauan_resiko WHERE id = $1 RETURNING id",
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Pemantauan tidak ditemukan" });
    }

    res.json({
      success: true,
      message: "Pemantauan berhasil dihapus",
    });
  } catch (err) {
    console.error("❌ Error delete pemantauan:", err);
    res.status(500).json({ message: "Gagal menghapus pemantauan" });
  }
};
