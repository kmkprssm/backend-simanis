/* eslint-disable prettier/prettier */
const { getPool } = require('../config/db') // <-- UBAH INI!

// =============================
// GET ALL KONTROL - DENGAN FILTER!
// =============================
// =============================
// GET ALL KONTROL - DENGAN FILTER!
// =============================
exports.getAllKontrol = async (req, res) => {
  try {
    const pool = getPool()

    // 🔥 CEK APAKAH USER ADA?
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized - No user data' })
    }

    const user = req.user
    const filter = req.filter

    console.log('🔍 ===== DEBUG GET ALL KONTROL =====')
    console.log('👤 User:', user?.email, 'Role:', user?.role)
    console.log('📋 Filter dari middleware:', filter)

    // 🔥 CEK LANGSUNG DI DATABASE (tanpa filter dulu)
    const semuaKontrol = await pool.query(`
      SELECT k.*, i.nama_resiko, i.created_by_uuid
      FROM kontrol_pengendalian k
      LEFT JOIN identifikasi_resiko i ON i.id = k.risk_id
    `)
    console.log('📊 TOTAL semua kontrol di database:', semuaKontrol.rows.length)

    // 🔥 CEK KONTROL UNTUK USER INI
    if (filter?.created_by_uuid) {
      const kontrolUser = await pool.query(
        `
        SELECT k.*, i.nama_resiko, i.created_by_uuid
        FROM kontrol_pengendalian k
        LEFT JOIN identifikasi_resiko i ON i.id = k.risk_id
        WHERE i.created_by_uuid = $1
      `,
        [filter.created_by_uuid],
      )
      console.log('📊 Kontrol untuk user ini:', kontrolUser.rows.length)
    }

    let query = `
      SELECT 
        k.*,
        i.nama_resiko,
        i.created_by_uuid,
        i.status AS status_risiko
      FROM kontrol_pengendalian k
      LEFT JOIN identifikasi_resiko i ON i.id = k.risk_id
    `

    let params = []
    let conditions = []

    // 🔥 FILTER DARI RISKFILTER MIDDLEWARE
    if (filter?.created_by_uuid) {
      conditions.push(`i.created_by_uuid = $${params.length + 1}`)
      params.push(filter.created_by_uuid)
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ')
    }

    query += ` ORDER BY k.created_at DESC`

    console.log('📝 Query akhir:', query)
    console.log('📦 Params akhir:', params)

    const result = await pool.query(query, params)

    console.log(`✅ Mendapatkan ${result.rows.length} data kontrol untuk user`)
    console.log('🔍 ===== END DEBUG =====\n')

    res.json(result.rows)
  } catch (err) {
    console.error('❌ GET KONTROL ERROR:', err)
    res.status(500).json({
      message: err.message,
      detail: err.detail,
    })
  }
}

// =============================
// GET KONTROL BY RISK ID
// =============================
// =============================
// GET KONTROL BY RISK ID
// =============================
exports.getKontrolByRisk = async (req, res) => {
  try {
    const pool = getPool()

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized - No user data' })
    }

    const { risk_id } = req.params
    const user = req.user
    const filter = req.filter

    console.log('🔍 ===== DEBUG GET KONTROL BY RISK =====')
    console.log('📌 risk_id:', risk_id)
    console.log('👤 User:', user?.email, 'Role:', user?.role)
    console.log('📋 Filter:', filter)

    // 🔥 CEK APAKAH USER BERHAK LIHAT RISIKO INI? (via filter)
    if (filter?.created_by_uuid) {
      const cekRisiko = await pool.query(
        'SELECT created_by_uuid FROM identifikasi_resiko WHERE id = $1',
        [risk_id],
      )

      console.log('📊 Hasil cek risiko:', cekRisiko.rows[0])

      if (cekRisiko.rows.length === 0) {
        return res.status(404).json({ message: 'Risiko tidak ditemukan' })
      }

      if (cekRisiko.rows[0].created_by_uuid !== filter.created_by_uuid) {
        console.log('❌ AKSES DITOLAK!')
        return res.status(403).json({
          message: 'Anda hanya bisa melihat kontrol pada risiko milik sendiri',
        })
      }
    }

    // 🔥 CEK KONTROL DI DATABASE
    const cekKontrol = await pool.query(
      'SELECT id, nama_kontrol FROM kontrol_pengendalian WHERE risk_id = $1',
      [risk_id],
    )
    console.log(`📊 Kontrol di database untuk risk_id ${risk_id}:`, cekKontrol.rows.length)

    const result = await pool.query(
      `
      SELECT 
        k.*,
        i.nama_resiko,
        i.status AS status_risiko
      FROM kontrol_pengendalian k
      LEFT JOIN identifikasi_resiko i ON i.id = k.risk_id
      WHERE k.risk_id = $1
      ORDER BY k.created_at DESC
      `,
      [risk_id],
    )

    console.log(`✅ Mendapatkan ${result.rows.length} kontrol untuk risk_id ${risk_id}`)
    console.log('🔍 ===== END DEBUG =====\n')

    res.json(result.rows)
  } catch (err) {
    console.error('❌ GET KONTROL BY RISK ERROR:', err)
    res.status(500).json({ message: err.message })
  }
}
// =============================
// CREATE KONTROL
// =============================
exports.createKontrol = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!

    // 🔥 CEK APAKAH USER ADA?
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized - No user data' })
    }

    const user = req.user
    const filter = req.filter

    let { risk_id, nama_kontrol, tipe, deskripsi } = req.body

    console.log('Body:', req.body)

    // Validasi input
    if (!risk_id || !nama_kontrol || !tipe) {
      return res.status(400).json({
        message: 'risk_id, nama_kontrol, dan tipe wajib diisi',
      })
    }

    // 🔥 CEK STATUS RISIKO
    const cekRisiko = await pool.query(
      'SELECT id, nama_resiko, status, created_by_uuid FROM identifikasi_resiko WHERE id = $1',
      [risk_id],
    )

    if (cekRisiko.rows.length === 0) {
      return res.status(404).json({ message: 'Risiko tidak ditemukan' })
    }

    const risiko = cekRisiko.rows[0]

    console.log({ risiko })

    // 🚨 CEK APAKAH RISIKO SUDAH CLOSED?
    if (risiko.status === 'Closed' || risiko.status === 'CLOSED') {
      return res.status(400).json({
        message: `Tidak dapat menambah kontrol ke risiko "${risiko.nama_resiko}" karena status sudah CLOSED`,
      })
    }

    // 🔥 CEK KEPEMILIKAN via filter
    if (filter?.created_by_uuid && risiko.created_by_uuid !== filter.created_by_uuid) {
      return res.status(403).json({
        message: 'Anda hanya bisa menambah kontrol ke risiko milik sendiri',
      })
    }

    // ===== NORMALISASI TIPE =====
    const mapTipe = {
      preventif: 'PREVENTIVE',
      detektif: 'DETECTIVE',
      korektif: 'CORRECTIVE',
      preventive: 'PREVENTIVE',
      detective: 'DETECTIVE',
      corrective: 'CORRECTIVE',
      PREVENTIF: 'PREVENTIVE',
      DETEKTIF: 'DETECTIVE',
      KOREKTIF: 'CORRECTIVE',
    }

    if (tipe) {
      const key = tipe.toLowerCase().trim()
      tipe = mapTipe[key] || tipe.toUpperCase()
    }

    console.log('Tipe setelah normalisasi:', tipe)

    // ✅ INSERT kontrol
    const result = await pool.query(
      `INSERT INTO kontrol_pengendalian
       (risk_id, nama_kontrol, tipe, deskripsi, created_by_uuid, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [risk_id, nama_kontrol, tipe, deskripsi || null, user.id],
    )

    await pool.query(
      `UPDATE identifikasi_resiko SET fase = 'Perlakuan', updated_at = NOW() WHERE id = $1`,
      [risk_id],
    )
    console.log(`✨ Fase risiko ${risk_id} berhasil diperbarui menjadi 'Perlakuan'`)

    res.status(201).json({
      message: 'Kontrol berhasil ditambahkan',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ CREATE KONTROL ERROR:', error)
    res.status(500).json({
      message: 'Gagal menambah kontrol: ' + error.message,
    })
  }
}

// =============================
// UPDATE KONTROL
// =============================
exports.updateKontrol = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const { id } = req.params
    const user = req.user
    const filter = req.filter
    const { nama_kontrol, tipe, deskripsi } = req.body

    // 🔥 CEK kepemilikan via filter
    if (filter?.created_by_uuid) {
      const cek = await pool.query(
        `
        SELECT k.*, i.created_by_uuid, i.status 
        FROM kontrol_pengendalian k
        JOIN identifikasi_resiko i ON i.id = k.risk_id
        WHERE k.id = $1
      `,
        [id],
      )

      if (cek.rows.length === 0) {
        return res.status(404).json({ message: 'Kontrol tidak ditemukan' })
      }

      if (cek.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message: 'Anda hanya bisa mengupdate kontrol milik sendiri',
        })
      }

      if (cek.rows[0].status === 'Closed' || cek.rows[0].status === 'CLOSED') {
        return res.status(400).json({
          message: 'Tidak dapat mengupdate kontrol pada risiko yang sudah CLOSED',
        })
      }
    }

    const result = await pool.query(
      `
      UPDATE kontrol_pengendalian
      SET nama_kontrol = $1,
          tipe = $2,
          deskripsi = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
      `,
      [nama_kontrol, tipe, deskripsi, id],
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Kontrol tidak ditemukan' })
    }

    res.json({
      message: 'Kontrol berhasil diupdate',
      data: result.rows[0],
    })
  } catch (err) {
    console.error('❌ UPDATE KONTROL ERROR:', err)
    res.status(500).json({ message: err.message })
  }
}

// =============================
// DELETE KONTROL
// =============================
exports.deleteKontrol = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const { id } = req.params
    const user = req.user
    const filter = req.filter

    // 🔥 CEK kepemilikan via filter
    if (filter?.created_by_uuid) {
      const cek = await pool.query(
        `
        SELECT k.*, i.created_by_uuid, i.status 
        FROM kontrol_pengendalian k
        JOIN identifikasi_resiko i ON i.id = k.risk_id
        WHERE k.id = $1
      `,
        [id],
      )

      if (cek.rows.length === 0) {
        return res.status(404).json({ message: 'Kontrol tidak ditemukan' })
      }

      if (cek.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message: 'Anda hanya bisa menghapus kontrol milik sendiri',
        })
      }

      if (cek.rows[0].status === 'Closed' || cek.rows[0].status === 'CLOSED') {
        return res.status(400).json({
          message: 'Tidak dapat menghapus kontrol pada risiko yang sudah CLOSED',
        })
      }
    }

    // Cek apakah kontrol memiliki action
    const cekAction = await pool.query(
      'SELECT id FROM action_kontrol WHERE kontrol_id = $1 LIMIT 1',
      [id],
    )

    if (cekAction.rows.length > 0) {
      return res.status(400).json({
        message: 'Tidak dapat menghapus kontrol yang sudah memiliki action plan',
      })
    }

    const result = await pool.query('DELETE FROM kontrol_pengendalian WHERE id = $1 RETURNING id', [
      id,
    ])

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Kontrol tidak ditemukan' })
    }

    res.json({
      message: 'Kontrol berhasil dihapus',
      deletedId: result.rows[0].id,
    })
  } catch (err) {
    console.error('❌ DELETE KONTROL ERROR:', err)
    res.status(500).json({ message: err.message })
  }
}

// =============================
// GET STATUS KONTROL (DARI ACTION)
// =============================
exports.getStatusKontrol = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const { kontrol_id } = req.params
    const user = req.user
    const filter = req.filter

    // 🔥 CEK akses via filter
    if (filter?.created_by_uuid) {
      const cek = await pool.query(
        `
        SELECT i.created_by_uuid 
        FROM kontrol_pengendalian k
        JOIN identifikasi_resiko i ON i.id = k.risk_id
        WHERE k.id = $1
      `,
        [kontrol_id],
      )

      if (cek.rows.length === 0) {
        return res.status(404).json({ message: 'Kontrol tidak ditemukan' })
      }

      if (cek.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message: 'Anda tidak memiliki akses ke kontrol ini',
        })
      }
    }

    const query = `
      SELECT
        kontrol_id,
        CASE
          WHEN COUNT(*) = 0 THEN 'Belum Dinilai'
          WHEN SUM(CASE WHEN status = 'Overdue' THEN 1 ELSE 0 END) > 0
            THEN 'Tidak Efektif'
          WHEN SUM(CASE WHEN status IN ('Open', 'On Progress') THEN 1 ELSE 0 END) > 0
            THEN 'Sebagian Efektif'
          WHEN SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) = COUNT(*)
            THEN 'Efektif'
          ELSE 'Belum Dinilai'
        END AS status_kontrol
      FROM action_kontrol
      WHERE kontrol_id = $1
      GROUP BY kontrol_id
    `

    const result = await pool.query(query, [kontrol_id])

    if (result.rows.length === 0) {
      return res.json({
        kontrol_id,
        status_kontrol: 'Belum Dinilai',
      })
    }

    res.json(result.rows[0])
  } catch (err) {
    console.error('❌ GET STATUS KONTROL ERROR:', err)
    res.status(500).json({ message: err.message })
  }
}
