/* eslint-disable prettier/prettier */
const { getPool } = require('../config/db') // <-- UBAH INI!

/**
 * GET semua evaluasi risiko - HANYA YANG TERAKHIR PER RISIKO!
 */
/**
 * GET semua evaluasi risiko - HANYA YANG TERAKHIR PER RISIKO!
 */
exports.getEvaluasi = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user
    const filter = req.filter

    console.log('👤 User evaluasi:', user?.email, 'Role:', user?.role)
    console.log('🔍 Filter evaluasi:', filter)

    // CEK DULU APAKAH TABEL evaluasi_resiko ADA
    try {
      await pool.query('SELECT 1 FROM evaluasi_resiko LIMIT 1')
    } catch (err) {
      console.log('⚠️ Tabel evaluasi_resiko belum ada, buat dulu...')

      // BUAT TABEL EVALUASI
      await pool.query(`
        CREATE TABLE IF NOT EXISTS evaluasi_resiko (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          risk_id UUID NOT NULL REFERENCES identifikasi_resiko(id) ON DELETE CASCADE,
          strategi TEXT NOT NULL,
          prioritas TEXT,
          justifikasi TEXT,
          evaluated_by UUID REFERENCES users(id),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP
        );
      `)
      console.log('✅ Tabel evaluasi_resiko berhasil dibuat')
    }

    let query = `
      WITH ranked_evaluasi AS (
        SELECT 
          e.id,
          e.risk_id,
          i.nama_resiko,
          i.status AS status_risiko,
          i.created_by_uuid,
          e.strategi,
          e.prioritas,
          e.justifikasi,
          e.evaluated_by,
          e.created_at,
          e.is_active,
          u.username AS evaluator_name,
          ROW_NUMBER() OVER (PARTITION BY e.risk_id ORDER BY e.created_at DESC) AS rn
        FROM evaluasi_resiko e
        JOIN identifikasi_resiko i ON i.id = e.risk_id
        LEFT JOIN users u ON e.evaluated_by = u.id
    `

    let params = []
    let conditions = []

    if (filter?.created_by_uuid) {
      conditions.push(`i.created_by_uuid = $${params.length + 1}`)
      params.push(filter.created_by_uuid)
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ')
    }

    query += `
      )
      SELECT *
      FROM ranked_evaluasi
      WHERE rn = 1
      ORDER BY created_at DESC
    `

    console.log('📝 Query evaluasi:', query)
    console.log('📦 Params evaluasi:', params)

    const result = await pool.query(query, params)

    console.log(`✅ Mendapatkan ${result.rows.length} data evaluasi`)
    res.json(result.rows)
  } catch (error) {
    console.error('❌ GET EVALUASI ERROR:', error)
    console.error('❌ Error stack:', error.stack)
    res.status(500).json({
      message: 'Gagal memuat data evaluasi',
      error: error.message,
    })
  }
}

/**
 * GET riwayat evaluasi per risiko (SEMUA data, untuk modal history)
 */
exports.getRiwayatByRisk = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const { risk_id } = req.params
    const user = req.user
    const filter = req.filter

    // 🔥 CEK AKSES via filter
    if (filter?.created_by_uuid) {
      const cekRisiko = await pool.query(
        'SELECT created_by_uuid FROM identifikasi_resiko WHERE id = $1',
        [risk_id],
      )

      if (cekRisiko.rows.length === 0) {
        return res.status(404).json({ message: 'Risiko tidak ditemukan' })
      }

      if (cekRisiko.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message: 'Anda tidak memiliki akses ke riwayat risiko ini',
        })
      }
    }

    // AMBIL SEMUA DATA (untuk riwayat)
    const q = `
      SELECT
        er.id,
        er.risk_id,
        ir.nama_resiko,
        ir.status AS status_risiko,
        er.strategi,
        er.prioritas,
        er.justifikasi,
        er.evaluated_by,
        u.username AS evaluator_name,
        er.created_at
      FROM evaluasi_resiko er
      JOIN identifikasi_resiko ir ON ir.id = er.risk_id
      LEFT JOIN users u ON er.evaluated_by = u.id
      WHERE er.risk_id = $1
      ORDER BY er.created_at DESC
    `

    const { rows } = await pool.query(q, [risk_id])

    console.log(`✅ Mendapatkan ${rows.length} riwayat evaluasi`)

    res.json(rows)
  } catch (err) {
    console.error('❌ getRiwayatByRisk error:', err)
    res.status(500).json({ message: 'Gagal memuat riwayat evaluasi' })
  }
}

// Backend: Mendapatkan statistik evaluasi risiko berdasarkan hak akses role
exports.getStatsEvaluasi = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user
    const filter = req.filter // Filter bawaan middleware (pembatasan UUID user biasa)

    let params = []
    let paramCounter = 1
    let conditions = []

    // 1. Terapkan filter hak akses jika user login bukan ADMIN
    if (filter?.created_by_uuid) {
      conditions.push(`i.created_by_uuid = $${paramCounter}`)
      params.push(filter.created_by_uuid)
      paramCounter++
    }

    let whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    console.log(`📊 Mengambil statistik evaluasi untuk Role: ${user?.role || 'UNKNOWN'}`)

    // Query Agregasi: Menghitung total ter-evaluasi, pending, urgent, dan strategi dari evaluasi TERAKHIR (rn = 1)
    const statsQuery = `
      WITH latest_evaluasi AS (
        SELECT 
          e.risk_id,
          e.strategi,
          e.prioritas,
          ROW_NUMBER() OVER (PARTITION BY e.risk_id ORDER BY e.created_at DESC) AS rn
        FROM evaluasi_resiko e
        JOIN identifikasi_resiko i ON i.id = e.risk_id
        ${whereClause}
      ),
      active_risks_count AS (
        SELECT COUNT(*) AS total_active 
        FROM identifikasi_resiko i
        ${whereClause ? `${whereClause} AND` : 'WHERE'} i.status NOT IN ('Closed', 'CLOSED', 'DITUTUP')
      )
      SELECT 
        (SELECT total_active FROM active_risks_count) AS active_risks,
        COUNT(DISTINCT le.risk_id) AS total_evaluated,
        COUNT(CASE WHEN le.prioritas = '1' THEN 1 END) AS urgent_count,
        COUNT(CASE WHEN UPPER(TRIM(le.strategi)) LIKE '%TREAT%' THEN 1 END) AS treat_count,
        COUNT(CASE WHEN UPPER(TRIM(le.strategi)) LIKE '%TRANSFER%' THEN 1 END) AS transfer_count,
        COUNT(CASE WHEN UPPER(TRIM(le.strategi)) LIKE '%AVOID%' THEN 1 END) AS avoid_count,
        COUNT(CASE WHEN UPPER(TRIM(le.strategi)) LIKE '%ACCEPT%' THEN 1 END) AS accept_count
      FROM latest_evaluasi le
      WHERE le.rn = 1
    `

    const result = await pool.query(statsQuery, params)
    const stats = result.rows[0]

    const activeRisks = parseInt(stats.active_risks || 0)
    const totalEvaluated = parseInt(stats.total_evaluated || 0)

    // Formula Pengaman: Risiko Aktif dikurangi yang Sudah Dievaluasi (Memastikan tidak minus)
    const pendingEvaluation = Math.max(0, activeRisks - totalEvaluated)

    res.json({
      totalEvaluated: totalEvaluated,
      pendingEvaluation: pendingEvaluation,
      urgentCount: parseInt(stats.urgent_count || 0),
      activeRisks: activeRisks,
      strategiCount: {
        TREAT: parseInt(stats.treat_count || 0),
        TRANSFER: parseInt(stats.transfer_count || 0),
        AVOID: parseInt(stats.avoid_count || 0),
        ACCEPT: parseInt(stats.accept_count || 0),
      },
    })
  } catch (error) {
    console.error('❌ GET STATS EVALUASI ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

/**
 * POST evaluasi risiko
 */
exports.createEvaluasi = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const user = req.user
    const filter = req.filter

    const { risk_id, strategi, prioritas, justifikasi } = req.body

    console.log('📝 Create evaluasi oleh user:', user.id, user.email)

    if (!risk_id || !strategi) {
      return res.status(400).json({
        message: 'Risk dan strategi wajib diisi',
      })
    }

    // 🔥 CEK KEPEMILIKAN RISIKO via filter
    if (filter?.created_by_uuid) {
      const cekRisiko = await pool.query(
        'SELECT id, nama_resiko, created_by_uuid FROM identifikasi_resiko WHERE id = $1',
        [risk_id],
      )

      if (cekRisiko.rows.length === 0) {
        return res.status(404).json({ message: 'Risiko tidak ditemukan' })
      }

      if (cekRisiko.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message: 'Anda hanya bisa mengevaluasi risiko milik sendiri',
        })
      }
    }

    const result = await pool.query(
      `
      INSERT INTO evaluasi_resiko
      (
        risk_id,
        strategi,
        prioritas,
        justifikasi,
        evaluated_by,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,NOW())
      RETURNING *
      `,
      [risk_id, strategi, prioritas || null, justifikasi || '', user.id],
    )

    await pool.query(
      `UPDATE identifikasi_resiko SET fase = 'Evaluasi', updated_at = NOW() WHERE id = $1`,
      [risk_id],
    )
    console.log(`✨ Fase risiko ${risk_id} berhasil diperbarui menjadi 'Evaluasi'`)

    res.status(201).json({
      message: 'Evaluasi risiko berhasil disimpan',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ INSERT EVALUASI ERROR:', error)
    res.status(500).json({
      message: error.message,
      code: error.code,
      detail: error.detail,
    })
  }
}

// Backend update/edit evaluasi risiko (Murni single table update)
exports.updateEvaluasi = async (req, res) => {
  const pool = getPool()
  const user = req.user
  const filter = req.filter

  // Ambil ID evaluasi dari parameter URL (api/evaluasi/:id)
  const { id } = req.params
  const { risk_id, strategi, prioritas, justifikasi, is_active } = req.body

  console.log(`📝 Update evaluasi ID: ${id} oleh user:`, user.id, user.email)

  // 1. Validasi Input Dasar
  if (!id || !risk_id || !strategi) {
    return res.status(400).json({
      message: 'ID Evaluasi, Risk ID, dan strategi wajib dipenuhi',
    })
  }

  try {
    // 2. 🔥 SECURITY CHECK: Pastikan risiko induk ini milik user yang login (via filter RBAC)
    if (filter?.created_by_uuid) {
      const cekRisiko = await pool.query(
        'SELECT id, created_by_uuid FROM identifikasi_resiko WHERE id = $1',
        [risk_id],
      )

      if (cekRisiko.rows.length === 0) {
        return res.status(404).json({ message: 'Risiko induk tidak ditemukan' })
      }

      if (cekRisiko.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message: 'Anda hanya bisa mengubah evaluasi risiko milik sendiri',
        })
      }
    }

    // 3. Cek apakah data evaluasi yang mau di-edit memang eksis di database
    const cekEvaluasi = await pool.query(
      'SELECT id FROM evaluasi_resiko WHERE id = $1 AND risk_id = $2',
      [id, risk_id],
    )

    if (cekEvaluasi.rows.length === 0) {
      return res.status(404).json({ message: 'Data riwayat evaluasi tidak ditemukan' })
    }

    // 4. ✅ EKSEKUSI UPDATE DATA EVALUASI
    const updateEvaluasiQuery = `
      UPDATE evaluasi_resiko
      SET 
        strategi = $1,
        prioritas = $2,
        justifikasi = $3,
        evaluated_by = $4,
        is_active = $5
      WHERE id = $6
      RETURNING *
    `
    // Ambil status is_active, jika tidak dikirim dari front-end default-kan tetap true
    const isActiveStatus = is_active !== undefined ? is_active : true

    const result = await pool.query(updateEvaluasiQuery, [
      strategi,
      prioritas || null,
      justifikasi || '',
      user.id,
      isActiveStatus, // $5
      id, // $6
    ])

    console.log(`✨ Perubahan evaluasi ID: ${id} berhasil disimpan tanpa mengubah fase risiko.`)

    res.status(200).json({
      message: 'Evaluasi risiko berhasil diperbarui',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ UPDATE EVALUASI ERROR:', error)
    res.status(500).json({
      message: error.message,
      code: error.code,
      detail: error.detail,
    })
  }
}
