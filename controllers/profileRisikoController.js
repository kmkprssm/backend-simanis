const { getPool } = require("../config/db");

exports.getProfileRisiko = async (req, res) => {
  try {
    const pool = getPool();
    const filter = req.filter;

    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    let offset = (page - 1) * limit;

    console.log(`🔍 Filter Profile Risiko:`, filter);
    console.log(
      `📦 Pagination - Page: ${page}, Limit: ${limit}, Offset: ${offset}`,
    );

    let query = `
      SELECT 
        pr.id AS profile_id,
        pr.risk_analysis_id,
        pr.risk_level,
        pr.owner_id,
        u.username AS pemilik_risiko,
        pr.assigned_at,
        ir.id AS risk_id,
        ir.nama_resiko,
        ir.deskripsi,
        ir.status AS treatment_status,
        an.score AS skor_risiko,
        an.assessment_type,
        an.likelihood,
        an.impact,
        k.name AS kategori_name,
        er.strategi,
        er.prioritas
      FROM profile_risiko pr
      JOIN penilaian_resiko an ON pr.risk_analysis_id = an.id
      JOIN identifikasi_resiko ir ON an.risk_id = ir.id
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, strategi, prioritas, created_at
        FROM evaluasi_resiko
        WHERE is_active = true 
        ORDER BY risk_id, created_at DESC
      ) er ON er.risk_id = ir.id
      LEFT JOIN kategori_resiko k ON k.id = ir.kategori_id
      LEFT JOIN users u ON pr.owner_id = u.id
    `;

    let countQuery = `
      SELECT COUNT(pr.id) as count
      FROM profile_risiko pr
      JOIN penilaian_resiko an ON pr.risk_analysis_id = an.id
      JOIN identifikasi_resiko ir ON an.risk_id = ir.id
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id FROM evaluasi_resiko ORDER BY risk_id, created_at DESC
      ) er ON er.risk_id = ir.id
    `;

    let params = [];
    let conditions = [];

    if (filter?.created_by_uuid) {
      conditions.push(`ir.created_by_uuid = $${params.length + 1}`);
      params.push(filter.created_by_uuid);
    }

    if (conditions.length > 0) {
      const conditionString = ` WHERE ` + conditions.join(" AND ");
      query += conditionString;
      countQuery += conditionString;
    }

    const countParams = [...params];

    query += ` ORDER BY an.score DESC`;

    params.push(limit);
    query += ` LIMIT $${params.length}`;

    params.push(offset);
    query += ` OFFSET $${params.length}`;

    console.log("📝 Query Profile Risiko:", query);

    const [dataResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);

    const totalRows = parseInt(countResult.rows[0].count);
    const hasMore = offset + dataResult.rows.length < totalRows;

    console.log(
      `✅ Mendapatkan ${dataResult.rows.length} profil risiko dari total ${totalRows} data.`,
    );

    res.json({
      profile_risiko: dataResult.rows,
      meta: {
        page,
        limit,
        totalRows,
        hasMore,
      },
    });
  } catch (error) {
    console.error("❌ GET PROFILE RISIKO ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.createProfileRisiko = async (req, res) => {
  try {
    const pool = getPool();
    const user = req.user;
    const filter = req.filter;
    const { risk_analysis_id, owner_id } = req.body;

    if (!risk_analysis_id) {
      return res
        .status(400)
        .json({ message: "ID Analisis Risiko (risk_analysis_id) wajib diisi" });
    }

    const infoPenilaian = await pool.query(
      `SELECT p.score, i.created_by_uuid 
       FROM penilaian_resiko p
       JOIN identifikasi_resiko i ON p.risk_id = i.id
       WHERE p.id = $1`,
      [risk_analysis_id],
    );

    if (infoPenilaian.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Data penilaian risiko tidak ditemukan" });
    }

    const { score, created_by_uuid } = infoPenilaian.rows[0];

    if (filter?.created_by_uuid && created_by_uuid !== filter.created_by_uuid) {
      return res.status(403).json({
        message:
          "Anda hanya bisa mendaftarkan risiko milik sendiri ke Profil Risiko",
      });
    }

    const cekDuplikasi = await pool.query(
      "SELECT id FROM profile_risiko WHERE risk_analysis_id = $1",
      [risk_analysis_id],
    );
    if (cekDuplikasi.rows.length > 0) {
      return res.status(400).json({
        message: "Penilaian risiko ini sudah masuk ke dalam Profil Risiko",
      });
    }

    let risk_level = "RENDAH";

    if (score >= 20) {
      risk_level = "EKSTRIM";
    } else if (score >= 12) {
      risk_level = "TINGGI";
    } else if (score >= 6) {
      risk_level = "SEDANG";
    } else {
      risk_level = "RENDAH";
    }

    const result = await pool.query(
      `INSERT INTO profile_risiko (risk_analysis_id, risk_level, owner_id, assigned_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [risk_analysis_id, risk_level, owner_id || user.id],
    );

    res.status(201).json({
      message: "Risiko berhasil dimasukkan ke dalam daftar Profil Risiko",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("❌ CREATE PROFILE RISIKO ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.updateProfileRisiko = async (req, res) => {
  try {
    const pool = getPool();
    const filter = req.filter;
    const { id } = req.params;
    const { owner_id } = req.body;

    if (!owner_id) {
      return res
        .status(400)
        .json({ message: "Field owner_id harus diisi untuk melakukan update" });
    }

    // Cek kepemilikan data sebelum melakukan update
    const checkProfile = await pool.query(
      `SELECT pr.id, i.created_by_uuid 
       FROM profile_risiko pr
       JOIN penilaian_resiko p ON pr.risk_analysis_id = p.id
       JOIN identifikasi_resiko i ON p.risk_id = i.id
       WHERE pr.id = $1`,
      [id],
    );

    if (checkProfile.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Data profil risiko tidak ditemukan" });
    }

    if (
      filter?.created_by_uuid &&
      checkProfile.rows[0].created_by_uuid !== filter.created_by_uuid
    ) {
      return res.status(403).json({
        message:
          "Anda tidak memiliki hak akses untuk mengubah profil risiko ini",
      });
    }

    const result = await pool.query(
      `UPDATE profile_risiko 
       SET owner_id = $1
       WHERE id = $2
       RETURNING *`,
      [owner_id, id],
    );

    res.json({
      message: "Penanggung jawab profil risiko berhasil diperbarui",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("❌ UPDATE PROFILE RISIKO ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.deleteProfileRisiko = async (req, res) => {
  try {
    const pool = getPool();
    const user = req.user;
    const filter = req.filter;
    const { id } = req.params;

    const checkProfile = await pool.query(
      `SELECT pr.id, i.created_by_uuid, i.nama_resiko 
       FROM profile_risiko pr
       JOIN penilaian_resiko p ON pr.risk_analysis_id = p.id
       JOIN identifikasi_resiko i ON p.risk_id = i.id
       WHERE pr.id = $1`,
      [id],
    );

    if (checkProfile.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Data profil risiko tidak ditemukan" });
    }

    const profilData = checkProfile.rows[0];

    if (user.role !== "ADMIN" && profilData.created_by_uuid !== user.id) {
      return res.status(403).json({
        message: "Anda hanya bisa menghapus profil risiko milik sendiri",
      });
    }

    await pool.query("DELETE FROM profile_risiko WHERE id = $1", [id]);

    res.json({
      success: true,
      message: `Risiko "${profilData.nama_risiko}" berhasil dikeluarkan dari daftar Profil Risiko`,
      data: { id },
    });
  } catch (error) {
    console.error("❌ DELETE PROFILE RISIKO ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};
