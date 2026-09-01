/* eslint-disable prettier/prettier */
const { getPool } = require("../config/db"); // <-- UBAH INI!

// exports.closeRisk = async (req, res) => {
//   const pool = getPool(); // <-- TAMBAHKAN INI!
//   const client = await pool.connect();

//   try {
//     const { id } = req.params;
//     const { close_reason } = req.body;
//     const user = req.user;
//     const filter = req.filter;

//     console.log("🔍 closeRisk - User:", user?.email);
//     console.log("BODY:", req.body);

//     if (!close_reason || close_reason.trim().length < 10) {
//       return res.status(400).json({
//         message: "Alasan penutupan risiko wajib diisi minimal 10 karakter",
//       });
//     }

//     // Mulai transaction
//     await client.query("BEGIN");

//     // 1. Periksa apakah risiko ada dan ambil data lengkap
//     const checkQuery = `
//       SELECT
//         id,
//         nama_resiko,
//         deskripsi,
//         created_at,
//         created_by_uuid
//       FROM identifikasi_resiko
//       WHERE id = $1
//     `;
//     const checkResult = await client.query(checkQuery, [id]);

//     if (checkResult.rows.length === 0) {
//       await client.query("ROLLBACK");
//       return res.status(404).json({ message: "Risiko tidak ditemukan" });
//     }

//     const riskData = checkResult.rows[0];

//     // 🔥 CEK AKSES: USER hanya bisa close risiko miliknya
//     if (
//       filter?.created_by_uuid &&
//       riskData.created_by_uuid !== filter.created_by_uuid
//     ) {
//       await client.query("ROLLBACK");
//       return res.status(403).json({
//         message: "Anda hanya bisa menutup risiko milik sendiri",
//       });
//     }

//     // 2. AMBIL DATA EFFECTIVENESS
//     let effectivenessData = {
//       avg_effectiveness: 0,
//       residual_score: 0,
//     };

//     try {
//       const effectQuery = `
//         SELECT
//           COALESCE(AVG(pk.effectiveness), 0) as avg_effectiveness
//         FROM penilaian_kontrol pk
//         JOIN kontrol_pengendalian kp ON pk.kontrol_id = kp.id
//         WHERE kp.risk_id = $1
//       `;
//       const effectResult = await client.query(effectQuery, [id]);

//       if (effectResult.rows[0]?.avg_effectiveness) {
//         effectivenessData.avg_effectiveness = Number(
//           effectResult.rows[0].avg_effectiveness,
//         );
//       }

//       console.log(
//         "✅ Effectiveness data:",
//         effectivenessData.avg_effectiveness,
//       );
//     } catch (effectErr) {
//       console.log(
//         "⚠️ Tidak ada data effectiveness, menggunakan default 0:",
//         effectErr.message,
//       );
//     }

//     effectivenessData.residual_score = 0;
//     console.log("ℹ️ Residual score menggunakan default 0 (tidak ada di DB)");

//     // 3. Update status risiko ke "Closed"
//     const updateQuery = `
//       UPDATE identifikasi_resiko
//       SET
//         status = 'Closed',
//         close_reason = $1,
//         closed_at = NOW(),
//         updated_at = NOW()
//       WHERE id = $2
//       RETURNING *
//     `;

//     const updateResult = await client.query(updateQuery, [close_reason, id]);

//     // 4. Auto-insert ke pemantauan_resiko
//     try {
//       const userId = user?.id || null;

//       const checkPemantauanQuery = `
//         SELECT id FROM pemantauan_resiko WHERE risk_id = $1 LIMIT 1
//       `;
//       const checkPemantauanResult = await client.query(checkPemantauanQuery, [
//         id,
//       ]);

//       let insertQuery;
//       let queryParams;

//       if (checkPemantauanResult.rows.length > 0) {
//         insertQuery = `
//           UPDATE pemantauan_resiko
//           SET
//             nama_resiko = $2,
//             progress_persen = $3,
//             efektifitas = $4,
//             review_kendala = $5,
//             residual_score = $6,
//             effectiveness_avg = $7,
//             closed_reason = $8,
//             updated_by = $9,
//             updated_at = NOW()
//           WHERE risk_id = $1
//         `;
//         queryParams = [
//           id,
//           riskData.nama_resiko || "Risiko tanpa nama",
//           100,
//           "Selesai",
//           `Risiko telah ditutup melalui menu Pengendalian. Alasan: ${close_reason}`,
//           effectivenessData.residual_score,
//           effectivenessData.avg_effectiveness,
//           close_reason,
//           userId,
//         ];
//       } else {
//         insertQuery = `
//           INSERT INTO pemantauan_resiko (
//             risk_id,
//             nama_resiko,
//             progress_persen,
//             efektifitas,
//             review_kendala,
//             residual_score,
//             effectiveness_avg,
//             closed_reason,
//             updated_by,
//             updated_at,
//             created_at
//           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
//         `;
//         queryParams = [
//           id,
//           riskData.nama_resiko || "Risiko tanpa nama",
//           100,
//           "Selesai",
//           `Risiko telah ditutup melalui menu Pengendalian. Alasan: ${close_reason}`,
//           effectivenessData.residual_score,
//           effectivenessData.avg_effectiveness,
//           close_reason,
//           userId,
//         ];
//       }

//       await client.query(insertQuery, queryParams);
//       console.log(
//         "✅ Berhasil auto-insert/update ke pemantauan_resiko untuk risk_id:",
//         id,
//       );
//     } catch (insertErr) {
//       console.warn(
//         "⚠️ Gagal insert/update ke pemantauan_resiko:",
//         insertErr.message,
//       );
//       console.warn("⚠️ Tapi close risk tetap berhasil.");
//     }

//     // Commit transaction
//     await client.query("COMMIT");

//     res.json({
//       success: true,
//       data: updateResult.rows[0],
//       message: "Risiko berhasil ditutup dan tercatat di pemantauan",
//       effectiveness_data: effectivenessData,
//     });
//   } catch (err) {
//     await client.query("ROLLBACK");
//     console.error("❌ Error closing risk:", err);
//     res.status(500).json({
//       message: "Gagal menutup risiko",
//       error: err.message,
//     });
//   } finally {
//     client.release();
//   }
// };

// exports.getRisksForChoosed = async (req, res) => {
//   try {
//     const pool = getPool()
//     const user = req.user
//     const filter = req.filter // Mengakomodasi RBAC middleware jika ada

//     // 1. Ambil Query Parameters dari Front-end
//     let page = parseInt(req.query.page) || 1
//     let limit = parseInt(req.query.limit) || 10
//     let search = req.query.search || ''
//     let { type = 'all', strategi = '', mode = '' } = req.query
//     let offset = (page - 1) * limit

//     console.log(
//       `🔍 Selection API Triggered -> Type: ${type}, Strategi Filter: ${strategi || 'NONE'}`,
//     )

//     let params = []
//     let conditions = []

//     // 2. KONDISI FILTER 1: Status Aktif vs Tidak Aktif (Sesuai Poin 3)
//     if (type === 'active') {
//       conditions.push(
//         `(ir.status IS NULL OR UPPER(ir.status) IN ('OPEN', 'IN PROGRESS', 'RE-OPEN', 'ON HOLD'))`,
//       )
//     } else if (type === 'closed') {
//       conditions.push(`UPPER(ir.status) IN ('CLOSED', 'DITUTUP')`)
//     }

//     // 3. KONDISI FILTER 2: Strategi Evaluasi (Sesuai Poin 2)
//     if (strategi.toUpperCase() === 'TREAT') {
//       conditions.push(`(er.strategi = 'TREAT' OR er.strategi IS NULL)`)
//     }

//     if (mode === 'analisis_inherent') {
//       conditions.push(`pr_before.risk_id IS NULL`)
//     } else if (mode === 'evaluasi_risiko') {
//       conditions.push(`pr_before.risk_id IS NOT NULL`)
//     } else if (mode === 'pengendalian_risiko') {
//       conditions.push(`pr_before.risk_id IS NOT NULL`)
//       conditions.push(`er.risk_id IS NOT NULL`)
//     }

//     // 4. KONDISI FILTER 3: RBAC Hak Akses User (Aman untuk middleware filter atau req.user)
//     const creatorUuid =
//       filter?.created_by_uuid ||
//       (user.role === 'USER' || user.role === 'RISK_OWNER' ? user.id : null)
//     if (creatorUuid) {
//       params.push(creatorUuid)
//       conditions.push(`ir.created_by_uuid = $${params.length}`)
//     }

//     // 5. KONDISI FILTER 4: Pencarian Kata Kunci
//     if (search.trim() !== '') {
//       params.push(`%${search}%`)
//       conditions.push(
//         `(ir.nama_resiko ILIKE $${params.length} OR ir.deskripsi ILIKE $${params.length})`,
//       )
//     }

//     const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

//     // ==========================================
//     // 6. QUERY UTAMA (Mengambil Data Hasil Gabungan)
//     // ==========================================
//     let mainQuery = `
//       SELECT
//         ir.id AS risk_id,
//         ir.nama_resiko,
//         ir.deskripsi,
//         ir.status,
//         ir.created_by_uuid,
//         ir.created_at,
//         k.name AS kategori_name,
//         u.username AS created_by_name,
//         CASE WHEN er.risk_id IS NOT NULL THEN true ELSE false END AS sudah_evaluasi,
//         er.strategi AS strategi_evaluasi,
//         er.prioritas AS prioritas_evaluasi,
//         pr_before.score AS inherent_score
//       FROM identifikasi_resiko ir
//       LEFT JOIN kategori_resiko k ON k.id = ir.kategori_id
//       LEFT JOIN users u ON ir.created_by_uuid = u.id
//       LEFT JOIN (
//         SELECT DISTINCT ON (risk_id) risk_id, strategi, prioritas, created_at
//         FROM evaluasi_resiko
//         WHERE is_active = true
//         ORDER BY risk_id, created_at DESC
//       ) er ON er.risk_id = ir.id
//       LEFT JOIN (
//         SELECT DISTINCT ON (risk_id) risk_id, score FROM penilaian_resiko WHERE assessment_type = 'INHERENT'
//       ) pr_before ON pr_before.risk_id = ir.id
//       ${whereClause}
//       ORDER BY ir.created_at DESC
//     `

//     // ==========================================
//     // 7. COUNTER QUERY (Kalkulasi Meta Data untuk Dashboard Seleksi)
//     // ==========================================
//     let counterQuery = `
//       SELECT
//         COUNT(ir.id) as total_rows,
//         COUNT(ir.id) FILTER (WHERE ir.status IS NULL OR UPPER(ir.status) IN ('OPEN', 'IN PROGRESS', 'RE-OPEN', 'ON HOLD')) as total_aktif,
//         COUNT(ir.id) FILTER (WHERE UPPER(ir.status) IN ('CLOSED', 'DITUTUP')) as total_tidak_aktif,
//         COUNT(ir.id) FILTER (WHERE er.risk_id IS NOT NULL) as total_sudah_evaluasi,
//         COUNT(ir.id) FILTER (WHERE er.risk_id IS NULL) as total_belum_evaluasi,
//         COUNT(ir.id) FILTER (WHERE pr_before.risk_id IS NOT NULL) as total_sudah_analisis,
//         COUNT(ir.id) FILTER (WHERE pr_before.risk_id IS NULL) as total_belum_analisis
//       FROM identifikasi_resiko ir
//       LEFT JOIN (
//         SELECT DISTINCT ON (risk_id) risk_id, strategi, prioritas, created_at
//         FROM evaluasi_resiko
//         WHERE is_active = true
//         ORDER BY risk_id, created_at DESC
//       ) er ON er.risk_id = ir.id
//       LEFT JOIN (
//         SELECT DISTINCT ON (risk_id) risk_id FROM penilaian_resiko WHERE assessment_type = 'INHERENT'
//       ) pr_before ON pr_before.risk_id = ir.id
//       ${whereClause}
//     `

//     // Jalankan eksekusi counter menggunakan parameter murni sebelum limit/offset dimasukkan
//     const counterResult = await pool.query(counterQuery, params)

//     const totalRows = parseInt(counterResult.rows[0].total_rows || 0)
//     const totalAktif = parseInt(counterResult.rows[0].total_aktif || 0)
//     const totalTidakAktif = parseInt(counterResult.rows[0].total_tidak_aktif || 0)
//     const totalSudahEvaluasi = parseInt(counterResult.rows[0].total_sudah_evaluasi || 0)
//     const totalBelumEvaluasi = parseInt(counterResult.rows[0].total_belum_evaluasi || 0)
//     const totalSudahAnalisis = parseInt(counterResult.rows[0].total_sudah_analisis || 0)
//     const totalBelumAnalisis = parseInt(counterResult.rows[0].total_belum_analisis || 0)

//     // Masukkan limit & offset ke parameter query utama
//     params.push(limit)
//     mainQuery += ` LIMIT $${params.length}`

//     params.push(offset)
//     mainQuery += ` OFFSET $${params.length}`

//     const dataResult = await pool.query(mainQuery, params)
//     const hasMore = offset + dataResult.rows.length < totalRows

//     console.log(`✅ Get Selection Success. Rows fetched: ${dataResult.rows.length}/${totalRows}`)

//     // 8. Kirim Response ke Front-end
//     res.json({
//       risiko: dataResult.rows,
//       meta: {
//         page,
//         limit,
//         totalRows,
//         hasMore,
//         totalAktif, // 🌟 Total Risiko Aktif
//         totalTidakAktif, // 🌟 Total Risiko Tidak Aktif
//         totalSudahEvaluasi,
//         totalBelumEvaluasi,
//         totalSudahAnalisis, // 🌟 Kirim ke Front-End
//         totalBelumAnalisis,
//       },
//     })
//   } catch (error) {
//     console.error('❌ GET RISIKO SELECTION ERROR:', error)
//     res.status(500).json({ message: 'Gagal memuat daftar seleksi risiko', error: error.message })
//   }
// }

exports.getRisksForChoosed = async (req, res) => {
  try {
    const pool = getPool();
    const user = req.user;
    const filter = req.filter;

    // 1. Ambil Query Parameters dari Front-end
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    let search = req.query.search || "";
    let { type = "all", strategi = "", mode = "" } = req.query;

    // 🌟 AMBIL PARAMETER BULAN & TAHUN INPUTAN (Penting untuk mode pencatatan kejadian)
    let inputBulan = parseInt(req.query.bulan);
    let inputTahun = parseInt(req.query.tahun);

    let offset = (page - 1) * limit;

    console.log(
      `🔍 Selection API Triggered -> Type: ${type}, Mode: ${mode}, Periode Cek: ${inputBulan}-${inputTahun}`,
    );

    let params = [];
    let conditions = [];

    // 2. KONDISI FILTER 1: Status Aktif vs Tidak Aktif
    if (type === "active") {
      conditions.push(
        `(ir.status IS NULL OR UPPER(ir.status) IN ('OPEN', 'IN PROGRESS', 'RE-OPEN', 'ON HOLD'))`,
      );
    } else if (type === "closed") {
      conditions.push(`UPPER(ir.status) IN ('CLOSED', 'DITUTUP')`);
    }

    // 3. KONDISI FILTER 2: Strategi Evaluasi
    if (strategi.toUpperCase() === "TREAT") {
      conditions.push(`(er.strategi = 'TREAT' OR er.strategi IS NULL)`);
    }

    if (mode === "analisis_inherent") {
      conditions.push(`pr_before.risk_id IS NULL`);
    } else if (mode === "evaluasi_risiko") {
      conditions.push(`pr_before.risk_id IS NOT NULL`);
    } else if (mode === "pengendalian_risiko") {
      conditions.push(`pr_before.risk_id IS NOT NULL`);
      conditions.push(`er.risk_id IS NOT NULL`);
    } else if (mode === "pencatatan_kejadian") {
      conditions.push(`pr_before.risk_id IS NOT NULL`);
    } else if (mode === "nihil_kejadian") {
      conditions.push(`pr_before.risk_id IS NOT NULL`);

      params.push(inputTahun);
      const paramTahunIdx = params.length;

      params.push(inputBulan);
      const paramBulanIdx = params.length;

      conditions.push(`
        ir.id NOT IN (
          SELECT krd.risk_id 
          FROM kejadian_risiko_detail krd
          JOIN log_risiko_bulanan lrb ON krd.log_bulanan_id = lrb.id
          WHERE lrb.tahun = $${paramTahunIdx} 
            AND lrb.bulan = $${paramBulanIdx}
            AND lrb.reported_by = ir.created_by_uuid
        )
      `);
    }

    // 4. KONDISI FILTER 3: RBAC Hak Akses User
    const creatorUuid =
      filter?.created_by_uuid ||
      (user.role === "USER" || user.role === "RISK_OWNER" ? user.id : null);
    if (creatorUuid) {
      params.push(creatorUuid);
      conditions.push(`ir.created_by_uuid = $${params.length}`);
    }

    // 5. KONDISI FILTER 4: Pencarian Kata Kunci
    if (search.trim() !== "") {
      params.push(`%${search}%`);
      conditions.push(
        `(ir.nama_resiko ILIKE $${params.length} OR ir.deskripsi ILIKE $${params.length})`,
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // ==========================================
    // 6. QUERY UTAMA
    // ==========================================
    let mainQuery = `
      SELECT 
        ir.id AS risk_id,
        ir.nama_resiko,
        ir.deskripsi,
        ir.status,
        ir.created_by_uuid,
        ir.created_at,
        k.name AS kategori_name,
        u.username AS created_by_name,
        CASE WHEN er.risk_id IS NOT NULL THEN true ELSE false END AS sudah_evaluasi,
        er.strategi AS strategi_evaluasi,
        er.prioritas AS prioritas_evaluasi,
        pr_before.score AS inherent_score
      FROM identifikasi_resiko ir
      LEFT JOIN kategori_resiko k ON k.id = ir.kategori_id
      LEFT JOIN users u ON ir.created_by_uuid = u.id
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, strategi, prioritas, created_at
        FROM evaluasi_resiko 
        WHERE is_active = true
        ORDER BY risk_id, created_at DESC
      ) er ON er.risk_id = ir.id
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, score FROM penilaian_resiko WHERE assessment_type = 'INHERENT'
      ) pr_before ON pr_before.risk_id = ir.id
      ${whereClause}
      ORDER BY ir.created_at DESC
    `;

    // ==========================================
    // 7. COUNTER QUERY
    // ==========================================
    let counterQuery = `
      SELECT 
        COUNT(ir.id) as total_rows,
        COUNT(ir.id) FILTER (WHERE ir.status IS NULL OR UPPER(ir.status) IN ('OPEN', 'IN PROGRESS', 'RE-OPEN', 'ON HOLD')) as total_aktif,
        COUNT(ir.id) FILTER (WHERE UPPER(ir.status) IN ('CLOSED', 'DITUTUP')) as total_tidak_aktif,
        COUNT(ir.id) FILTER (WHERE er.risk_id IS NOT NULL) as total_sudah_evaluasi,
        COUNT(ir.id) FILTER (WHERE er.risk_id IS NULL) as total_belum_evaluasi,
        COUNT(ir.id) FILTER (WHERE pr_before.risk_id IS NOT NULL) as total_sudah_analisis,
        COUNT(ir.id) FILTER (WHERE pr_before.risk_id IS NULL) as total_belum_analisis
      FROM identifikasi_resiko ir
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, strategi, prioritas, created_at
        FROM evaluasi_resiko 
        WHERE is_active = true
        ORDER BY risk_id, created_at DESC
      ) er ON er.risk_id = ir.id
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id FROM penilaian_resiko WHERE assessment_type = 'INHERENT'
      ) pr_before ON pr_before.risk_id = ir.id
      ${whereClause}
    `;

    const counterResult = await pool.query(counterQuery, params);

    const totalRows = parseInt(counterResult.rows[0].total_rows || 0);
    const totalAktif = parseInt(counterResult.rows[0].total_aktif || 0);
    const totalTidakAktif = parseInt(
      counterResult.rows[0].total_tidak_aktif || 0,
    );
    const totalSudahEvaluasi = parseInt(
      counterResult.rows[0].total_sudah_evaluasi || 0,
    );
    const totalBelumEvaluasi = parseInt(
      counterResult.rows[0].total_belum_evaluasi || 0,
    );
    const totalSudahAnalisis = parseInt(
      counterResult.rows[0].total_sudah_analisis || 0,
    );
    const totalBelumAnalisis = parseInt(
      counterResult.rows[0].total_belum_analisis || 0,
    );

    // Masukkan limit & offset ke parameter query utama
    params.push(limit);
    mainQuery += ` LIMIT $${params.length}`;

    params.push(offset);
    mainQuery += ` OFFSET $${params.length}`;

    const dataResult = await pool.query(mainQuery, params);
    const hasMore = offset + dataResult.rows.length < totalRows;

    res.json({
      risiko: dataResult.rows,
      meta: {
        page,
        limit,
        totalRows,
        hasMore,
        totalAktif,
        totalTidakAktif,
        totalSudahEvaluasi,
        totalBelumEvaluasi,
        totalSudahAnalisis,
        totalBelumAnalisis,
      },
    });
  } catch (error) {
    console.error("❌ GET RISIKO SELECTION ERROR:", error);
    res
      .status(500)
      .json({
        message: "Gagal memuat daftar seleksi risiko",
        error: error.message,
      });
  }
};

exports.closeRisk = async (req, res) => {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { close_reason } = req.body;
    const user = req.user;
    const filter = req.filter;

    if (!close_reason || close_reason.trim().length < 10) {
      return res.status(400).json({
        message: "Alasan penutupan risiko wajib diisi minimal 10 karakter",
      });
    }

    await client.query("BEGIN");

    // 1. Ambil data risiko dan pastikan kepemilikannya aman
    const checkQuery = `
      SELECT id, nama_resiko, created_by_uuid 
      FROM identifikasi_resiko 
      WHERE id = $1
    `;
    const checkResult = await client.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Risiko tidak ditemukan" });
    }

    const riskData = checkResult.rows[0];

    if (
      filter?.created_by_uuid &&
      riskData.created_by_uuid !== filter.created_by_uuid
    ) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ message: "Anda hanya bisa menutup risiko milik sendiri" });
    }

    // 2. 🔥 SECURITY CHECK & INTEGRITAS DATA KONTROL
    // Hitung total kontrol yang terdaftar untuk risiko ini
    const countKontrolQuery = `
      SELECT COUNT(*) as total FROM kontrol_pengendalian WHERE risk_id = $1
    `;
    const countKontrolResult = await client.query(countKontrolQuery, [id]);
    const totalKontrol = parseInt(countKontrolResult.rows[0].total) || 0;

    // 3. KALKULASI UTUH: Mengambil nilai efektivitas terbaru dari SETIAP kontrol (Sesuai tabel penilaian_kontrol)
    const effectQuery = `
      SELECT 
        COALESCE(AVG(latest_penilaian.effectiveness), 0) as avg_effectiveness,
        COUNT(latest_penilaian.id) as total_assessed
      FROM kontrol_pengendalian kp
      LEFT JOIN (
        SELECT DISTINCT ON (kontrol_id) id, kontrol_id, effectiveness
        FROM penilaian_kontrol
        ORDER BY kontrol_id, created_at DESC
      ) latest_penilaian ON latest_penilaian.kontrol_id = kp.id
      WHERE kp.risk_id = $1
    `;
    const effectResult = await client.query(effectQuery, [id]);
    const avgEffectiveness =
      Number(effectResult.rows[0].avg_effectiveness) || 0;
    const totalAssessedKontrol =
      parseInt(effectResult.rows[0].total_assessed) || 0;

    // 🔥 Proteksi Backend: Jika ada kontrol yang belum diklik "Hitung Efektivitas", tolak penutupan
    if (totalKontrol > 0 && totalAssessedKontrol < totalKontrol) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Gagal menutup risiko. Terdapat ${totalKontrol - totalAssessedKontrol} kontrol pengendalian yang belum dihitung nilai efektivitasnya di database.`,
      });
    }

    // 4. Ambil inherent_score untuk menghitung residual_score riil
    const riskQuery = `
      SELECT score as inherent_score FROM penilaian_resiko WHERE risk_id = $1
    `;
    const riskResult = await client.query(riskQuery, [id]);

    if (
      riskResult.rows.length === 0 ||
      riskResult.rows[0].inherent_score === null
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message:
          "Risiko gagal ditutup karena belum memiliki nilai asesmen awal (Inherent Score).",
      });
    }

    const inherentScore = Number(riskResult.rows[0].inherent_score);

    // Rumus Matematika Terpadu Residual Score
    const residualScore = Math.max(
      0,
      inherentScore * (1 - avgEffectiveness / 100),
    );

    // Validasi Kelayakan ISO 31000 di Sisi Backend (Double Security Guard)
    if (residualScore > 5 || avgEffectiveness < 70) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Risiko tidak layak ditutup. Syarat Kelayakan: Efektivitas Total >= 70% (Saat ini: ${avgEffectiveness.toFixed(2)}%) dan Residual Risk Score <= 5 (Saat ini: ${residualScore.toFixed(2)}).`,
      });
    }

    // 🤖 PENGKONDISIAN LABEL EFEKTIVITAS (0 - 100)
    let labelEfektifitas = "TIDAK EFEKTIF";
    if (avgEffectiveness >= 80) {
      labelEfektifitas = "EFEKTIF";
    } else if (avgEffectiveness >= 50) {
      labelEfektifitas = "EFEKTIF SEBAGIAN";
    }

    // 5. Update status risiko utama
    const updateQuery = `
      UPDATE identifikasi_resiko 
      SET status = 'Closed', close_reason = $1, closed_at = NOW(), updated_at = NOW()
      WHERE id = $2 RETURNING *
    `;
    const updateResult = await client.query(updateQuery, [close_reason, id]);

    // 6. Upsert ke pemantauan_resiko
    const userId = user?.id || null;
    const checkPemantauan = await client.query(
      `SELECT id FROM pemantauan_resiko WHERE risk_id = $1`,
      [id],
    );

    let upsertQuery;
    let queryParams = [
      id,
      riskData.nama_resiko || "Risiko tanpa nama",
      Math.round(avgEffectiveness), // progress_persen diambil dari rata-rata efektivitas kontrol
      labelEfektifitas, // efektifitas string label kondisi
      `Risiko telah ditutup melalui menu Pengendalian. Alasan: ${close_reason}`,
      residualScore, // Nilai hitung riil database summary
      avgEffectiveness, // effectiveness_avg dipertahankan sesuai aslinya
      close_reason,
      userId,
    ];

    if (checkPemantauan.rows.length > 0) {
      upsertQuery = `
        UPDATE pemantauan_resiko SET 
          nama_resiko = $2, progress_persen = $3, efektifitas = $4, review_kendala = $5,
          residual_score = $6, effectiveness_avg = $7, closed_reason = $8, updated_by = $9, updated_at = NOW()
        WHERE risk_id = $1
      `;
    } else {
      upsertQuery = `
        INSERT INTO pemantauan_resiko (
          risk_id, nama_resiko, progress_persen, efektifitas, review_kendala,
          residual_score, effectiveness_avg, closed_reason, updated_by, updated_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      `;
    }

    await client.query(upsertQuery, queryParams);
    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Risiko berhasil ditutup dan disinkronkan ke pemantauan.",
      data: updateResult.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error closing risk:", err);
    res
      .status(500)
      .json({ message: "Gagal menutup risiko", error: err.message });
  } finally {
    client.release();
  }
};

// GET RISIKO CLOSED (untuk tab Pemantauan)
exports.getClosedRisks = async (req, res) => {
  try {
    const pool = getPool(); // <-- TAMBAHKAN INI!
    const user = req.user;
    const filter = req.filter;

    console.log("🔍 getClosedRisks - User:", user?.email);

    let query = `
      SELECT 
        id, 
        nama_resiko, 
        deskripsi,
        close_reason,
        closed_at,
        created_by_uuid
      FROM identifikasi_resiko 
      WHERE status = 'Closed'
    `;

    let params = [];
    let conditions = [];

    // 🔥 FILTER DARI RISKFILTER
    if (filter?.created_by_uuid) {
      conditions.push(`created_by_uuid = $${params.length + 1}`);
      params.push(filter.created_by_uuid);
    }

    if (conditions.length > 0) {
      query += ` AND ` + conditions.join(" AND ");
    }

    query += ` ORDER BY closed_at DESC`;

    const result = await pool.query(query, params);
    console.log(`✅ Mendapatkan ${result.rows.length} risiko closed`);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ getClosedRisks error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET RISIKO AKTIF UNTUK MONITORING
exports.getActiveRisksForMonitoring = async (req, res) => {
  try {
    const pool = getPool(); // <-- TAMBAHKAN INI!
    const user = req.user;
    const filter = req.filter;

    console.log("🔍 getActiveRisksForMonitoring - User:", user?.email);

    let query = `
      SELECT 
        id, 
        nama_resiko, 
        deskripsi,
        status,
        created_at,
        created_by_uuid,
        updated_at
      FROM identifikasi_resiko 
      WHERE status IN ('Open', 'In Progress', 'On Hold')
    `;

    let params = [];
    let conditions = [];

    // 🔥 FILTER DARI RISKFILTER
    if (filter?.created_by_uuid) {
      conditions.push(`created_by_uuid = $${params.length + 1}`);
      params.push(filter.created_by_uuid);
    }

    if (conditions.length > 0) {
      query += ` AND ` + conditions.join(" AND ");
    }

    query += ` ORDER BY 
      CASE 
        WHEN status = 'Open' THEN 1
        WHEN status = 'In Progress' THEN 2
        ELSE 3
      END,
      updated_at DESC NULLS LAST
    `;

    const result = await pool.query(query, params);
    console.log(`✅ Mendapatkan ${result.rows.length} risiko aktif`);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ getActiveRisksForMonitoring error:", err);
    res.status(500).json({ error: err.message });
  }
};

// exports.getRisksForMonitoring = async (req, res) => {
//   try {
//     const pool = getPool()
//     const user = req.user
//     const filter = req.filter

//     let page = parseInt(req.query.page) || 1
//     let limit = parseInt(req.query.limit) || 10
//     let search = req.query.search || ''
//     let { type = 'active' } = req.query
//     let offset = (page - 1) * limit

//     // Ambil bulan & tahun berjalan dari query atau default current time
//     const currentYear = parseInt(req.query.tahun) || new Date().getFullYear()
//     const currentMonth = parseInt(req.query.bulan) || new Date().getMonth() + 1

//     let params = []
//     let conditions = []

//     if (type === 'closed') {
//       conditions.push(`ir.status = 'Closed'`)
//     } else {
//       conditions.push(
//         `(ir.status IS NULL OR UPPER(ir.status) IN ('OPEN', 'IN PROGRESS', 'RE-OPEN', 'ON HOLD'))`,
//       )
//     }

//     if (filter?.created_by_uuid) {
//       conditions.push(`ir.created_by_uuid = $${params.length + 1}`)
//       params.push(filter.created_by_uuid)
//     }

//     if (search.trim() !== '') {
//       conditions.push(
//         `(ir.nama_resiko ILIKE $${params.length + 1} OR ir.deskripsi ILIKE $${params.length + 1})`,
//       )
//       params.push(`%${search}%`)
//     }

//     const whereClause = conditions.length > 0 ? ` WHERE ` + conditions.join(' AND ') : ''

//     let query = `
//       SELECT
//         ir.id,
//         ir.nama_resiko,
//         ir.deskripsi,
//         ir.status,
//         ir.closed_at,
//         ir.close_reason,
//         ir.created_at,
//         ir.updated_at,
//         ir.created_by_uuid,
//         kr.name AS kategori_name,
//         u.username AS pemilik_risiko,
//         pr_before.likelihood AS likelihood_before,
//         pr_before.impact AS impact_before,
//         pr_before.score AS inherent_score,
//         pr_after.likelihood AS likelihood_after,
//         pr_after.impact AS impact_after,
//         pr_after.score AS score_after,
//         er.strategi,
//         er.prioritas,

//         -- 🌟 TAMBAHAN: Hitung kejadian bulan & tahun berjalan
//         COALESCE(kejadian_now.total_kejadian, 0) AS total_kejadian_berjalan
//       FROM identifikasi_resiko ir
//       LEFT JOIN kategori_resiko kr ON kr.id = ir.kategori_id
//       LEFT JOIN users u ON ir.created_by_uuid = u.id

//       LEFT JOIN (
//         SELECT risk_id, likelihood, impact, score FROM (
//           SELECT risk_id, likelihood, impact, score,
//                  ROW_NUMBER() OVER (PARTITION BY risk_id ORDER BY created_at DESC) as rn
//           FROM penilaian_resiko WHERE assessment_type = 'INHERENT'
//         ) tmp WHERE rn = 1
//       ) pr_before ON pr_before.risk_id = ir.id

//       LEFT JOIN (
//         SELECT risk_id, likelihood, impact, score FROM (
//           SELECT risk_id, likelihood, impact, score,
//                  ROW_NUMBER() OVER (PARTITION BY risk_id ORDER BY created_at DESC) as rn
//           FROM penilaian_resiko WHERE assessment_type = 'RESIDUAL'
//         ) tmp_after WHERE rn = 1
//       ) pr_after ON pr_after.risk_id = ir.id

//       LEFT JOIN (
//         SELECT risk_id, strategi, prioritas FROM (
//           SELECT risk_id, strategi, prioritas,
//                  ROW_NUMBER() OVER (PARTITION BY risk_id ORDER BY created_at DESC) as rn
//           FROM evaluasi_resiko WHERE is_active = true
//         ) tmp_ev WHERE rn = 1
//       ) er ON er.risk_id = ir.id

//       -- 🌟 LEFT JOIN Ganda untuk subquery kejadian berjalan
//       LEFT JOIN (
//         SELECT krd.risk_id, COUNT(krd.id) AS total_kejadian
//         FROM kejadian_risiko_detail krd
//         JOIN log_risiko_bulanan lrb ON krd.log_bulanan_id = lrb.id
//         WHERE lrb.tahun = $${params.length + 1} AND lrb.bulan = $${params.length + 2}
//         GROUP BY krd.risk_id
//       ) kejadian_now ON kejadian_now.risk_id = ir.id
//       ${whereClause}
//     `
//     // Daftarkan parameter tahun dan bulan berjalan ke query utama
//     const mainParams = [...params, currentYear, currentMonth]

//     // Count query
//     let countQuery = `
//       SELECT COUNT(ir.id) as count FROM identifikasi_resiko ir ${whereClause}
//     `

//     if (type === 'closed') {
//       query += ` ORDER BY ir.closed_at DESC`
//     } else {
//       query += ` ORDER BY CASE WHEN ir.status = 'Open' THEN 1 WHEN ir.status = 'In Progress' THEN 2 ELSE 3 END, ir.created_at DESC`
//     }

//     mainParams.push(limit)
//     query += ` LIMIT $${mainParams.length}`

//     mainParams.push(offset)
//     query += ` OFFSET $${mainParams.length}`

//     const [dataResult, countResult] = await Promise.all([
//       pool.query(query, mainParams),
//       pool.query(countQuery, params),
//     ])

//     const totalRows = parseInt(countResult.rows[0].count)
//     const hasMore = offset + dataResult.rows.length < totalRows

//     res.json({
//       risiko: dataResult.rows,
//       meta: { page, limit, totalRows, hasMore, currentYear, currentMonth },
//     })
//   } catch (err) {
//     res.status(500).json({ error: err.message })
//   }
// }

// backend get monitoring risiko (Murni Akumulasi Tahun Berjalan)
exports.getRisksForMonitoring = async (req, res) => {
  try {
    const pool = getPool();
    const user = req.user;
    const filter = req.filter;

    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    let search = req.query.search || "";
    let { type = "active" } = req.query;
    let offset = (page - 1) * limit;

    // Ambil tahun berjalan dari query atau default tahun saat ini (2026)
    const currentYear = parseInt(req.query.tahun) || new Date().getFullYear();

    let mainParams = [];
    let conditions = [];

    if (type === "closed") {
      conditions.push(`ir.status = 'Closed'`);
    } else {
      conditions.push(
        `(ir.status IS NULL OR UPPER(ir.status) IN ('OPEN', 'IN PROGRESS', 'RE-OPEN', 'ON HOLD'))`,
      );
    }

    if (filter?.created_by_uuid) {
      mainParams.push(filter.created_by_uuid);
      conditions.push(`ir.created_by_uuid = $${mainParams.length}`);
    }

    if (search.trim() !== "") {
      mainParams.push(`%${search}%`);
      conditions.push(
        `(ir.nama_resiko ILIKE $${mainParams.length} OR ir.deskripsi ILIKE $${mainParams.length})`,
      );
    }

    const whereClause =
      conditions.length > 0 ? ` WHERE ` + conditions.join(" AND ") : "";

    // Daftarkan parameter tahun berjalan ke dalam array utama sebelum LIMIT & OFFSET
    mainParams.push(currentYear);
    const tahunParamIndex = mainParams.length;

    let query = `
      SELECT 
        ir.id, 
        ir.nama_resiko, 
        ir.deskripsi,
        ir.status,
        ir.closed_at,
        ir.close_reason,
        ir.created_at,
        ir.updated_at,
        ir.created_by_uuid,
        kr.name AS kategori_name,
        u.username AS pemilik_risiko,
        pr_before.likelihood AS likelihood_before,
        pr_before.impact AS impact_before,
        pr_before.score AS inherent_score,
        pr_after.likelihood AS likelihood_after,
        pr_after.impact AS impact_after,
        pr_after.score AS score_after,
        er.strategi,
        er.prioritas,
        
        -- Agregasi total kejadian dalam 1 tahun berjalan penuh
        COALESCE(kejadian_now.total_kejadian, 0) AS total_kejadian_berjalan
      FROM identifikasi_resiko ir
      LEFT JOIN kategori_resiko kr ON kr.id = ir.kategori_id
      LEFT JOIN users u ON ir.created_by_uuid = u.id
      
      LEFT JOIN (
        SELECT risk_id, likelihood, impact, score FROM (
          SELECT risk_id, likelihood, impact, score,
                 ROW_NUMBER() OVER (PARTITION BY risk_id ORDER BY created_at DESC) as rn
          FROM penilaian_resiko WHERE assessment_type = 'INHERENT'
        ) tmp WHERE rn = 1
      ) pr_before ON pr_before.risk_id = ir.id

      LEFT JOIN (
        SELECT risk_id, likelihood, impact, score FROM (
          SELECT risk_id, likelihood, impact, score,
                 ROW_NUMBER() OVER (PARTITION BY risk_id ORDER BY created_at DESC) as rn
          FROM penilaian_resiko WHERE assessment_type = 'RESIDUAL'
        ) tmp_after WHERE rn = 1
      ) pr_after ON pr_after.risk_id = ir.id

      LEFT JOIN (
        SELECT risk_id, strategi, prioritas FROM (
          SELECT risk_id, strategi, prioritas,
                 ROW_NUMBER() OVER (PARTITION BY risk_id ORDER BY created_at DESC) as rn
          FROM evaluasi_resiko WHERE is_active = true
        ) tmp_ev WHERE rn = 1
      ) er ON er.risk_id = ir.id

      -- Subquery mengunci log setahun penuh tanpa filter bulan berjalan
      LEFT JOIN (
        SELECT krd.risk_id, COUNT(krd.id) AS total_kejadian
        FROM kejadian_risiko_detail krd
        JOIN log_risiko_bulanan lrb ON krd.log_bulanan_id = lrb.id
        WHERE lrb.tahun = $${tahunParamIndex}
        GROUP BY krd.risk_id
      ) kejadian_now ON kejadian_now.risk_id = ir.id
      ${whereClause}
    `;

    // Count query untuk pagination parameter
    let countQuery = `
      SELECT COUNT(ir.id) as count FROM identifikasi_resiko ir ${whereClause}
    `;
    const countParams = mainParams.slice(0, tahunParamIndex - 1);

    if (type === "closed") {
      query += ` ORDER BY ir.closed_at DESC`;
    } else {
      query += ` ORDER BY CASE WHEN ir.status = 'Open' THEN 1 WHEN ir.status = 'In Progress' THEN 2 ELSE 3 END, ir.created_at DESC`;
    }

    mainParams.push(limit);
    query += ` LIMIT $${mainParams.length}`;

    mainParams.push(offset);
    query += ` OFFSET $${mainParams.length}`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(query, mainParams),
      pool.query(countQuery, countParams),
    ]);

    const totalRows = parseInt(countResult.rows[0].count);
    const hasMore = offset + dataResult.rows.length < totalRows;

    res.json({
      risiko: dataResult.rows,
      meta: {
        page,
        limit,
        totalRows,
        hasMore,
        currentYear,
        // currentMonth resmi dihapus agar payload lebih ringkas
      },
    });
  } catch (err) {
    console.error("❌ GET RISKS MONITORING ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getRiskDetailWithMitigasiAndSummary = async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const user = req.user;

    // 1. Query Utama: Ambil Detail Risiko, Skor Inherent, Strategi, dan Sub-Array Mitigasi (Kontrol & Aksi)
    const mainQuery = `
      SELECT 
        i.*,
        k.name AS kategori_name,
        u.username AS pemilik_risiko,
        er.strategi,
        pr.score AS inherent_score,
        
        -- Agregasi Kontrol dan Aksi di dalamnya
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
      LEFT JOIN kategori_resiko k ON k.id = i.kategori_id
      LEFT JOIN users u ON i.created_by_uuid = u.id
      LEFT JOIN evaluasi_resiko er ON er.risk_id = i.id
      LEFT JOIN penilaian_resiko pr ON pr.risk_id = i.id
      WHERE i.id = $1
    `;

    const mainResult = await pool.query(mainQuery, [id]);

    if (mainResult.rows.length === 0) {
      return res.status(404).json({ message: "Risiko tidak ditemukan" });
    }

    const risiko = mainResult.rows[0];

    // Cek Hak Akses (RBAC)
    if (
      user.role !== "ADMIN" &&
      user.role !== "GUEST" &&
      risiko.created_by_uuid !== user.id
    ) {
      return res
        .status(403)
        .json({ message: "Anda tidak memiliki akses ke data ini" });
    }

    // 2. Query Tambahan: Hitung rata-rata efektivitas dari action untuk Summary instan
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
    `;

    const avgResult = await pool.query(avgQuery, [id]);
    const avgEffectiveness = Number(avgResult.rows[0].avg_effectiveness) || 0;

    // 3. Kalkulasi Skor Residu secara Real-time
    let inherentScore =
      risiko.inherent_score !== null ? Number(risiko.inherent_score) : null;
    let residualScore = null;
    let isAssessed = inherentScore !== null;

    if (isAssessed) {
      residualScore = inherentScore * (1 - avgEffectiveness / 100);
      residualScore = Math.max(0, residualScore);
    }

    // 4. Inject data kalkulasi summary ke dalam satu object response
    risiko.summary = {
      avg_effectiveness: avgEffectiveness,
      inherent_score: inherentScore,
      residual_score: residualScore,
      is_assessed: isAssessed,
    };

    res.json(risiko);
  } catch (error) {
    console.error("❌ GET RISK DETAIL COMPILATION ERROR:", error);
    res.status(500).json({
      message: "Gagal memuat detail mitigasi risiko",
      error: error.message,
    });
  }
};

// UPDATE PROGRESS MONITORING
exports.updateMonitoringProgress = async (req, res) => {
  const pool = getPool(); // <-- TAMBAHKAN INI!
  const client = await pool.connect();

  try {
    const { risk_id } = req.params;
    const { progress_persen, efektifitas, review_kendala } = req.body;
    const user = req.user;
    const filter = req.filter;

    console.log("🔍 updateMonitoringProgress - User:", user?.email);
    console.log("Body:", req.body);

    if (!progress_persen || progress_persen < 0 || progress_persen > 100) {
      return res.status(400).json({
        message: "Progress harus antara 0-100%",
      });
    }

    await client.query("BEGIN");

    // Cek apakah risiko aktif dan milik user
    const checkRiskQuery = `
      SELECT id, status, created_by_uuid FROM identifikasi_resiko 
      WHERE id = $1 AND status IN ('Open', 'In Progress', 'On Hold')
    `;
    const checkResult = await client.query(checkRiskQuery, [risk_id]);

    if (checkResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Risiko tidak ditemukan atau sudah closed",
      });
    }

    // 🔥 CEK AKSES: USER hanya bisa update progress risiko miliknya
    if (
      filter?.created_by_uuid &&
      checkResult.rows[0].created_by_uuid !== filter.created_by_uuid
    ) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Anda hanya bisa update progress risiko milik sendiri",
      });
    }

    // Update atau Insert ke pemantauan_resiko
    const checkPemantauanQuery = `
      SELECT id FROM pemantauan_resiko WHERE risk_id = $1 LIMIT 1
    `;
    const checkPemantauan = await client.query(checkPemantauanQuery, [risk_id]);

    if (checkPemantauan.rows.length > 0) {
      // UPDATE existing
      const updateQuery = `
        UPDATE pemantauan_resiko 
        SET 
          progress_persen = $2,
          efektifitas = $3,
          review_kendala = $4,
          updated_by = $5,
          updated_at = NOW()
        WHERE risk_id = $1
        RETURNING *
      `;
      const result = await client.query(updateQuery, [
        risk_id,
        progress_persen,
        efektifitas,
        review_kendala,
        user?.id,
      ]);

      await client.query("COMMIT");
      res.json({ success: true, data: result.rows[0] });
    } else {
      // INSERT new
      const insertQuery = `
        INSERT INTO pemantauan_resiko (
          risk_id,
          nama_resiko,
          progress_persen,
          efektifitas,
          review_kendala,
          updated_by,
          updated_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING *
      `;

      // Ambil nama risiko
      const getRiskNameQuery = `
        SELECT nama_resiko FROM identifikasi_resiko WHERE id = $1
      `;
      const riskNameResult = await client.query(getRiskNameQuery, [risk_id]);
      const nama_resiko = riskNameResult.rows[0]?.nama_resiko || "Unknown Risk";

      const result = await client.query(insertQuery, [
        risk_id,
        nama_resiko,
        progress_persen,
        efektifitas,
        review_kendala,
        user?.id,
      ]);

      await client.query("COMMIT");
      res.json({ success: true, data: result.rows[0] });
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error update monitoring:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};
