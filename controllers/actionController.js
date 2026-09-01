/* eslint-disable prettier/prettier */
const { getPool } = require('../config/db') // <-- UBAH INI!

/**
 * =====================================================
 * GET semua action - DENGAN FILTER!
 * =====================================================
 */
exports.getAction = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const user = req.user
    const filter = req.filter // <-- PAKAI FILTER DARI MIDDLEWARE

    let query = `
      SELECT
        a.*,
        k.nama_kontrol,
        i.nama_resiko,
        i.created_by_uuid AS risiko_created_by,
        u.username AS pemilik_risiko
      FROM action_kontrol a
      JOIN kontrol_pengendalian k ON k.id = a.kontrol_id
      JOIN identifikasi_resiko i ON i.id = k.risk_id
      LEFT JOIN users u ON a.created_by_uuid = u.id
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

    query += ` ORDER BY a.created_at DESC`

    console.log('📝 Action query:', query)
    console.log('📦 Params:', params)

    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (error) {
    console.error('❌ GET ACTION ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

/**
 * =====================================================
 * GET action berdasarkan kontrol_id
 * =====================================================
 */
exports.getActionByKontrol = async (req, res) => {
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
          message: 'Anda hanya bisa melihat action pada kontrol milik sendiri',
        })
      }
    }

    const result = await pool.query(
      `
      SELECT a.*, k.nama_kontrol, i.nama_resiko
      FROM action_kontrol a
      JOIN kontrol_pengendalian k ON k.id = a.kontrol_id
      JOIN identifikasi_resiko i ON i.id = k.risk_id
      WHERE a.kontrol_id = $1
      ORDER BY a.created_at ASC
      `,
      [kontrol_id],
    )

    res.json(result.rows)
  } catch (error) {
    console.error('❌ GET ACTION BY KONTROL ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

/**
 * =====================================================
 * POST action plan
 * =====================================================
 */
/**
 * =====================================================
 * POST action plan
 * =====================================================
 */
exports.createAction = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user
    const filter = req.filter

    const { kontrol_id, action_plan, pic_name, target_date, kebutuhan_sumberdaya, status } =
      req.body

    console.log('📝 Create action oleh user:', user.id)
    console.log('📦 Request body:', req.body)

    if (!kontrol_id || !action_plan) {
      return res.status(400).json({
        message: 'Kontrol dan action plan wajib diisi',
      })
    }

    // 🔥 CEK KEPEMILIKAN KONTROL dan AMBIL risk_id
    const cek = await pool.query(
      `
      SELECT k.*, i.id as risk_id, i.created_by_uuid 
      FROM kontrol_pengendalian k
      JOIN identifikasi_resiko i ON i.id = k.risk_id
      WHERE k.id = $1
    `,
      [kontrol_id],
    )

    if (cek.rows.length === 0) {
      return res.status(404).json({ message: 'Kontrol tidak ditemukan' })
    }

    // 🔥 CEK akses (kecuali admin)
    if (filter?.created_by_uuid && cek.rows[0].created_by_uuid !== filter.created_by_uuid) {
      return res.status(403).json({
        message: 'Anda hanya bisa membuat action pada kontrol milik sendiri',
      })
    }

    // ✅ AMBIL risk_id dari hasil query
    const risk_id = cek.rows[0].risk_id

    // INSERT dengan menyertakan risk_id
    const result = await pool.query(
      `INSERT INTO action_kontrol
       (kontrol_id, risk_id, action_plan, pic_name, target_date, 
        kebutuhan_sumberdaya, status, created_by_uuid, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [
        kontrol_id,
        risk_id,
        action_plan,
        pic_name || '',
        target_date || null,
        kebutuhan_sumberdaya || '',
        status || 'Open',
        user.id,
      ],
    )

    console.log('✅ Action created:', result.rows[0].id)

    await pool.query(
      `UPDATE identifikasi_resiko SET fase = 'Perlakuan', updated_at = NOW() WHERE id = $1`,
      [risk_id],
    )
    console.log(`✨ Fase risiko ${risk_id} dipastikan tetap berada di fase 'Perlakuan'`)

    res.status(201).json({
      message: '✅ Action plan berhasil disimpan',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ CREATE ACTION ERROR:', error)
    res.status(500).json({
      message: '❌ Gagal menambah action: ' + error.message,
    })
  }
}

/**
 * =====================================================
 * PUT update status / bukti action
 * =====================================================
 */
// Backend update action
exports.updateAction = async (req, res) => {
  try {
    const pool = getPool()
    const { id } = req.params
    const user = req.user
    const filter = req.filter
    const { status, realisasi_date, bukti_mitigasi, action_plan, pic_name, target_date } = req.body

    // 1. CEK kepemilikan via filter
    if (filter?.created_by_uuid) {
      const cek = await pool.query(
        `
        SELECT a.*, i.created_by_uuid 
        FROM action_kontrol a
        JOIN kontrol_pengendalian k ON k.id = a.kontrol_id
        JOIN identifikasi_resiko i ON i.id = k.risk_id
        WHERE a.id = $1
      `,
        [id],
      )

      if (cek.rows.length === 0) {
        return res.status(404).json({ message: 'Action tidak ditemukan' })
      }

      if (cek.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message: 'Anda hanya bisa mengupdate action milik sendiri',
        })
      }
    }

    // 2. Ambil data status terkini dari database
    const current = await pool.query(
      `SELECT status, bukti_mitigasi, action_plan, pic_name, target_date, realisasi_date FROM action_kontrol WHERE id = $1`,
      [id],
    )

    if (current.rows.length === 0) {
      return res.status(404).json({ message: 'Data tidak ditemukan' })
    }

    const currentStatus = current.rows[0].status
    const currentBukti = current.rows[0].bukti_mitigasi

    // -------------------------------------------------------------------------
    // KONDISI SOLUSI 2: JIKA STATUS SAAT INI ADALAH 'Closed'
    // Petugas hanya boleh mengedit realisasi_date dan bukti_mitigasi
    // -------------------------------------------------------------------------
    if (currentStatus === 'Closed') {
      // Pastikan bukti_mitigasi baru atau lama tidak kosong
      const buktiFinal = bukti_mitigasi || currentBukti
      if (!buktiFinal) {
        return res.status(400).json({ message: 'Bukti mitigasi wajib diisi untuk status Closed' })
      }

      const result = await pool.query(
        `
        UPDATE action_kontrol
        SET realisasi_date = COALESCE($1, realisasi_date),
            bukti_mitigasi = COALESCE($2, bukti_mitigasi),
            updated_at = NOW()
        WHERE id = $3
        RETURNING *
        `,
        [realisasi_date || null, bukti_mitigasi || null, id],
      )

      return res.json({
        message: 'Data realisasi dan bukti mitigasi berhasil diperbarui',
        data: result.rows[0],
      })
    }

    // -------------------------------------------------------------------------
    // KONDISI SOLUSI 1 & ALUR NORMAL (Status Open atau On Progress)
    // -------------------------------------------------------------------------

    // Tentukan status target (jika tidak dikirim di body, asumsikan status tidak berubah)
    const targetStatus = status || currentStatus

    // Validasi Alur Status Perubahan (Jika statusnya berubah)
    if (currentStatus !== targetStatus) {
      const flow = {
        Open: ['On Progress'],
        'On Progress': ['Closed'],
        Closed: [], // Perubahan keluar dari Closed ditangani di atas (tidak boleh)
      }

      if (!flow[currentStatus]?.includes(targetStatus)) {
        return res.status(400).json({
          message: `Perubahan alur status ${currentStatus} → ${targetStatus} tidak diizinkan`,
        })
      }
    }

    // Validasi khusus saat mau mengubah status menjadi Closed
    if (targetStatus === 'Closed') {
      const buktiFinal = bukti_mitigasi || currentBukti
      if (!buktiFinal) {
        return res.status(400).json({
          message: 'Bukti mitigasi wajib diisi sebelum status diubah menjadi Closed',
        })
      }
    }

    // Jalankan update data umum (Bisa mengedit konten action_plan, pic, dll saat Open/On Progress)
    const result = await pool.query(
      `
      UPDATE action_kontrol
      SET status = $1,
          action_plan = COALESCE($2, action_plan),
          pic_name = COALESCE($3, pic_name),
          target_date = COALESCE($4, target_date),
          realisasi_date = COALESCE($5, realisasi_date),
          bukti_mitigasi = COALESCE($6, bukti_mitigasi),
          updated_at = NOW()
      WHERE id = $7
      RETURNING *
      `,
      [
        targetStatus,
        action_plan || null,
        pic_name || null,
        target_date || null,
        realisasi_date || null,
        bukti_mitigasi || null,
        id,
      ],
    )

    res.json({
      message: 'Tindakan risiko berhasil diperbarui',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ UPDATE ACTION ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

/**
 * =====================================================
 * DELETE action plan
 * =====================================================
 */
exports.deleteAction = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const { id } = req.params
    const user = req.user
    const filter = req.filter

    // 🔥 CEK kepemilikan via filter
    if (filter?.created_by_uuid) {
      const cek = await pool.query(
        `
        SELECT a.*, i.created_by_uuid 
        FROM action_kontrol a
        JOIN kontrol_pengendalian k ON k.id = a.kontrol_id
        JOIN identifikasi_resiko i ON i.id = k.risk_id
        WHERE a.id = $1
      `,
        [id],
      )

      if (cek.rows.length === 0) {
        return res.status(404).json({ message: 'Action tidak ditemukan' })
      }

      if (cek.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({
          message: 'Anda hanya bisa menghapus action milik sendiri',
        })
      }
    }

    const checkResult = await pool.query(`SELECT id FROM action_kontrol WHERE id = $1`, [id])

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Action plan tidak ditemukan',
      })
    }

    const deleteResult = await pool.query(`DELETE FROM action_kontrol WHERE id = $1 RETURNING id`, [
      id,
    ])

    res.json({
      success: true,
      message: 'Action plan berhasil dihapus',
      deletedId: deleteResult.rows[0].id,
    })
  } catch (error) {
    console.error('❌ DELETE ACTION ERROR:', error)
    res.status(500).json({
      message: error.message,
    })
  }
}
