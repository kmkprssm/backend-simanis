const { getPool } = require('../config/db')

exports.getKejadianRisiko = async (req, res) => {
  try {
    const pool = getPool()
    const filter = req.filter
    const user = req.user

    const tahun = parseInt(req.query.tahun) || new Date().getFullYear()
    const isClientUser = !!filter?.created_by_uuid
    const userIdValue = filter?.created_by_uuid || user?.id

    console.log(`🔍 Fetching Log Risiko untuk Role: ${user?.role} di Tahun: ${tahun}`)

    // 1. ✅ AMBIL LOG MASTER (Bersih & Terfilter per User/Unit jika bukan ADMIN)
    let logQuery = `
      SELECT l.*, u.username AS pelapor
      FROM log_risiko_bulanan l
      LEFT JOIN users u ON l.reported_by = u.id
      WHERE l.tahun = $1
    `
    let logParams = [tahun]

    if (isClientUser) {
      logQuery += ` AND l.reported_by = $2`
      logParams.push(userIdValue)
    }

    const logResult = await pool.query(logQuery, logParams)
    const listLogMaster = logResult.rows

    // 2. ✅ AMBIL DETAIL KEJADIAN RISIKO
    let detailQuery = `
      SELECT
        kd.id AS kejadian_id,
        kd.log_bulanan_id,
        kd.tanggal_kejadian,
        kd.sebab_saat_ini,
        kd.dampak_riil,
        kd.created_at AS kejadian_created_at,
        kd.tindakan_lanjutan,
        kd.is_nihil,             
        kd.keterangan_nihil,
        l.bulan,
        ir.id AS risk_id,
        ir.nama_resiko,
        ir.deskripsi,
        ir.status AS status_utama_risiko,
        ir.created_by_uuid,
        k.name AS kategori_name,
        an.score AS skor_risiko,
        an.likelihood,
        an.impact,
        er.strategi,
        er.prioritas
      FROM kejadian_risiko_detail kd
      JOIN log_risiko_bulanan l ON kd.log_bulanan_id = l.id
      JOIN identifikasi_resiko ir ON kd.risk_id = ir.id
      LEFT JOIN kategori_resiko k ON k.id = ir.kategori_id
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) id, risk_id, score, likelihood, impact
        FROM penilaian_resiko
        ORDER BY risk_id, created_at DESC
      ) an ON an.risk_id = ir.id
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, strategi, prioritas
        FROM evaluasi_resiko
        WHERE is_active = true
        ORDER BY risk_id, created_at DESC
      ) er ON er.risk_id = ir.id
      WHERE l.tahun = $1
    `
    let detailParams = [tahun]

    if (isClientUser) {
      detailQuery += ` AND ir.created_by_uuid = $2`
      detailParams.push(userIdValue)
    }

    detailQuery += ` ORDER BY kd.tanggal_kejadian DESC`

    const detailResult = await pool.query(detailQuery, detailParams)
    const listKejadianDetail = detailResult.rows

    // 3. Inisialisasi struktur data 12 bulan (Default Belum Diisi)
    const dataTahunan = {}
    for (let m = 1; m <= 12; m++) {
      dataTahunan[m] = {
        log_master: {
          tahun: tahun,
          bulan: m,
          status_laporan: 'BELUM_DIISI',
          reported_by: null,
          reported_at: null,
          pelapor: null,
        },
        jumlah_kejadian: 0,
        detail: [],
      }
    }

    // 4. Petakan log master dari DB
    listLogMaster.forEach((log) => {
      const b = log.bulan
      if (dataTahunan[b]) {
        dataTahunan[b].log_master = {
          id: log.id,
          tahun: log.tahun,
          bulan: log.bulan,
          status_laporan: log.status_laporan,
          reported_by: log.reported_by,
          reported_at: log.reported_at,
          pelapor: log.pelapor,
        }
      }
    })

    // 5. Petakan detail kejadian milik user
    listKejadianDetail.forEach((kejadian) => {
      const b = kejadian.bulan
      if (dataTahunan[b]) {
        const { bulan, ...cleanDetail } = kejadian
        dataTahunan[b].detail.push(cleanDetail)
        dataTahunan[b].jumlah_kejadian = dataTahunan[b].detail.filter((d) => !d.is_nihil).length
      }
    })

    // 6. 🌟 KODE LAMA BERISI MANIPULASI ARRAY YANG RUMIT SEKARANG DIAPUS TOTAL 🌟
    // Karena query di atas sudah mengisolasi data per user secara murni dari database.

    res.json({
      [tahun]: dataTahunan,
    })
  } catch (error) {
    console.error('❌ GET KEJADIAN RISIKO TAHUNAN ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

// exports.getKejadianRisiko = async (req, res) => {
//   try {
//     const pool = getPool()
//     const filter = req.filter
//     const user = req.user

//     const tahun = parseInt(req.query.tahun) || new Date().getFullYear()
//     const isClientUser = !!filter?.created_by_uuid
//     const userIdValue = filter?.created_by_uuid || user?.id

//     let logQuery = `
//       SELECT l.*, u.username AS pelapor
//       FROM log_risiko_bulanan l
//       LEFT JOIN users u ON l.reported_by = u.id
//       WHERE l.tahun = $1
//     `
//     let logParams = [tahun]
//     if (isClientUser) {
//       logQuery += ` AND l.reported_by = $2`
//       logParams.push(userIdValue)
//     }

//     const logResult = await pool.query(logQuery, logParams)
//     const listLogMaster = logResult.rows

//     let detailQuery = `
//       SELECT
//         kd.id AS kejadian_id,
//         kd.log_bulanan_id,
//         kd.tanggal_kejadian,
//         kd.sebab_saat_ini,
//         kd.dampak_riil,
//         kd.tindakan_lanjutan,
//         kd.is_nihil,             -- 🌟 Ditambahkan
//         kd.keterangan_nihil,     -- 🌟 Ditambahkan
//         kd.created_at AS kejadian_created_at,
//         l.bulan,
//         ir.id AS risk_id,
//         ir.nama_resiko,
//         ir.deskripsi,
//         ir.status AS status_utama_risiko,
//         ir.created_by_uuid,
//         k.name AS kategori_name,
//         an.score AS skor_risiko,
//         an.likelihood,
//         an.impact,
//         er.strategi,
//         er.prioritas
//       FROM kejadian_risiko_detail kd
//       JOIN log_risiko_bulanan l ON kd.log_bulanan_id = l.id
//       JOIN identifikasi_resiko ir ON kd.risk_id = ir.id
//       LEFT JOIN kategori_resiko k ON k.id = ir.kategori_id
//       LEFT JOIN (
//         SELECT DISTINCT ON (risk_id) id, risk_id, score, likelihood, impact
//         FROM penilaian_resiko
//         ORDER BY risk_id, created_at DESC
//       ) an ON an.risk_id = ir.id
//       LEFT JOIN (
//         SELECT DISTINCT ON (risk_id) risk_id, strategi, prioritas
//         FROM evaluasi_resiko
//         WHERE is_active = true
//         ORDER BY risk_id, created_at DESC
//       ) er ON er.risk_id = ir.id
//       WHERE l.tahun = $1
//     `
//     let detailParams = [tahun]
//     if (isClientUser) {
//       detailQuery += ` AND ir.created_by_uuid = $2`
//       detailParams.push(userIdValue)
//     }

//     detailQuery += ` ORDER BY kd.tanggal_kejadian DESC`
//     const detailResult = await pool.query(detailQuery, detailParams)

//     const dataTahunan = {}
//     for (let m = 1; m <= 12; m++) {
//       dataTahunan[m] = {
//         log_master: {
//           tahun,
//           bulan: m,
//           status_laporan: 'BELUM_DIISI',
//           reported_by: null,
//           reported_at: null,
//           pelapor: null,
//         },
//         jumlah_kejadian: 0,
//         detail: [],
//       }
//     }

//     listLogMaster.forEach((log) => {
//       const b = log.bulan
//       if (dataTahunan[b]) {
//         dataTahunan[b].log_master = {
//           id: log.id,
//           tahun: log.tahun,
//           bulan: log.bulan,
//           status_laporan: log.status_laporan,
//           reported_by: log.reported_by,
//           reported_at: log.reported_at,
//           pelapor: log.pelapor,
//         }
//       }
//     })

//     listKejadianDetail.forEach((kejadian) => {
//       const b = kejadian.bulan
//       if (dataTahunan[b]) {
//         const { bulan, ...cleanDetail } = kejadian
//         dataTahunan[b].detail.push(cleanDetail)
//         // Jumlah kejadian riil hanya yang is_nihil = false
//         dataTahunan[b].jumlah_kejadian = dataTahunan[b].detail.filter((d) => !d.is_nihil).length
//       }
//     })

//     res.json({ [tahun]: dataTahunan })
//   } catch (error) {
//     console.error('❌ GET KEJADIAN RISIKO ERROR:', error)
//     res.status(500).json({ message: error.message })
//   }
// }

exports.getKejadianRisikoByRiskId = async (req, res) => {
  try {
    const pool = getPool()
    const { risk_id } = req.params

    // Default ke bulan dan tahun berjalan saat ini jika tidak dikirim dari FE
    const tahun = parseInt(req.query.tahun) || new Date().getFullYear()
    // const bulan = parseInt(req.query.bulan) || new Date().getMonth() + 1

    console.log(`🔍 Fetching Insiden Riil untuk Risk ID: ${risk_id} pada ${tahun}`)

    const query = `
      SELECT 
        kd.id AS kejadian_id,
        kd.tanggal_kejadian,
        kd.sebab_saat_ini,
        kd.dampak_riil,
        kd.created_at,
        kd.tindakan_lanjutan,
        kd.is_nihil,             
        kd.keterangan_nihil,     
        l.bulan,
        l.status_laporan,
        u.username AS pelapor
      FROM kejadian_risiko_detail kd
      JOIN log_risiko_bulanan l ON kd.log_bulanan_id = l.id
      LEFT JOIN users u ON l.reported_by = u.id
      WHERE kd.risk_id = $1 
        AND l.tahun = $2 
      ORDER BY kd.tanggal_kejadian DESC
    `

    const result = await pool.query(query, [risk_id, tahun])

    res.json({
      risk_id,
      tahun,
      jumlah_kejadian: result.rows.length,
      detail: result.rows,
    })
  } catch (error) {
    console.error('❌ GET KEJADIAN RISIKO BY RISK ID ERROR:', error)
    res.status(500).json({ message: 'Gagal memuat riwayat kejadian risiko', error: error.message })
  }
}

// exports.createKejadianRisiko = async (req, res) => {
//   const pool = getPool()

//   try {
//     await pool.query('BEGIN')

//     const user = req.user
//     const { tahun, bulan, status_laporan, detail_kejadian } = req.body

//     if (!tahun || !bulan || !status_laporan) {
//       return res.status(400).json({ message: 'Tahun, bulan, dan status laporan wajib diisi' })
//     }

//     const upsertLogQuery = `
//       INSERT INTO log_risiko_bulanan (tahun, bulan, status_laporan, reported_by, reported_at)
//       VALUES ($1, $2, $3, $4, NOW())
//       ON CONFLICT (tahun, bulan)
//       DO UPDATE SET status_laporan = EXCLUDED.status_laporan, reported_by = EXCLUDED.reported_by, reported_at = NOW()
//       RETURNING *
//     `
//     const logResult = await pool.query(upsertLogQuery, [tahun, bulan, status_laporan, user.id])
//     const logMaster = logResult.rows[0]

//     if (status_laporan === 'NIHIL') {
//       await pool.query(`DELETE FROM kejadian_risiko_detail WHERE log_bulanan_id = $1`, [
//         logMaster.id,
//       ])
//       await pool.query('COMMIT')
//       return res.status(201).json({
//         message: 'Laporan bulanan berhasil disimpan sebagai NIHIL',
//         log_master: logMaster,
//         data: [],
//       })
//     }

//     if (status_laporan === 'TERJADI_RISIKO') {
//       if (!detail_kejadian || !detail_kejadian.risk_id || !detail_kejadian.tanggal_kejadian) {
//         await pool.query('ROLLBACK')
//         return res.status(400).json({
//           message: 'Detail kejadian (risk_id dan tanggal) wajib diisi',
//         })
//       }

//       const { risk_id, tanggal_kejadian, sebab_saat_ini, dampak_riil, tindakan_lanjutan } =
//         detail_kejadian

//       const cekRisiko = await pool.query(`SELECT status FROM identifikasi_resiko WHERE id = $1`, [
//         risk_id,
//       ])
//       if (cekRisiko.rows.length === 0) {
//         await pool.query('ROLLBACK')
//         return res.status(404).json({ message: 'Data Identifikasi Risiko tidak ditemukan' })
//       }

//       const statusSaatIni = cekRisiko.rows[0].status

//       const insertDetailQuery = `
//         INSERT INTO kejadian_risiko_detail (log_bulanan_id, risk_id, tanggal_kejadian, sebab_saat_ini, dampak_riil, tindakan_lanjutan)
//         VALUES ($1, $2, $3, $4, $5, $6)
//         RETURNING *
//       `
//       const detailResult = await pool.query(insertDetailQuery, [
//         logMaster.id,
//         risk_id,
//         tanggal_kejadian,
//         sebab_saat_ini,
//         dampak_riil,
//         tindakan_lanjutan,
//       ])

//       await pool.query(
//         `UPDATE identifikasi_resiko SET fase = 'Pengendalian', updated_at = NOW() WHERE id = $1`,
//         [risk_id],
//       )

//       if (statusSaatIni.toUpperCase() === 'CLOSED') {
//         console.log(`🔄 Risiko ${risk_id} berstatus CLOSE. Otomatis mengubah menjadi Re-open.`)
//         await pool.query(`UPDATE identifikasi_resiko SET status = 'Re-open' WHERE id = $1`, [
//           risk_id,
//         ])
//       }

//       await pool.query('COMMIT')

//       return res.status(201).json({
//         message:
//           'Data kejadian risiko berhasil dicatat dan status risiko diperbarui jika sebelumnya ditutup.',
//         log_master: logMaster,
//         data: detailResult.rows[0],
//       })
//     }
//   } catch (error) {
//     await pool.query('ROLLBACK')
//     console.error('❌ CREATE KEJADIAN RISIKO ERROR:', error)
//     res.status(500).json({ message: error.message })
//   }
// }

exports.createKejadianRisiko = async (req, res) => {
  const pool = getPool()

  try {
    await pool.query('BEGIN')

    const user = req.user
    const { tahun, bulan, status_laporan, list_detail_nihil, detail_kejadian } = req.body

    if (!tahun || !bulan || !status_laporan) {
      return res.status(400).json({ message: 'Tahun, bulan, dan status laporan wajib diisi' })
    }

    // 1. Ambil status laporan lama jika sudah ada untuk bulan tersebut
    const cekLogExisting = await pool.query(
      `SELECT id, status_laporan FROM log_risiko_bulanan WHERE tahun = $1 AND bulan = $2 AND reported_by = $3`,
      [tahun, bulan, user.id],
    )

    let finalStatusLaporan = status_laporan

    // Jika sebelumnya sudah ada laporan TERJADI_RISIKO, jangan turunkan kasta menjadi NIHIL secara tidak sengaja
    if (cekLogExisting.rows.length > 0) {
      const currentStatusDb = cekLogExisting.rows[0].status_laporan
      if (currentStatusDb === 'TERJADI_RISIKO' && status_laporan === 'NIHIL') {
        finalStatusLaporan = 'TERJADI_RISIKO'
      }
    }

    // 2. Upsert Log Bulanan dengan status yang akurat
    const upsertLogQuery = `
      INSERT INTO log_risiko_bulanan (tahun, bulan, status_laporan, reported_by, reported_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (tahun, bulan, reported_by) 
      DO UPDATE SET status_laporan = EXCLUDED.status_laporan, reported_at = NOW()
      RETURNING *
    `
    const logResult = await pool.query(upsertLogQuery, [tahun, bulan, finalStatusLaporan, user.id])
    const logMaster = logResult.rows[0]

    // 🟢 SKENARIO 1: JIKA STATUS LAPORAN adalah NIHIL
    if (status_laporan === 'NIHIL') {
      if (!list_detail_nihil) {
        await pool.query('ROLLBACK')
        return res
          .status(400)
          .json({ message: 'Daftar konfirmasi alasan nihil wajib dilampirkan.' })
      }

      const { risk_id, keterangan_nihil } = list_detail_nihil

      // Pastikan tidak menduplikasi baris nihil untuk risk_id yang sama di bulan yang sama
      await pool.query(
        `DELETE FROM kejadian_risiko_detail WHERE log_bulanan_id = $1 AND risk_id = $2`,
        [logMaster.id, risk_id],
      )

      const insertNihilQuery = `
        INSERT INTO kejadian_risiko_detail (
          log_bulanan_id, risk_id, is_nihil, keterangan_nihil, tanggal_kejadian,
          sebab_saat_ini, dampak_riil, tindakan_lanjutan
        )
        VALUES ($1, $2, true, $3, NOW(), '', '', '')
        RETURNING *
      `
      const resDetail = await pool.query(insertNihilQuery, [
        logMaster.id,
        risk_id,
        keterangan_nihil || '',
      ])

      await pool.query('COMMIT')
      return res.status(201).json({
        message: 'Laporan bulanan berhasil disimpan sebagai NIHIL per risiko.',
        log_master: logMaster,
        data: resDetail.rows[0],
      })
    }

    // 🔴 SKENARIO 2: JIKA STATUS LAPORAN adalah TERJADI_RISIKO
    if (status_laporan === 'TERJADI_RISIKO') {
      if (!detail_kejadian || !detail_kejadian.risk_id || !detail_kejadian.tanggal_kejadian) {
        await pool.query('ROLLBACK')
        return res
          .status(400)
          .json({ message: 'Detail kejadian (risk_id dan tanggal) wajib diisi' })
      }

      const { risk_id, tanggal_kejadian, sebab_saat_ini, dampak_riil, tindakan_lanjutan } =
        detail_kejadian

      const cekRisiko = await pool.query(`SELECT status FROM identifikasi_resiko WHERE id = $1`, [
        risk_id,
      ])
      if (cekRisiko.rows.length === 0) {
        await pool.query('ROLLBACK')
        return res.status(404).json({ message: 'Data Identifikasi Risiko tidak ditemukan' })
      }

      const statusSaatIni = cekRisiko.rows[0].status

      // Hapus data nihil khusus untuk risk_id ini saja karena sekarang terbukti ada insiden riil
      await pool.query(
        `DELETE FROM kejadian_risiko_detail WHERE log_bulanan_id = $1 AND risk_id = $2 AND is_nihil = true`,
        [logMaster.id, risk_id],
      )

      const insertDetailQuery = `
        INSERT INTO kejadian_risiko_detail (log_bulanan_id, risk_id, tanggal_kejadian, sebab_saat_ini, dampak_riil, tindakan_lanjutan, is_nihil)
        VALUES ($1, $2, $3, $4, $5, $6, false)
        RETURNING *
      `
      const detailResult = await pool.query(insertDetailQuery, [
        logMaster.id,
        risk_id,
        tanggal_kejadian,
        sebab_saat_ini,
        dampak_riil,
        tindakan_lanjutan,
      ])

      await pool.query(
        `UPDATE identifikasi_resiko SET fase = 'Pengendalian', updated_at = NOW() WHERE id = $1`,
        [risk_id],
      )

      if (statusSaatIni.toUpperCase() === 'CLOSED' || statusSaatIni.toUpperCase() === 'CLOSE') {
        await pool.query(`UPDATE identifikasi_resiko SET status = 'Re-open' WHERE id = $1`, [
          risk_id,
        ])
      }

      await pool.query('COMMIT')
      return res.status(201).json({
        message: 'Data kejadian risiko berhasil dicatat.',
        log_master: logMaster,
        data: detailResult.rows[0],
      })
    }
  } catch (error) {
    await pool.query('ROLLBACK')
    console.error('❌ CREATE KEJADIAN RISIKO ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

exports.updateKejadianRisiko = async (req, res) => {
  const pool = getPool()

  try {
    await pool.query('BEGIN')

    const { id } = req.params

    if (!req.body.detail_kejadian) {
      await pool.query('ROLLBACK')
      return res.status(400).json({ message: 'Detail kejadian wajib dilampirkan' })
    }

    const { tanggal_kejadian, sebab_saat_ini, dampak_riil, tindakan_lanjutan } =
      req.body.detail_kejadian

    // Validasi pengecekan isi tetap sama
    if (!id || !tanggal_kejadian || !sebab_saat_ini || !dampak_riil || !tindakan_lanjutan) {
      await pool.query('ROLLBACK')
      return res.status(400).json({ message: 'Semua data perubahan wajib diisi' })
    }

    // const cekDataLamaQuery = `
    //   SELECT kd.*, l.tahun, l.bulan
    //   FROM kejadian_risiko_detail kd
    //   JOIN log_risiko_bulanan l ON kd.log_bulanan_id = l.id
    //   WHERE kd.id = $1
    // `
    // const dataLamaResult = await pool.query(cekDataLamaQuery, [id])

    // if (dataLamaResult.rows.length === 0) {
    //   await pool.query('ROLLBACK')
    //   return res.status(404).json({ message: 'Data detail kejadian tidak ditemukan' })
    // }

    // const dataLama = dataLamaResult.rows[0]

    // const waktuSekarang = new Date()
    // const tahunSekarang = waktuSekarang.getFullYear()
    // const bulanSekarang = waktuSekarang.getMonth() + 1

    // if (
    //   dataLama.tahun < tahunSekarang ||
    //   (dataLama.tahun === tahunSekarang && dataLama.bulan < bulanSekarang)
    // ) {
    //   await pool.query('ROLLBACK')
    //   return res.status(403).json({
    //     message: `Data tidak dapat diubah. Laporan periode bulan ${dataLama.bulan} tahun ${dataLama.tahun} sudah terkunci/lewat bulan berjalan.`,
    //   })
    // }

    const updateQuery = `
      UPDATE kejadian_risiko_detail 
      SET 
        tanggal_kejadian = $1, 
        sebab_saat_ini = $2, 
        dampak_riil = $3,
        tindakan_lanjutan = $4
      WHERE id = $5
      RETURNING *
    `
    const result = await pool.query(updateQuery, [
      tanggal_kejadian,
      sebab_saat_ini,
      dampak_riil,
      tindakan_lanjutan,
      id,
    ])

    await pool.query('COMMIT')

    res.json({
      message: 'Data kejadian risiko berhasil diperbarui.',
      data: result.rows[0],
    })
  } catch (error) {
    await pool.query('ROLLBACK')
    console.error('❌ UPDATE KEJADIAN RISIKO ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}
