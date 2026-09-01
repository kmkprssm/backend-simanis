/* eslint-disable prettier/prettier */
const { getPool } = require('../config/db') // <-- UBAH INI!

/* ===============================
   GET ALL PENILAIAN RISIKO - DENGAN FILTER!
================================ */
exports.getPenilaian = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const user = req.user
    const filter = req.filter

    console.log('👤 User:', user?.email, 'Role:', user?.role)
    console.log('🔍 Filter:', filter)

    let query = `
      SELECT 
        p.id,
        p.risk_id,
        p.assessment_type,
        p.likelihood,
        p.impact,
        p.score,
        p.assessed_by,
        p.created_at,
        i.nama_resiko,
        i.created_by_uuid,
        i.status,
        u.username AS pemilik_risiko,
        k.name AS kategori_name,
        pr.id AS profile_id,
        CASE 
          WHEN pr.id IS NOT NULL THEN true 
          ELSE false 
        END AS is_in_profile
      FROM penilaian_resiko p
      LEFT JOIN identifikasi_resiko i ON i.id = p.risk_id
      LEFT JOIN kategori_resiko k ON k.id = i.kategori_id
      LEFT JOIN users u ON i.created_by_uuid = u.id
      LEFT JOIN profile_risiko pr ON pr.risk_analysis_id = p.id
    `

    let params = []
    let conditions = []

    conditions.push(`p.assessment_type = 'INHERENT'`)

    // 🔥 FILTER DARI RISKFILTER MIDDLEWARE
    if (filter?.created_by_uuid) {
      conditions.push(`i.created_by_uuid = $${params.length + 1}`)
      params.push(filter.created_by_uuid)
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ')
    }

    query += ` ORDER BY p.score DESC`

    console.log('📝 Query:', query)
    console.log('📦 Params:', params)

    const result = await pool.query(query, params)

    console.log(`✅ Mendapatkan ${result.rows.length} data penilaian`)

    res.json(result.rows)
  } catch (error) {
    console.error('❌ GET PENILAIAN ERROR:', error)
    res.status(500).json({
      message: error.message,
    })
  }
}

// Backend: Mendapatkan statistik analisis risiko (Penilaian) berdasarkan hak akses role
exports.getStatsPenilaian = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user
    const filter = req.filter // Filter dari middleware untuk pembatasan UUID user biasa

    let mainParams = []
    let p_conditions = [] // Kondisi untuk query utama (tabel penilaian & identifikasi)
    let i_conditions = [] // Kondisi khusus untuk subquery total_identifikasi (hanya tabel identifikasi)

    // 1. Terapkan batasan data jika user login bukan ADMIN (misal: USER/IPDE)
    if (filter?.created_by_uuid) {
      mainParams.push(filter.created_by_uuid)

      // Untuk query utama menggunakan alias tabel 'i'
      p_conditions.push(`i.created_by_uuid = $${mainParams.length}`)
      // Untuk subquery identifikasi langsung tanpa alias tabel
      i_conditions.push(`created_by_uuid = $${mainParams.length}`)
    }

    // 2. Kunci jenis penilaian hanya untuk 'INHERENT' di query utama
    p_conditions.push(`p.assessment_type = 'INHERENT'`)

    const p_whereClause = p_conditions.length > 0 ? `WHERE ${p_conditions.join(' AND ')}` : ''
    const i_whereClause = i_conditions.length > 0 ? `WHERE ${i_conditions.join(' AND ')}` : ''

    console.log(`📋 Mengambil statistik penilaian INHERENT untuk Role: ${user?.role || 'UNKNOWN'}`)

    // 3. Query Agregasi Bersih & Aman dari Error Subquery
    const exactFormulasQuery = `
      SELECT 
        COUNT(p.id) AS total_analisis,
        COUNT(CASE WHEN p.score >= 15 THEN 1 END) AS high,
        COUNT(CASE WHEN p.score >= 6 AND p.score < 15 THEN 1 END) AS medium,
        COUNT(CASE WHEN p.score < 6 THEN 1 END) AS low,
        (
          SELECT COUNT(*) 
          FROM identifikasi_resiko
          ${i_whereClause} 
        ) AS total_identifikasi
      FROM penilaian_resiko p
      LEFT JOIN identifikasi_resiko i ON i.id = p.risk_id
      ${p_whereClause}
    `

    const result = await pool.query(exactFormulasQuery, mainParams)
    const stats = result.rows[0]

    console.log('✅ Statistik penilaian INHERENT berhasil dihitung:', stats)

    res.json({
      totalAnalisis: parseInt(stats.total_analisis || 0),
      totalIdentifikasi: parseInt(stats.total_identifikasi || 0),
      high: parseInt(stats.high || 0),
      medium: parseInt(stats.medium || 0),
      low: parseInt(stats.low || 0),
    })
  } catch (error) {
    console.error('❌ GET STATS PENILAIAN ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

// exports.getAnalisisResidu = async (req, res) => {
//   try {
//     const pool = getPool()
//     const user = req.user
//     const filter = req.filter

//     // 🎯 Dapatkan Tahun Berjalan secara Dinamis
//     const currentDate = new Date()
//     const currentYear = currentDate.getFullYear()

//     console.log('👤 User Pengakses Residu:', user?.email, 'Role:', user?.role)

//     let query = `
//       SELECT
//         ir.id AS risk_id,
//         ir.nama_resiko,
//         ir.created_by_uuid,
//         ir.status,
//         u.username AS pemilik_risiko,
//         k.name AS kategori_name,

//         -- Data Strategi & Prioritas dari Tabel Evaluasi
//         er.strategi,
//         er.prioritas,

//         -- Skala BEFORE (Inherent)
//         pr_before.id AS assessment_before_id,
//         pr_before.likelihood AS likelihood_before,
//         pr_before.impact AS impact_before,
//         pr_before.score AS inherent_score,
//         pr_before.created_at AS created_at_before,

//         -- Skala AFTER (Residual)
//         pr_after.id AS assessment_after_id,
//         pr_after.likelihood AS likelihood_after,
//         pr_after.impact AS impact_after,
//         pr_after.score AS score_after,
//         pr_after.created_at AS created_at_after,

//         -- 📊 Mengambil status pelaporan bulan berjalan milik user ini
//         COALESCE((
//           SELECT status_laporan
//           FROM log_risiko_bulanan
//           WHERE tahun = $1 AND bulan = ${currentMonth} AND reported_by = ir.created_by_uuid
//         ), 'BELUM_DIISI') AS status_laporan_bulan_ini,

//         -- Hitung kejadian riil (bukan nihil konfirmasi)
//         COALESCE((
//           SELECT COUNT(krd.id)
//           FROM kejadian_risiko_detail krd
//           JOIN log_risiko_bulanan lrb ON krd.log_bulanan_id = lrb.id
//           WHERE krd.risk_id = ir.id AND lrb.tahun = $1 AND krd.is_nihil = false
//         ), 0) AS total_kejadian,

//         CASE
//           WHEN EXISTS (
//             SELECT 1 FROM kejadian_risiko_detail krd
//             JOIN log_risiko_bulanan lrb ON krd.log_bulanan_id = lrb.id
//             WHERE krd.risk_id = ir.id AND lrb.tahun = $1 AND krd.is_nihil = false
//           ) THEN true ELSE false
//         END AS pernah_terjadi

//       FROM identifikasi_resiko ir
//       LEFT JOIN kategori_resiko k ON k.id = ir.kategori_id
//       LEFT JOIN users u ON ir.created_by_uuid = u.id
//       LEFT JOIN penilaian_resiko pr_before
//         ON pr_before.risk_id = ir.id AND pr_before.assessment_type = 'INHERENT'
//       LEFT JOIN penilaian_resiko pr_after
//         ON pr_after.risk_id = ir.id AND pr_after.assessment_type = 'RESIDUAL'
//       LEFT JOIN (
//         SELECT DISTINCT ON (risk_id) risk_id, strategi, prioritas, created_at
//         FROM evaluasi_resiko
//         WHERE is_active = true
//         ORDER BY risk_id, created_at DESC
//       ) er ON er.risk_id = ir.id
//     `

//     let params = [currentYear]
//     let conditions = []

//     if (filter?.created_by_uuid) {
//       conditions.push(`ir.created_by_uuid = $${params.length + 1}`)
//       params.push(filter.created_by_uuid)
//     }

//     if (conditions.length > 0) {
//       query += ` WHERE ` + conditions.join(' AND ')
//     }

//     query += ` ORDER BY pr_before.score DESC NULLS LAST`

//     const result = await pool.query(query, params)

//     // Memastikan tipe data total_kejadian dikonversi menjadi integer
//     const formattedRows = result.rows.map((row) => ({
//       ...row,
//       total_kejadian: parseInt(row.total_kejadian || 0),
//     }))

//     console.log(`✅ Mendapatkan ${formattedRows.length} data analisis residu`)
//     res.json(formattedRows)
//   } catch (error) {
//     console.error('❌ GET ANALISIS RESIDU ERROR:', error)
//     res.status(500).json({ message: error.message })
//   }
// }

exports.getAnalisisResidu = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user
    const filter = req.filter

    const currentDate = new Date()
    const currentYear = currentDate.getFullYear()

    console.log('👤 User Pengakses Residu (Logika Spesifik Per Risk ID):', user?.email)

    let query = `
      SELECT 
        ir.id AS risk_id,
        ir.nama_resiko,
        ir.created_by_uuid,
        ir.status,
        u.username AS pemilik_risiko,
        k.name AS kategori_name,
        er.strategi,
        er.prioritas,
        pr_before.likelihood AS likelihood_before,
        pr_before.impact AS impact_before,
        pr_before.score AS inherent_score, 
        pr_after.id AS assessment_after_id,
        pr_after.likelihood AS likelihood_after,
        pr_after.impact AS impact_after,
        pr_after.score AS score_after,

        -- 📊 BARU: Hitung berapa kali RISK_ID ini dilaporkan (baik INSIDEN maupun NIHIL) di tahun berjalan
        (
          SELECT COUNT(krd.id)
          FROM kejadian_risiko_detail krd
          JOIN log_risiko_bulanan lrb ON krd.log_bulanan_id = lrb.id
          WHERE krd.risk_id = ir.id 
            AND lrb.tahun = $1
        ) AS risiko_terlaporkan_tahun_ini,

        -- Hitung kejadian riil (hanya insiden nyata, bkn konfirmasi nihil) untuk alert banner
        COALESCE((
          SELECT COUNT(krd.id)
          FROM kejadian_risiko_detail krd
          JOIN log_risiko_bulanan lrb ON krd.log_bulanan_id = lrb.id
          WHERE krd.risk_id = ir.id AND lrb.tahun = $1 AND krd.is_nihil = false
        ), 0) AS total_kejadian,

        CASE 
          WHEN EXISTS (
            SELECT 1 FROM kejadian_risiko_detail krd
            JOIN log_risiko_bulanan lrb ON krd.log_bulanan_id = lrb.id
            WHERE krd.risk_id = ir.id AND lrb.tahun = $1 AND krd.is_nihil = false
          ) THEN true ELSE false 
        END AS pernah_terjadi

      FROM identifikasi_resiko ir
      LEFT JOIN kategori_resiko k ON k.id = ir.kategori_id
      LEFT JOIN users u ON ir.created_by_uuid = u.id
      LEFT JOIN penilaian_resiko pr_before ON pr_before.risk_id = ir.id AND pr_before.assessment_type = 'INHERENT'
      LEFT JOIN penilaian_resiko pr_after ON pr_after.risk_id = ir.id AND pr_after.assessment_type = 'RESIDUAL'
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, strategi, prioritas
        FROM evaluasi_resiko
        WHERE is_active = true 
        ORDER BY risk_id, created_at DESC
      ) er ON er.risk_id = ir.id
    `

    let params = [currentYear]
    let conditions = []
    if (filter?.created_by_uuid) {
      conditions.push(`ir.created_by_uuid = $${params.length + 1}`)
      params.push(filter.created_by_uuid)
    }

    if (conditions.length > 0) query += ` WHERE ` + conditions.join(' AND ')
    query += ` ORDER BY pr_before.score DESC NULLS LAST`

    const result = await pool.query(query, params)

    const formattedRows = result.rows.map((row) => ({
      ...row,
      total_kejadian: parseInt(row.total_kejadian || 0),
      risiko_terlaporkan_tahun_ini: parseInt(row.risiko_terlaporkan_tahun_ini || 0),
    }))

    res.json(formattedRows)
  } catch (error) {
    console.error('❌ GET ANALISIS RESIDU ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

/* ===============================
   CREATE PENILAIAN RISIKO
================================ */

exports.createPenilaian = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user
    const filter = req.filter

    console.log('BODY PENILAIAN:', req.body)
    console.log('👤 User membuat penilaian:', user.id, user.email)

    const { risk_id, assessment_type, likelihood, impact } = req.body

    if (!risk_id || likelihood == null || impact == null) {
      return res.status(400).json({
        message: 'Data penilaian risiko belum lengkap',
      })
    }

    // 🔥 CEK apakah risiko ini milik user yang login? (via filter)
    if (filter?.created_by_uuid) {
      const cekRisiko = await pool.query(
        'SELECT created_by_uuid FROM identifikasi_resiko WHERE id = $1',
        [risk_id],
      )

      if (
        cekRisiko.rows.length > 0 &&
        cekRisiko.rows[0].created_by_uuid !== filter.created_by_uuid
      ) {
        return res.status(403).json({
          message: 'Anda hanya bisa menilai risiko milik sendiri',
        })
      }
    }

    // ✅ HAPUS score dari INSERT karena sudah generated column
    const result = await pool.query(
      `
      INSERT INTO penilaian_resiko
      (
        risk_id,
        assessment_type,
        likelihood,
        impact,
        assessed_by,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,NOW())
      RETURNING *
      `,
      [risk_id, assessment_type || 'INHERENT', likelihood, impact, user.id],
    )

    if ((assessment_type || 'INHERENT') === 'INHERENT') {
      await pool.query(
        `UPDATE identifikasi_resiko SET fase = 'Analisis', updated_at = NOW() WHERE id = $1`,
        [risk_id],
      )
      console.log(`✨ Fase risiko ${risk_id} berhasil diperbarui menjadi 'Analisis'`)
    }

    res.status(201).json({
      message: 'Penilaian risiko berhasil disimpan',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ CREATE PENILAIAN ERROR:', error)
    res.status(500).json({
      message: error.message,
      code: error.code,
      detail: error.detail,
    })
  }
}

// Backend update penilaian (Hanya likelihood dan impact)
exports.updatePenilaian = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user
    const filter = req.filter
    const { id } = req.params // ID dari penilaian_resiko yang ingin diupdate

    console.log(`📋 Memperbarui penilaian ID: ${id}`)
    console.log('BODY UPDATE PENILAIAN:', req.body)

    const { likelihood, impact } = req.body

    // 1. Validasi Input Dasar
    if (likelihood == null || impact == null) {
      return res.status(400).json({
        message: 'Skala kemungkinan (likelihood) dan dampak (impact) harus diisi',
      })
    }

    // 2. Ambil data penilaian lama untuk memeriksa kepemilikan risiko
    const checkPenilaian = await pool.query(
      `SELECT p.id, i.created_by_uuid 
       FROM penilaian_resiko p
       JOIN identifikasi_resiko i ON p.risk_id = i.id
       WHERE p.id = $1`,
      [id],
    )

    if (checkPenilaian.rows.length === 0) {
      return res.status(404).json({
        message: 'Data penilaian risiko tidak ditemukan',
      })
    }

    const createdByUuid = checkPenilaian.rows[0].created_by_uuid

    // 3. 🔥 CEK SECURITY: Apakah risiko ini milik user yang login? (Hanya berlaku untuk non-ADMIN)
    if (filter?.created_by_uuid) {
      if (createdByUuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message: 'Anda hanya memiliki hak akses untuk mengubah penilaian risiko milik sendiri',
        })
      }
    }

    // 4. ✅ EKSEKUSI UPDATE (Kolom score diabaikan karena merupakan Generated Column)
    const result = await pool.query(
      `
      UPDATE penilaian_resiko
      SET 
        likelihood = $1,
        impact = $2
      WHERE id = $3
      RETURNING *
      `,
      [likelihood, impact, id],
    )

    console.log(`✅ Penilaian ID ${id} berhasil diperbarui oleh User: ${user.id}`)

    res.json({
      message: 'Penilaian risiko berhasil diperbarui',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ UPDATE PENILAIAN ERROR:', error)
    res.status(500).json({
      message: error.message,
      code: error.code,
      detail: error.detail,
    })
  }
}

exports.saveAnalisisResidu = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user
    const filter = req.filter

    console.log('BODY ANALISIS RESIDU:', req.body)

    const { risk_id, likelihood, impact } = req.body

    // 1. Validasi Input Dasar
    if (!risk_id || likelihood == null || impact == null) {
      return res.status(400).json({
        message: 'Data analisis residu risiko belum lengkap',
      })
    }

    // 2. 🔥 SECURITY CHECK: Apakah risiko ini milik user yang login? (via filter)
    if (filter?.created_by_uuid) {
      const cekRisiko = await pool.query(
        'SELECT created_by_uuid FROM identifikasi_resiko WHERE id = $1',
        [risk_id],
      )

      if (
        cekRisiko.rows.length > 0 &&
        cekRisiko.rows[0].created_by_uuid !== filter.created_by_uuid
      ) {
        return res.status(403).json({
          message: 'Anda hanya bisa menganalisis residu risiko milik sendiri',
        })
      }
    }

    // 3. ✅ EKSEKUSI UPSERT (Insert atau otomatis Update jika duplikat key)
    const result = await pool.query(
      `
      INSERT INTO penilaian_resiko
      (
        risk_id,
        assessment_type,
        likelihood,
        impact,
        assessed_by,
        created_at
      )
      VALUES ($1, 'RESIDUAL', $2, $3, $4, NOW())
      ON CONFLICT (risk_id, assessment_type) 
      DO UPDATE SET 
        likelihood = EXCLUDED.likelihood,
        impact = EXCLUDED.impact,
        assessed_by = EXCLUDED.assessed_by
      RETURNING *
      `,
      [risk_id, likelihood, impact, user.id],
    )

    await pool.query(
      `UPDATE identifikasi_resiko SET fase = 'Pengendalian', updated_at = NOW() WHERE id = $1`,
      [risk_id],
    )
    console.log(
      `✨ Fase risiko ${risk_id} berhasil diperbarui menjadi 'Pengendalian' (Evaluasi Residu)`,
    )

    res.status(200).json({
      message: 'Analisis residu risiko (skala after) berhasil disimpan',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ SAVE ANALISIS RESIDU ERROR:', error)
    res.status(500).json({
      message: error.message,
      code: error.code,
      detail: error.detail,
    })
  }
}

/* ===============================
   CREATE PENILAIAN KONTROL
================================ */
exports.createPenilaianKontrol = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const user = req.user
    const { kontrol_id, effectiveness, status } = req.body

    if (!kontrol_id || effectiveness == null) {
      return res.status(400).json({
        message: 'Data penilaian kontrol belum lengkap',
      })
    }

    // 🔥 CEK apakah kontrol ini milik user yang login?
    if (user.role !== 'ADMIN') {
      const cek = await pool.query(
        `
        SELECT k.*, r.created_by_uuid 
        FROM kontrol_pengendalian k
        LEFT JOIN identifikasi_resiko r ON k.risk_id = r.id
        WHERE k.id = $1
      `,
        [kontrol_id],
      )

      if (cek.rows.length > 0 && cek.rows[0].created_by_uuid !== user.id) {
        return res.status(403).json({
          message: 'Anda hanya bisa menilai kontrol milik sendiri',
        })
      }
    }

    const result = await pool.query(
      `
      INSERT INTO penilaian_kontrol
      (kontrol_id, effectiveness, status, created_by, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
      `,
      [kontrol_id, effectiveness, status || 'INEFFECTIVE', user.id],
    )

    res.status(201).json({
      message: 'Penilaian kontrol berhasil disimpan',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ CREATE PENILAIAN KONTROL ERROR:', error)
    res.status(500).json({
      message: error.message,
      code: error.code,
      detail: error.detail,
    })
  }
}

exports.deletePenilaian = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user
    const filter = req.filter
    const { id } = req.params // ID dari penilaian_resiko yang ingin dihapus

    console.log(`🗑️ Menghapus penilaian ID: ${id}`)

    // 1. Ambil data penilaian lama untuk memeriksa kepemilikan risiko sebelum dihapus
    const checkPenilaian = await pool.query(
      `SELECT p.id
       FROM penilaian_resiko p
       WHERE p.id = $1`,
      [id],
    )

    if (checkPenilaian.rows.length === 0) {
      return res.status(404).json({
        message: 'Data penilaian risiko tidak ditemukan',
      })
    }

    const createdByUuid = checkPenilaian.rows[0].created_by_uuid

    // 2. 🔥 CEK SECURITY: Apakah risiko ini milik user yang login? (Hanya berlaku untuk non-ADMIN)
    if (filter?.created_by_uuid) {
      if (createdByUuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message: 'Anda hanya memiliki hak akses untuk menghapus penilaian risiko milik sendiri',
        })
      }
    }

    // 3. ✅ EKSEKUSI DELETE
    const result = await pool.query(
      `
      DELETE FROM penilaian_resiko
      WHERE id = $1
      RETURNING *
      `,
      [id],
    )

    console.log(`✅ Penilaian ID ${id} berhasil dihapus oleh User: ${user.id}`)

    res.json({
      message: 'Penilaian risiko berhasil dihapus',
      data: result.rows[0], // Mengembalikan data yang baru saja dihapus (opsional)
    })
  } catch (error) {
    console.error('❌ DELETE PENILAIAN ERROR:', error)
    res.status(500).json({
      message: error.message,
      code: error.code,
      detail: error.detail,
    })
  }
}
