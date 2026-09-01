/* eslint-disable prettier/prettier */
const { getPool } = require('../config/db')

exports.getIdentifikasi = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user
    const filter = req.filter

    const { unit_id, kategori_id } = req.query

    let query = `
      SELECT 
        i.*,
        k.name AS kategori_name,
        u.username AS created_by_name
      FROM identifikasi_resiko i
      LEFT JOIN kategori_resiko k ON k.id = i.kategori_id
      LEFT JOIN users u ON i.created_by_uuid = u.id
    `

    let params = []
    let paramCounter = 1
    let conditions = [] // Wadah tunggal untuk semua filter

    // 1. TERAPKAN FILTER (kalau user bukan ADMIN)
    if (filter?.created_by_uuid) {
      conditions.push(`i.created_by_uuid = $${paramCounter}`)
      params.push(filter.created_by_uuid)
      paramCounter++
    }

    // 2. FILTER UNIT (Hanya diproses jika user adalah ADMIN dan query unit_id dikirim)
    if (user?.role === 'ADMIN' && unit_id) {
      conditions.push(`i.created_by_uuid = $${paramCounter}`)
      params.push(unit_id)
      paramCounter++
    }

    // 3. FILTER KATEGORI (Bisa diakses oleh ADMIN maupun USER biasa)
    if (kategori_id) {
      conditions.push(`i.kategori_id = $${paramCounter}`)
      params.push(kategori_id)
      paramCounter++
    }

    // 💡 PERBAIKAN UTAMA: Gabungkan semua filter dengan rapi di sini
    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ')
    }

    query += ` ORDER BY i.created_at DESC`

    console.log('📝 Query Terpilih:', query)
    console.log('📦 Params:', params)

    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (error) {
    console.error('❌ GET IDENTIFIKASI ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

exports.getIdentifikasiById = async (req, res) => {
  try {
    const pool = getPool()
    const { id } = req.params
    const user = req.user

    // Menambahkan JOIN ke evaluasi_risiko dan analisis_risiko
    const result = await pool.query(
      `
      SELECT 
        i.*,
        k.name AS kategori_name,
        u.username AS pemilik_risiko,
        er.strategi,
        pr.score
      FROM identifikasi_resiko i
      LEFT JOIN kategori_resiko k ON k.id = i.kategori_id
      LEFT JOIN users u ON i.created_by_uuid = u.id
      LEFT JOIN evaluasi_resiko er ON er.risk_id = i.id
      LEFT JOIN penilaian_resiko pr ON pr.risk_id = i.id
      WHERE i.id = $1
    `,
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Risiko tidak ditemukan' })
    }

    const risiko = result.rows[0]

    // 🔐 CEK AKSES: ADMIN bisa semua, USER hanya boleh lihat miliknya
    if (user.role !== 'ADMIN' && risiko.created_by_uuid !== user.id) {
      return res.status(403).json({
        message: 'Anda tidak memiliki akses ke data ini',
        code: 'FORBIDDEN_ACCESS',
      })
    }

    res.json(risiko)
  } catch (error) {
    console.error('❌ GET IDENTIFIKASI BY ID ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

// Backend Controller: Identifikasi Risiko (getRisikoAktifWithMitigasi)
// Backend Controller: getRisikoAktifWithMitigasi (All Columns Aggregation)
exports.getRisikoAktifWithMitigasi = async (req, res) => {
  try {
    const pool = getPool()
    const { status } = req.query

    const user = req.user
    const filter = req.filter

    console.log(`📋 [GET] Menyusun semua data mitigasi risiko aktif untuk Role: ${user?.role}`)

    let params = []
    let conditions = []

    if (status === 'history') {
      conditions.push(`i.status IN ('Closed', 'CLOSED', 'DITUTUP')`)
    } else {
      // Default jika tidak diisi atau bernilai 'active'
      conditions.push(`i.status NOT IN ('Closed', 'CLOSED', 'DITUTUP')`)
    }

    conditions.push(`UPPER(er.strategi) = 'TREAT'`)
    conditions.push(`p.assessment_type = 'INHERENT'`)

    if (filter?.created_by_uuid) {
      params.push(filter.created_by_uuid)
      conditions.push(`i.created_by_uuid = $${params.length}`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const query = `
      SELECT 
        i.*,
        p.likelihood,
        p.impact,
        p.score,
        k_cat.name AS kategori_name,
        u.username AS pemilik_risiko,
        er.strategi,
        COALESCE(
          (
            SELECT EXISTS (
              SELECT 1 
              FROM action_kontrol ak
              JOIN kontrol_pengendalian kp2 ON kp2.id = ak.kontrol_id
              WHERE kp2.risk_id = i.id 
                AND ak.status NOT IN ('Closed') 
                AND ak.target_date < CURRENT_DATE
            )
          ), false
        ) AS has_overdue_action,
        COALESCE(
          (
            SELECT json_agg(
              (to_jsonb(kp.*) || jsonb_build_object(
                'actions', COALESCE(
                  (
                    SELECT json_agg(to_jsonb(ak.*) ORDER BY ak.created_at DESC)
                    FROM action_kontrol ak
                    WHERE ak.kontrol_id = kp.id
                  ), '[]'::json
                )
              )) ORDER BY kp.created_at DESC
            )
            FROM kontrol_pengendalian kp
            WHERE kp.risk_id = i.id
          ), '[]'::json
        ) AS list_kontrol
      FROM identifikasi_resiko i
      LEFT JOIN kategori_resiko k_cat ON k_cat.id = i.kategori_id
      LEFT JOIN penilaian_resiko p ON p.risk_id = i.id
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, strategi
        FROM evaluasi_resiko
        WHERE is_active = true 
        ORDER BY risk_id, created_at DESC
      ) er ON er.risk_id = i.id
      LEFT JOIN users u ON i.created_by_uuid = u.id
      ${whereClause}
      ORDER BY i.created_at DESC
    `

    console.log('编 Executing All-Columns Mitigasi Aggregation Query...')
    const result = await pool.query(query, params)

    console.log(`✅ Berhasil menyusun ${result.rows.length} data mitigasi lengkap.`)
    res.json(result.rows)
  } catch (error) {
    console.error('❌ GET RISIKO MITIGASI ERROR:', error)
    res.status(500).json({
      message: 'Gagal memuat data struktur mitigasi risiko.',
      error: error.message,
    })
  }
}

// Backend: Mendapatkan statistik perlakuan risiko (Mitigasi) & Alert Overdue
exports.getStatsRisikoWithMitigasi = async (req, res) => {
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

    conditions.push(`UPPER(er.strategi) = 'TREAT'`)

    let whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    console.log(`📊 Mengambil statistik perlakuan risiko untuk Role: ${user?.role || 'UNKNOWN'}`)

    const statsQuery = `
      SELECT 
        COUNT(DISTINCT i.id) AS total_risks,
        COUNT(DISTINCT CASE WHEN i.status NOT IN ('Closed', 'CLOSED', 'DITUTUP') THEN i.id END) AS active_risks,
        COUNT(DISTINCT CASE WHEN i.status IN ('Closed', 'CLOSED', 'DITUTUP') THEN i.id END) AS closed_risks,
        COUNT(DISTINCT kp.id) AS total_kontrol,
        COUNT(DISTINCT ak.id) AS total_action,
        COUNT(DISTINCT CASE WHEN ak.status IN ('Closed', 'CLOSED') THEN ak.id END) AS done_actions,
        COUNT(DISTINCT CASE WHEN ak.status NOT IN ('Closed', 'CLOSED') AND ak.target_date < NOW() THEN ak.id END) AS overdue_actions
      FROM identifikasi_resiko i
      LEFT JOIN kontrol_pengendalian kp ON kp.risk_id = i.id
      LEFT JOIN action_kontrol ak ON ak.kontrol_id = kp.id
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, strategi
        FROM evaluasi_resiko
        WHERE is_active = true 
        ORDER BY risk_id, created_at DESC
      ) er ON er.risk_id = i.id
      ${whereClause}
    `

    const result = await pool.query(statsQuery, params)
    const stats = result.rows[0]

    res.json({
      totalRisks: parseInt(stats.total_risks || 0),
      totalKontrol: parseInt(stats.total_kontrol || 0),
      totalAction: parseInt(stats.total_action || 0),
      doneActions: parseInt(stats.done_actions || 0),
      overdueActions: parseInt(stats.overdue_actions || 0),
      activeRisks: parseInt(stats.active_risks || 0),
      closedRisks: parseInt(stats.closed_risks || 0),
    })
  } catch (error) {
    console.error('❌ GET STATS PERLAKUAN ERROR:', error)
    res.status(500).json({
      message: 'Gagal menghitung statistik perlakuan risiko.',
      error: error.message,
    })
  }
}

// Backend: Statistik dinamis berdasarkan hak akses Role (Admin vs User biasa)
exports.getStatsRisiko = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user
    const filter = req.filter // Filter bawaan middleware (misal: pembatasan UUID user biasa)

    let params = []
    let paramCounter = 1
    let conditions = []

    // 1. Batasi data hanya jika user biasa (ADMIN tidak masuk ke kondisi ini)
    if (filter?.created_by_uuid) {
      conditions.push(`created_by_uuid = $${paramCounter}`)
      params.push(filter.created_by_uuid)
      paramCounter++
    }

    // Jika user biasa, whereClause akan berisi WHERE created_by_uuid = $1
    // Jika admin, whereClause akan kosong (menghitung seluruh data)
    let whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    console.log(`📋 Mengambil statistik risiko untuk Role: ${user?.role || 'UNKNOWN'}`)

    // Query Agregasi: Menghitung total data spesifik sesuai hak akses user
    const statsQuery = `
      SELECT 
        COUNT(*) AS total_risiko,
        COUNT(CASE WHEN status IN ('Open', 'In Progress') THEN 1 END) AS risiko_aktif,
        COUNT(CASE WHEN status = 'Closed' THEN 1 END) AS risiko_closed,
        (SELECT COUNT(*) FROM kategori_resiko) AS total_kategori
      FROM identifikasi_resiko
      ${whereClause}
    `

    const result = await pool.query(statsQuery, params)
    const stats = result.rows[0]

    console.log('✅ Statistik berhasil dihitung:', stats)

    // Mengembalikan response data angka utuh
    res.json({
      totalRisiko: parseInt(stats.total_risiko || 0),
      risikoAktif: parseInt(stats.risiko_aktif || 0),
      risikoClosed: parseInt(stats.risiko_closed || 0),
      totalKategori: parseInt(stats.total_kategori || 0),
    })
  } catch (error) {
    console.error('❌ GET STATS ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

exports.createIdentifikasi = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user

    const {
      nama_resiko,
      kategori_id,
      deskripsi,
      root_cause,
      consequences,
      existing_controls,
      konteks_id,
    } = req.body

    if (!nama_resiko) {
      return res.status(400).json({ message: 'Nama risiko wajib diisi' })
    }

    console.log('📝 Create risiko oleh user:', user.id, user.email)

    const result = await pool.query(
      `INSERT INTO identifikasi_resiko
      (
        nama_resiko,
        kategori_id,
        deskripsi,
        root_cause,
        consequences,
        existing_controls,
        konteks_id,
        created_by_uuid,
        created_at,
        updated_at,
        fase,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),'Identifikasi','Open')
      RETURNING *`,
      [
        nama_resiko,
        kategori_id || null,
        deskripsi || '',
        root_cause || '',
        consequences || '',
        existing_controls || '',
        konteks_id || null,
        user.id,
      ],
    )

    res.status(201).json({
      message: 'Identifikasi risiko berhasil disimpan',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ ERROR INSERT IDENTIFIKASI:', error)
    res.status(500).json({
      message: error.message,
      code: error.code,
      detail: error.detail,
    })
  }
}

exports.updateIdentifikasi = async (req, res) => {
  try {
    const pool = getPool()
    console.log('=== UPDATE IDENTIFIKASI REQUEST ===')
    console.log('ID:', req.params.id)
    console.log('Body:', req.body)

    const { id } = req.params
    const user = req.user

    const {
      nama_resiko,
      kategori_id,
      deskripsi,
      root_cause,
      consequences,
      existing_controls,
      konteks_id,
      status,
      fase,
      close_reason,
    } = req.body

    // 1. CEK APAKAH DATA ADA DAN SIAPA PEMILIKNYA
    const checkResult = await pool.query(
      'SELECT id, nama_resiko, status, created_by_uuid FROM identifikasi_resiko WHERE id = $1',
      [id],
    )

    if (checkResult.rows.length === 0) {
      console.log('Data tidak ditemukan')
      return res.status(404).json({
        message: 'Risiko tidak ditemukan',
        code: 'RISK_NOT_FOUND',
      })
    }

    const existingRisk = checkResult.rows[0]
    console.log('Data ditemukan:', existingRisk)

    // 🔐 CEK AKSES: ADMIN bisa semua, USER hanya boleh edit miliknya
    if (user.role !== 'ADMIN' && existingRisk.created_by_uuid !== user.id) {
      console.log('❌ Blocked: User mencoba edit data orang lain')
      return res.status(403).json({
        message: 'Anda hanya bisa mengedit risiko milik sendiri',
        code: 'FORBIDDEN_EDIT',
        details: 'Anda tidak memiliki akses untuk mengedit data ini',
      })
    }

    // 2. VALIDASI: STATUS CLOSED TIDAK BISA DIEDIT
    const isTryingToEditContent =
      nama_resiko !== undefined ||
      kategori_id !== undefined ||
      deskripsi !== undefined ||
      root_cause !== undefined ||
      consequences !== undefined ||
      existing_controls !== undefined ||
      konteks_id !== undefined ||
      fase !== undefined ||
      close_reason !== undefined

    if (existingRisk.status === 'Closed' && isTryingToEditContent) {
      console.log('❌ Blocked: Trying to edit closed risk content')
      return res.status(400).json({
        message: `Risiko "${existingRisk.nama_resiko}" tidak dapat diedit karena status sudah CLOSED`,
        code: 'CLOSED_EDIT_BLOCKED',
        details: 'Risiko yang sudah ditutup hanya dapat diubah statusnya',
        allowed_actions: ['Mengubah status'],
        blocked_actions: ['Mengubah konten risiko'],
      })
    }

    // 3. BUILD UPDATE QUERY DINAMIS
    const updateFields = []
    const values = []
    let paramIndex = 1

    if (nama_resiko !== undefined) {
      updateFields.push(`nama_resiko = $${paramIndex}`)
      values.push(nama_resiko || '')
      paramIndex++
    }

    if (kategori_id !== undefined) {
      updateFields.push(`kategori_id = $${paramIndex}`)
      values.push(kategori_id || null)
      paramIndex++
    }

    if (deskripsi !== undefined) {
      updateFields.push(`deskripsi = $${paramIndex}`)
      values.push(deskripsi || '')
      paramIndex++
    }

    if (root_cause !== undefined) {
      updateFields.push(`root_cause = $${paramIndex}`)
      values.push(root_cause || '')
      paramIndex++
    }

    if (consequences !== undefined) {
      updateFields.push(`consequences = $${paramIndex}`)
      values.push(consequences || '')
      paramIndex++
    }

    if (existing_controls !== undefined) {
      updateFields.push(`existing_controls = $${paramIndex}`)
      values.push(existing_controls || '')
      paramIndex++
    }

    if (konteks_id !== undefined) {
      updateFields.push(`konteks_id = $${paramIndex}`)
      values.push(konteks_id || null)
      paramIndex++
    }

    if (fase !== undefined) {
      updateFields.push(`fase = $${paramIndex}`)
      values.push(fase || 'Identifikasi')
      paramIndex++
    }

    if (status !== undefined) {
      updateFields.push(`status = $${paramIndex}`)
      values.push(status || 'Open')
      paramIndex++

      if (status === 'Closed') {
        updateFields.push(`closed_at = NOW()`)
        if (close_reason !== undefined) {
          updateFields.push(`close_reason = $${paramIndex}`)
          values.push(close_reason || null)
          paramIndex++
        }
      } else if (existingRisk.status === 'Closed') {
        updateFields.push(`closed_at = NULL`)
        updateFields.push(`close_reason = NULL`)
      }
    } else if (close_reason !== undefined) {
      updateFields.push(`close_reason = $${paramIndex}`)
      values.push(close_reason || null)
      paramIndex++
    }

    updateFields.push(`updated_at = NOW()`)

    if (updateFields.length === 1) {
      console.log('Tidak ada perubahan data')
      return res.status(400).json({
        message: 'Tidak ada data yang diupdate',
        code: 'NO_CHANGES',
      })
    }

    updateFields.push(`id = $${paramIndex}`)
    values.push(id)

    const query = `
      UPDATE identifikasi_resiko 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `

    console.log('Update Query:', query)
    console.log('Values:', values)

    const result = await pool.query(query, values)

    if (result.rows.length === 0) {
      throw new Error('Update gagal, tidak ada data yang berubah')
    }

    const updatedRisk = result.rows[0]
    console.log('Update berhasil:', updatedRisk)

    res.json({
      success: true,
      message: 'Risiko berhasil diperbarui',
      data: updatedRisk,
      changes: {
        status_changed: existingRisk.status !== updatedRisk.status,
        old_status: existingRisk.status,
        new_status: updatedRisk.status,
      },
    })
  } catch (error) {
    console.error('=== UPDATE IDENTIFIKASI ERROR ===', error)

    if (error.code === '23503') {
      return res.status(400).json({
        message: 'Data referensi tidak valid',
        code: 'FOREIGN_KEY_ERROR',
        detail: error.detail,
      })
    }

    if (error.code === '23505') {
      return res.status(400).json({
        message: 'Data duplikat',
        code: 'DUPLICATE_DATA',
        detail: error.detail,
      })
    }

    res.status(500).json({
      message: 'Terjadi kesalahan saat mengupdate risiko',
      error: error.message,
      code: error.code || 'INTERNAL_ERROR',
    })
  }
}

exports.deleteIdentifikasi = async (req, res) => {
  try {
    const pool = getPool()
    const { id } = req.params
    const user = req.user

    const checkResult = await pool.query(
      'SELECT id, nama_resiko, status, created_by_uuid FROM identifikasi_resiko WHERE id = $1',
      [id],
    )

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Risiko tidak ditemukan',
        code: 'NOT_FOUND',
      })
    }

    const risiko = checkResult.rows[0]

    if (user.role !== 'ADMIN' && risiko.created_by_uuid !== user.id) {
      return res.status(403).json({
        message: 'Anda hanya bisa menghapus risiko milik sendiri',
        code: 'FORBIDDEN_DELETE',
      })
    }

    if (risiko.status === 'Closed') {
      return res.status(400).json({
        message: `Risiko "${risiko.nama_resiko}" tidak dapat dihapus karena status sudah CLOSED`,
        code: 'CLOSED_RISK',
      })
    }

    await pool.query('DELETE FROM identifikasi_resiko WHERE id = $1', [id])

    res.json({
      success: true,
      message: 'Risiko berhasil dihapus',
      data: { id, nama_resiko: risiko.nama_resiko },
    })
  } catch (error) {
    console.error('❌ DELETE IDENTIFIKASI ERROR:', error)
    res.status(500).json({
      message: error.message,
      code: error.code,
    })
  }
}
