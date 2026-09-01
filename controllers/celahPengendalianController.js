/* eslint-disable prettier/prettier */
const { getPool } = require('../config/db')

/**
 * GET semua risiko untuk dropdown (yang belum closed)
 * DENGAN FILTER BERDASARKAN ROLE
 */
// Backend get risiko treat (Dengan Fitur Pencarian & Infinite Scroll/Pagination)

exports.getRisiko = async (req, res, next) => {
  try {
    const pool = getPool()
    const user = req.user

    let page = parseInt(req.query.page) || 1
    let limit = parseInt(req.query.limit) || 10
    let search = req.query.search || ''
    let strategiFilter = req.query.strategi || ''
    let offset = (page - 1) * limit

    let params = []
    let conditions = []

    if (strategiFilter.toUpperCase() === 'TREAT') {
      conditions.push(`(UPPER(er.strategi) = 'TREAT' OR er.strategi IS NULL)`)
    }

    // Filter RBAC Hak Akses User
    if (user.role === 'USER' || user.role === 'RISK_OWNER') {
      params.push(user.id)
      conditions.push(`ir.created_by_uuid = $${params.length}`)
    }

    // Filter Pencarian kata kunci
    if (search.trim() !== '') {
      params.push(`%${search}%`)
      conditions.push(
        `(ir.nama_resiko ILIKE $${params.length} OR ir.deskripsi ILIKE $${params.length})`,
      )
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // 🎯 PERBAIKAN 2: Pastikan query utama menarik semua data yang diperlukan
    let query = `
      SELECT 
        ir.id as risk_id, 
        ir.nama_resiko, 
        ir.deskripsi, 
        ir.created_by_uuid, 
        er.strategi, 
        ir.status,
        ir.created_at
      FROM identifikasi_resiko ir
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, strategi
        FROM evaluasi_resiko
        WHERE is_active = true 
        ORDER BY risk_id, created_at DESC
      ) er ON er.risk_id = ir.id
      ${whereClause}
      ORDER BY ir.created_at DESC
    `

    // 🎯 PERBAIKAN 3: Tambahkan kolom `strategi` di subquery countQuery agar ${whereClause} tidak error!
    let countQuery = `
      SELECT COUNT(ir.id) as count
      FROM identifikasi_resiko ir
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, strategi 
        FROM evaluasi_resiko 
        WHERE is_active = true
        ORDER BY risk_id, created_at DESC
      ) er ON er.risk_id = ir.id
      ${whereClause}
    `

    const countParams = [...params]

    params.push(limit)
    query += ` LIMIT $${params.length}`

    params.push(offset)
    query += ` OFFSET $${params.length}`

    const [dataResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ])

    const totalRows = parseInt(countResult.rows[0].count)
    const hasMore = offset + dataResult.rows.length < totalRows

    console.log(`✅ Data Unik Ditemukan: ${dataResult.rows.length} dari total ${totalRows}`)

    res.json({
      risiko: dataResult.rows,
      meta: { page, limit, totalRows, hasMore },
    })
  } catch (err) {
    console.error('❌ Error di getRisiko:', err)
    res.status(500).json({ message: 'Gagal memuat risiko', error: err.message })
  }
}

exports.getRisikoStats = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user

    let params = []

    let conditions = [
      "(er.strategi = 'TREAT' OR er.strategi IS NULL)",
      "UPPER(ir.status) IN ('OPEN', 'RE-OPEN')",
    ]

    if (user.role === 'USER' || user.role === 'RISK_OWNER') {
      params.push(user.id)
      conditions.push(`ir.created_by_uuid = $${params.length}`)
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`

    const query = `
      SELECT COUNT(DISTINCT ir.id) as total_treat
      FROM identifikasi_resiko ir
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, strategi 
        FROM evaluasi_resiko 
        WHERE is_active = true
        ORDER BY risk_id, created_at DESC
      ) er ON er.risk_id = ir.id
      ${whereClause}
    `

    const result = await pool.query(query, params)
    const totalTreat = parseInt(result.rows[0].total_treat) || 0

    console.log({ totalTreat })

    res.json({
      totalTreatData: totalTreat,
    })
  } catch (err) {
    console.error('❌ Error di getRisikoStats:', err)
    res.status(500).json({ message: 'Gagal memuat statistik', error: err.message })
  }
}

/**
 * GET kontrol berdasarkan risk_id
 * DENGAN CEK AKSES
 */
exports.getKontrolByRisiko = async (req, res, next) => {
  try {
    const pool = getPool()
    const { risk_id } = req.params
    const user = req.user

    console.log('📝 ===== DEBUG GET KONTROL BY RISIKO =====')
    console.log('📌 risk_id:', risk_id)
    console.log('👤 User:', user?.email, 'ID:', user?.id, 'Role:', user?.role)

    // CEK AKSES UNTUK USER (bukan ADMIN)
    if (user.role === 'USER' || user.role === 'RISK_OWNER') {
      console.log('🔍 Cek akses untuk USER/RISK_OWNER...')

      const cekRisiko = await pool.query(
        'SELECT created_by_uuid, nama_resiko FROM identifikasi_resiko WHERE id = $1',
        [risk_id],
      )

      if (cekRisiko.rows.length === 0) {
        console.log('❌ Risiko tidak ditemukan')
        return res.status(404).json({ message: 'Risiko tidak ditemukan' })
      }

      if (cekRisiko.rows[0].created_by_uuid !== user.id) {
        console.log('❌ AKSES DITOLAK: Bukan pemilik risiko')
        return res.status(403).json({
          message: 'Anda hanya bisa melihat kontrol pada risiko milik sendiri',
        })
      }

      console.log('✅ AKSES DITERIMA: User adalah pemilik risiko')
    } else {
      console.log('🔍 ADMIN/APPROVER: akses ke semua kontrol')
    }

    // Query untuk mengambil data kontrol dasar
    const q = `
      SELECT 
        id, 
        risk_id, 
        nama_kontrol, 
        tipe, 
        deskripsi, 
        created_at, 
        updated_at, 
        created_by_uuid
      FROM kontrol_pengendalian
      WHERE risk_id = $1
      ORDER BY created_at DESC
    `

    console.log('📝 Menjalankan query getKontrol untuk risk_id:', risk_id)
    const { rows } = await pool.query(q, [risk_id])
    console.log('✅ Kontrol ditemukan:', rows.length)

    // Ambil data penilaian terbaru & akumulasi tindakan (action) untuk setiap kontrol
    const kontrolWithEffectiveness = await Promise.all(
      rows.map(async (kontrol) => {
        // 1. Ambil penilaian terbaru (Ubah ke created_at agar sinkron dengan fungsi insert)
        const penilaianQuery = `
          SELECT effectiveness, status
          FROM penilaian_kontrol
          WHERE kontrol_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `

        const penilaianResult = await pool.query(penilaianQuery, [kontrol.id])

        let effectiveness = 0
        let status = 'Belum Dinilai'
        let isCalculated = false // 🎯 Flag baru untuk mengunci tombol di frontend

        if (penilaianResult.rows.length > 0) {
          effectiveness = penilaianResult.rows[0].effectiveness || 0
          status = penilaianResult.rows[0].status || 'Belum Dinilai'
          isCalculated = true // 🎯 Jika record ditemukan, berarti sudah pernah dihitung & disimpan
        }

        // 2. Hitung total action dan action yang sudah closed
        const actionQuery = `
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN status = 'Closed' THEN 1 END) as closed
          FROM action_kontrol
          WHERE kontrol_id = $1
        `

        const actionResult = await pool.query(actionQuery, [kontrol.id])

        return {
          ...kontrol,
          effectiveness: effectiveness,
          status_penilaian: status,
          is_calculated: isCalculated, // 🎯 Dikirim ke frontend
          total_action: parseInt(actionResult.rows[0].total) || 0,
          closed_action: parseInt(actionResult.rows[0].closed) || 0,
        }
      }),
    )

    console.log('✅ Data kontrol dengan penilaian & flag persistent siap')
    res.json(kontrolWithEffectiveness)
  } catch (err) {
    console.error('❌ Error di getKontrolByRisiko:', err)
    res.status(500).json({
      message: 'Gagal memuat kontrol',
      error: err.message,
    })
  }
}

/**
 * GET summary efektivitas dan residual berdasarkan risk_id
 */
exports.getSummary = async (req, res, next) => {
  try {
    const pool = getPool()
    const { risk_id } = req.params

    const currentDate = new Date()
    const currentYear = currentDate.getFullYear()
    const currentMonth = currentDate.getMonth() + 1

    // 1. Hitung rata-rata efektivitas dasar dari status action_kontrol
    const avgQuery = `
      SELECT 
        COALESCE(AVG(
          CASE 
            WHEN a.status = 'Closed' THEN 100
            WHEN a.status = 'On Progress' THEN 50
            WHEN a.status = 'Open' THEN 0
            WHEN a.status = 'Overdue' THEN 0
            ELSE 0
          END
        ), 0) as avg_effectiveness
      FROM kontrol_pengendalian k
      LEFT JOIN action_kontrol a ON a.kontrol_id = k.id
      WHERE k.risk_id = $1
    `
    // ... (1. Jalankan avgQuery seperti biasa) ...
    const avgResult = await pool.query(avgQuery, [risk_id])
    let avgEffectiveness = Number(avgResult.rows[0].avg_effectiveness) || 0

    // 2. Cek Kejadian Risiko pada periode berjalan
    const kejadianQuery = `
      SELECT COUNT(krd.id) as total_kejadian
      FROM kejadian_risiko_detail krd
      JOIN log_risiko_bulanan lrb ON krd.log_bulanan_id = lrb.id
      WHERE krd.risk_id = $1 
        AND lrb.tahun = $2 
        AND lrb.bulan = $3
    `
    const kejadianResult = await pool.query(kejadianQuery, [risk_id, currentYear, currentMonth])
    const totalKejadian = parseInt(kejadianResult.rows[0].total_kejadian) || 0

    // 🌟 PERBAIKAN LOGIKA PENALTI DI SINI:
    if (totalKejadian > 0) {
      // Ambil jumlah total kontrol aktif untuk risiko ini
      const kontrolCountQuery = `SELECT COUNT(*) as total_kontrol FROM kontrol_pengendalian WHERE risk_id = $1`
      const kontrolCountResult = await pool.query(kontrolCountQuery, [risk_id])
      const totalKontrol = parseInt(kontrolCountResult.rows[0].total_kontrol) || 1

      // Hitung beban penalti kotor (misal per kejadian 20%)
      let penaltiKotor = totalKejadian * 20

      // Reduksi penalti: Semakin banyak kontrol yang dibuat, penalti semakin diredam
      // Contoh formula: penalti_neto = penalti_kotor / jumlah_kontrol
      let penaltiNeto = penaltiKotor / totalKontrol

      console.log(`💡 Total Kejadian: ${totalKejadian}, Total Kontrol: ${totalKontrol}`)
      console.log(`📉 Penalti Awal: ${penaltiKotor}%, Menyusut Menjadi: ${penaltiNeto}%`)

      // Kurangi efektivitas dengan penalti yang sudah diredam oleh kontrol baru
      avgEffectiveness = avgEffectiveness - penaltiNeto
      if (avgEffectiveness < 0) avgEffectiveness = 0
    }

    // 3. Ambil nilai INHERENT SCORE & RESIDUAL SCORE (Hasil input manual petugas)
    let inherentScore = null
    let residualScore = null // 🎯 Nilai input manual yang ditunggu frontend
    let isAssessed = false

    const scoresQuery = `
      SELECT 
        MAX(CASE WHEN assessment_type = 'INHERENT' THEN score END) as inherent,
        MAX(CASE WHEN assessment_type = 'RESIDUAL' THEN score END) as residual
      FROM penilaian_resiko
      WHERE risk_id = $1
    `
    const scoresResult = await pool.query(scoresQuery, [risk_id])

    if (scoresResult.rows.length > 0) {
      inherentScore =
        scoresResult.rows[0].inherent !== null ? Number(scoresResult.rows[0].inherent) : null
      residualScore =
        scoresResult.rows[0].residual !== null ? Number(scoresResult.rows[0].residual) : null

      // Dianggap sudah dinilai jika inherent minimal sudah diisi
      if (inherentScore !== null) isAssessed = true
    }

    // 4. Kirimkan semua variabel yang dibutuhkan frontend untuk validasi tombol Close
    res.json({
      avg_effectiveness: avgEffectiveness, // Sudah terpotong penalti jika ada kejadian
      inherent_score: inherentScore,
      residual_score: residualScore, // Nilai nyata hasil input manual petugas (0-25)
      is_assessed: isAssessed,
      total_kejadian_bulan_ini: totalKejadian,
    })
  } catch (err) {
    console.error('❌ Error di getSummary:', err)
    res.status(500).json({ message: 'Gagal memuat summary', error: err.message })
  }
}

/**
 * POST hitung efektivitas kontrol berdasarkan action
 */
exports.hitungEfektivitas = async (req, res, next) => {
  try {
    const pool = getPool()
    const { kontrolId } = req.params

    console.log('📝 Hitung efektivitas untuk kontrolId:', kontrolId)

    // Ambil semua action untuk kontrol ini
    const actionQuery = `
      SELECT status
      FROM action_kontrol
      WHERE kontrol_id = $1
    `

    const actionResult = await pool.query(actionQuery, [kontrolId])
    const actions = actionResult.rows

    // Hitung efektivitas
    const WEIGHTS = {
      Closed: 100,
      'On Progress': 50,
      Open: 0,
      Overdue: 0,
    }

    let totalScore = 0
    actions.forEach((action) => {
      totalScore += WEIGHTS[action.status] || 0
    })

    const effectiveness = actions.length > 0 ? Math.round(totalScore / actions.length) : 0

    res.json({
      message: '✅ Efektivitas berhasil dihitung',
      data: {
        kontrol_id: kontrolId,
        effectiveness: effectiveness,
        total_actions: actions.length,
      },
    })
  } catch (err) {
    console.error('❌ Error di hitungEfektivitas:', err)
    res.status(500).json({
      message: 'Gagal menghitung efektivitas',
      error: err.message,
    })
  }
}

// Backend Controller: gabungan proses hitung & simpan otomatis
exports.hitungDanSimpanEfektivitas = async (req, res, next) => {
  try {
    const pool = getPool()
    const { kontrolId } = req.params
    const user = req.user
    const filter = req.filter

    console.log('📝 Memulai proses hitung & simpan efektivitas untuk kontrolId:', kontrolId)

    // 1. 🔥 SECURITY CHECK: Pastikan kontrol ini milik risiko milik user yang login
    if (filter?.created_by_uuid) {
      const cekKepemilikanQuery = `
        SELECT k.id 
        FROM kontrol_pengendalian k
        JOIN identifikasi_resiko r ON r.id = k.risk_id
        WHERE k.id = $1 AND r.created_by_uuid = $2
      `
      const cekKepemilikan = await pool.query(cekKepemilikanQuery, [
        kontrolId,
        filter.created_by_uuid,
      ])

      if (cekKepemilikan.rows.length === 0) {
        return res.status(403).json({
          message: 'Anda hanya bisa menilai kontrol dari risiko milik Anda sendiri',
        })
      }
    }

    // 2. AMBIL semua action untuk kontrol ini untuk proses kalkulasi
    const actionQuery = `
      SELECT status
      FROM action_kontrol
      WHERE kontrol_id = $1
    `
    const actionResult = await pool.query(actionQuery, [kontrolId])
    const actions = actionResult.rows

    // 3. LOGIKA HITUNG SKOR EFEKTIVITAS
    const WEIGHTS = {
      Closed: 100,
      'On Progress': 50,
      Open: 0,
      Overdue: 0,
    }

    let totalScore = 0
    actions.forEach((action) => {
      totalScore += WEIGHTS[action.status] || 0
    })

    const effectiveness = actions.length > 0 ? Math.round(totalScore / actions.length) : 0

    // 4. 🤖 AUTOMATION STATUS: Tentukan berdasarkan hasil hitung skor internal backend
    let status = 'INEFFECTIVE'
    if (effectiveness >= 80) {
      status = 'EFFECTIVE'
    } else if (effectiveness >= 50) {
      status = 'PARTIAL'
    }

    // 5. INSERT / SIMPAN KE TABEL penilaian_kontrol
    const insertQuery = `
      INSERT INTO penilaian_kontrol 
      (
        kontrol_id, 
        effectiveness, 
        status
      ) 
      VALUES ($1, $2, $3)
      RETURNING *
    `

    const insertResult = await pool.query(insertQuery, [kontrolId, effectiveness, status])

    const getRiskIdQuery = `SELECT risk_id FROM kontrol_pengendalian WHERE id = $1`
    const riskIdResult = await pool.query(getRiskIdQuery, [kontrolId])

    if (riskIdResult.rows.length > 0) {
      const parentRiskId = riskIdResult.rows[0].risk_id
      await pool.query(
        `UPDATE identifikasi_resiko SET fase = 'Pemantauan', updated_at = NOW() WHERE id = $1`,
        [parentRiskId],
      )
      console.log(`✨ Fase risiko induk ${parentRiskId} berhasil diperbarui menjadi 'Pemantauan'`)
    }

    // 6. Kembalikan satu response utuh ke frontend
    res.json({
      message: '✅ Efektivitas berhasil dihitung dan disimpan otomatis',
      data: {
        kontrol_id: kontrolId,
        effectiveness: effectiveness,
        status: status,
        total_actions: actions.length,
        saved_record: insertResult.rows[0],
      },
    })
  } catch (err) {
    console.error('❌ Error di hitungDanSimpanEfektivitas:', err)
    res.status(500).json({
      message: 'Gagal memproses penilaian efektivitas kontrol',
      error: err.message,
    })
  }
}
