/* eslint-disable @typescript-eslint/no-require-imports */
const { getPool } = require("../config/db");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const {
  getRiskLevelLabel,
  getActionStatusLabel,
  getNamaBulan,
} = require("../helpers/risk-helper");
const { formatDate } = require("../libs/util");

const flattenMitigasiRows = (listKontrol, now = new Date()) => {
  const flattenedList = [];

  if (!Array.isArray(listKontrol) || listKontrol.length === 0) {
    return [
      {
        nama_kontrol: "Belum Ada Pengendalian",
        tipe_kontrol: "-",
        action_plan: "Belum Ada Rencana Tindakan",
        pic_name: "-",
        target_date: "-",
        status_action: "-",
        realisasi_date: "-",
        bukti_mitigasi: "-",
        has_overdue: false,
      },
    ];
  }

  listKontrol.forEach((kp, kIdx) => {
    const namaKontrolFormatted = `${kIdx + 1}. [${kp.tipe || "KONTROL"}] ${kp.nama_kontrol}`;

    if (Array.isArray(kp.actions) && kp.actions.length > 0) {
      kp.actions.forEach((ak) => {
        const isActionDone = [
          "Closed",
          "CLOSED",
          "Done",
          "DONE",
          "Selesai",
        ].includes(ak.status);

        const targetDateObj = ak.target_date ? new Date(ak.target_date) : null;
        const isOverdue = !isActionDone && targetDateObj && targetDateObj < now;

        flattenedList.push({
          nama_kontrol: namaKontrolFormatted,
          tipe_kontrol: kp.tipe || "KONTROL",
          action_plan: ak.action_plan || "-",
          pic_name: ak.pic_name || "Tanpa PIC",
          target_date: ak.target_date ? formatDate(ak.target_date) : "-",
          status_action: getActionStatusLabel(ak.status),
          realisasi_date: ak.realisasi_date
            ? formatDate(ak.realisasi_date)
            : "-",
          bukti_mitigasi: ak.bukti_mitigasi || "Tidak Ada Bukti",
          has_overdue: isOverdue,
          is_done: isActionDone,
        });
      });
    } else {
      // Jika Kontrol Ada tetapi belum ada Rencana Tindakan dibuat
      flattenedList.push({
        nama_kontrol: namaKontrolFormatted,
        tipe_kontrol: kp.tipe || "KONTROL",
        action_plan: "Belum Ada Rencana Tindakan",
        pic_name: "-",
        target_date: "-",
        status_action: "-",
        realisasi_date: "-",
        bukti_mitigasi: "-",
        has_overdue: false,
        is_done: false,
      });
    }
  });

  return flattenedList;
};

// Report Data Keseluruhan
exports.getReportData = async (user, filter) => {
  try {
    const pool = getPool();

    let query = `
      SELECT 
        ir.id,
        ir.nama_resiko,
        ir.deskripsi,
        ir.status as status_risiko,
        kr.name as kategori,
        pr.likelihood,
        pr.impact,
        pr.score as inherent_score,
        
        -- 1. LEVEL RISIKO INHERENT
        CASE 
          WHEN pr.score >= 20 THEN 'Ekstrim'
          WHEN pr.score >= 12 THEN 'Tinggi'
          WHEN pr.score >= 6 THEN 'Sedang'
          ELSE 'Rendah'
        END as level_risiko_inherent,

        CASE 
          WHEN er.strategi = 'TREAT' THEN 'Mitigasi'
          WHEN er.strategi = 'TRANSFER' THEN 'Transfer'
          WHEN er.strategi = 'AVOID' THEN 'Hindari'
          WHEN er.strategi = 'ACCEPT' THEN 'Terima'
          ELSE NULL
        END as strategi_perlakuan,
        
        -- 2. KONVERSI KODE PRIORITAS MENJADI TEKS
        CASE 
          WHEN er.prioritas = 1 THEN 'Sangat Mendesak'
          WHEN er.prioritas = 2 THEN 'Penting'
          WHEN er.prioritas = 3 THEN 'Sedang'
          WHEN er.prioritas = 4 THEN 'Monitoring'
          ELSE '-'
        END as prioritas_text,
        
        -- PROGRESS dari action_kontrol
        COALESCE(act.progress_persen, 0) as progress_persen,
        
        -- EFEKTIVITAS RATA-RATA ACTION KONTROL
        COALESCE(act.avg_effectiveness, 0) as avg_effectiveness,
        
        -- 3. KALKULASI RESIDUAL SCORE SECARA REAL-TIME
        pr_res.score as residual_score,

        pm.review_kendala,
        ir.updated_at as last_update,
        ir.created_at as tanggal_identifikasi,
        ir.closed_at,
        ir.close_reason,
        ir.created_by_uuid,
        u.username AS pemilik_risiko
        
      FROM identifikasi_resiko ir
      LEFT JOIN kategori_resiko kr ON ir.kategori_id = kr.id
      LEFT JOIN penilaian_resiko pr ON ir.id = pr.risk_id AND pr.assessment_type = 'INHERENT'
      LEFT JOIN (
        SELECT risk_id, score FROM (
          SELECT risk_id, score,
                 ROW_NUMBER() OVER (PARTITION BY risk_id ORDER BY created_at DESC) as rn
          FROM penilaian_resiko 
          WHERE assessment_type = 'RESIDUAL'
        ) tmp_res WHERE rn = 1
      ) pr_res ON ir.id = pr_res.risk_id
      
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, strategi, prioritas, created_at
        FROM evaluasi_resiko
        ORDER BY risk_id, created_at DESC
      ) er ON ir.id = er.risk_id
      
      LEFT JOIN (
        SELECT 
          kp.risk_id,
          CASE 
            WHEN COUNT(ak.id) = 0 THEN 0
            ELSE ROUND((SUM(CASE WHEN ak.status = 'Closed' THEN 1 ELSE 0 END) * 100.0 / COUNT(ak.id)), 0)
          END as progress_persen,
          COALESCE(AVG(
            CASE 
              WHEN ak.status = 'Closed' THEN 100
              WHEN ak.status = 'On Progress' THEN 50
              WHEN ak.status = 'Open' THEN 0
              WHEN ak.status = 'Overdue' THEN 0
              ELSE 0
            END
          ), 0) as avg_effectiveness
        FROM kontrol_pengendalian kp
        LEFT JOIN action_kontrol ak ON kp.id = ak.kontrol_id
        GROUP BY kp.risk_id
      ) act ON ir.id = act.risk_id
      
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, review_kendala, updated_at
        FROM pemantauan_resiko
        ORDER BY risk_id, updated_at DESC NULLS LAST
      ) pm ON ir.id = pm.risk_id
      
      LEFT JOIN users u ON ir.created_by_uuid = u.id
      -- 🎯 FIX UTAMA: Memberikan tanda kurung tutup pada validasi status dasar agar tidak bocor ke unit lain
      WHERE (ir.status != 'Deleted' OR ir.status IS NULL)
    `;

    let params = [];
    let conditions = [];

    if (filter?.created_by_uuid) {
      conditions.push(`ir.created_by_uuid = $${params.length + 1}`);
      params.push(filter.created_by_uuid);
    }

    if (conditions.length > 0) {
      query += ` AND ` + conditions.join(" AND ");
    }

    query += `
      ORDER BY 
        CASE WHEN ir.status = 'Open' THEN 1 ELSE 2 END,
        COALESCE(er.prioritas, 999) ASC,
        ir.created_at DESC
    `;

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error("❌ Database query error:", error);
    throw error;
  }
};

// Report Data Identifikasi, Analisis, dan Evaluasi Risiko
exports.getRiskProfileReportData = async (filter) => {
  try {
    const pool = getPool();

    // 1. Inisialisasi variabel penampung
    const summary = {
      totalIdentifikasi: 0,
      totalDinilai: 0,
      totalDievaluasi: 0,
      belumDinilai: 0,
      belumDievaluasi: 0,
    };

    const daftarLaporan = [];

    // 2. Query Hybrid Berkelanjutan
    let query = `
      WITH latest_evaluasi AS (
        SELECT 
          risk_id, strategi, prioritas, justifikasi, evaluated_by, created_at,
          ROW_NUMBER() OVER (PARTITION BY risk_id ORDER BY created_at DESC) AS rn
        FROM evaluasi_resiko
      )
      SELECT 
        -- Data Identifikasi
        ir.id AS risk_id, 
        ir.nama_resiko, 
        ir.deskripsi,
        ir.root_cause,
        ir.consequences,
        ir.existing_controls,
        ir.status AS status_utama_risiko,
        ir.created_at AS tanggal_identifikasi,
        k.name AS kategori_name, 
        u_owner.username AS pemilik_risiko,
        
        -- Data Penilaian (Analisis)
        p.id AS penilaian_id,
        p.likelihood,
        p.impact,
        p.score AS risk_score,
        
        -- Data Evaluasi
        CASE 
          WHEN e.strategi = 'TREAT' THEN 'Mitigasi'
          WHEN e.strategi = 'TRANSFER' THEN 'Transfer'
          WHEN e.strategi = 'AVOID' THEN 'Hindari'
          WHEN e.strategi = 'ACCEPT' THEN 'Terima'
          ELSE NULL
        END as strategi,
        CASE 
          WHEN e.prioritas = '1' OR e.prioritas = 1 THEN 'Sangat Mendesak'
          WHEN e.prioritas = '2' OR e.prioritas = 2 THEN 'Penting'
          WHEN e.prioritas = '3' OR e.prioritas = 3 THEN 'Sedang'
          WHEN e.prioritas = '4' OR e.prioritas = 4 THEN 'Monitoring'
          ELSE '-'
        END as prioritas,
        e.justifikasi,
        u_eval.username AS nama_evaluator
      FROM identifikasi_resiko ir
      LEFT JOIN kategori_resiko k ON k.id = ir.kategori_id
      LEFT JOIN users u_owner ON ir.created_by_uuid = u_owner.id
      LEFT JOIN penilaian_resiko p ON p.risk_id = ir.id AND p.assessment_type = 'INHERENT'
      LEFT JOIN latest_evaluasi e ON e.risk_id = ir.id AND e.rn = 1
      LEFT JOIN users u_eval ON e.evaluated_by = u_eval.id
      WHERE (ir.status != 'Deleted' OR ir.status IS NULL)
    `;

    let params = [];

    if (filter?.created_by_uuid) {
      query += ` AND ir.created_by_uuid = $1`;
      params.push(filter.created_by_uuid);
    }

    query += ` ORDER BY p.score DESC NULLS LAST, ir.nama_resiko ASC`;

    console.log("📝 Query Laporan Profil Risiko Terpilih:", query);
    const result = await pool.query(query, params);

    // 3. Pemrosesan Data & Perhitungan Summary
    result.rows.forEach((row) => {
      summary.totalIdentifikasi++;

      const statusPenilaian = row.penilaian_id
        ? "SUDAH_DINILAI"
        : "BELUM_DINILAI";
      const statusEvaluasi = row.strategi
        ? "SUDAH_DIEVALUASI"
        : "BELUM_DIEVALUASI";

      if (row.penilaian_id) summary.totalDinilai++;
      else summary.belumDinilai++;

      if (row.strategi) summary.totalDievaluasi++;
      else summary.belumDievaluasi++;

      daftarLaporan.push({
        risk_id: row.risk_id,
        nama_resiko: row.nama_resiko,
        deskripsi: row.deskripsi || "-",
        penyebab: row.root_cause || "-",
        dampak: row.consequences || "-",
        kategori_name: row.kategori_name || "-",
        pengendalian: row.existing_controls || "-",
        pemilik_risiko: row.pemilik_risiko || "Belum ada pemilik",
        tanggal_identifikasi: row.tanggal_identifikasi,
        status_utama_risiko: row.status_utama_risiko,

        // Objek Analisis / Penilaian Sesuai 8 Poin
        analisis: {
          status: statusPenilaian,
          pemilik_risiko: row.pemilik_risiko || "Belum ada pemilik", // 1. Unit Kerja
          judul_risiko: row.nama_resiko, // 2. Judul Risiko
          kategori_risiko: row.kategori_name || "-",
          deskripsi: row.deskripsi || "-", // 3. Deskripsi Risiko
          penyebab: row.root_cause || "-", // 4. Penyebab
          dampak: row.consequences || "-", // 5. Dampak
          pengendalian: row.existing_controls || "-",
          likelihood: row.likelihood || null, // 6. Skor Kemungkinan
          impact: row.impact || null, // 7. Skor Dampak
          score: row.risk_score || null, // 8. Skor Risiko (6x7)
          tingkat_risiko: row.penilaian_id
            ? getRiskLevelLabel(row.risk_score)
            : "-",
        },

        // Objek Evaluasi
        evaluasi: row.strategi
          ? {
              status: statusEvaluasi,
              strategi: row.strategi,
              prioritas: row.prioritas || "-",
              justifikasi: row.justifikasi || "-",
              evaluator: row.nama_evaluator,
            }
          : {
              status: statusEvaluasi,
              keterangan:
                "Risiko belum dievaluasi atau belum ditentukan strategi mitigasinya.",
            },
      });
    });

    return {
      summary,
      daftarLaporan,
    };
  } catch (error) {
    console.error("❌ Error fetching risk profile report data:", error);
    throw error;
  }
};

// Report Data Perlakuan Risiko
exports.getPerlakuanReportData = async (filter) => {
  try {
    const pool = getPool();
    let params = [];
    let conditions = [];

    if (filter?.created_by_uuid) {
      params.push(filter.created_by_uuid);
      conditions.push(`i.created_by_uuid = $${params.length}`);
    }

    conditions.push(`UPPER(er.strategi) = 'TREAT'`);
    conditions.push(`p.assessment_type = 'INHERENT'`);
    conditions.push(`(i.status != 'Deleted' OR i.status IS NULL)`);

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        i.id AS risk_id,
        i.nama_resiko,
        i.deskripsi,
        i.status AS status_utama_risiko,
        i.created_at AS tanggal_identifikasi,
        k_cat.name AS kategori_name,
        u.username AS pemilik_risiko,
        p.score AS risk_score,
        er.strategi,
        COALESCE(
          (
            SELECT json_agg(
              jsonb_build_object(
                'id', kp.id,
                'nama_kontrol', kp.nama_kontrol,
                'tipe', kp.tipe,
                'deskripsi', kp.deskripsi,
                'actions', COALESCE(
                  (
                    SELECT json_agg(
                      jsonb_build_object(
                        'id', ak.id,
                        'action_plan', ak.action_plan,
                        'pic_name', ak.pic_name,
                        'target_date', ak.target_date,
                        'realisasi_date', ak.realisasi_date,
                        'status', ak.status,
                        'bukti_mitigasi', ak.bukti_mitigasi,
                        'kebutuhan_sumberdaya', ak.kebutuhan_sumberdaya
                      ) ORDER BY ak.created_at ASC
                    )
                    FROM action_kontrol ak
                    WHERE ak.kontrol_id = kp.id
                  ), '[]'::json
                )
              ) ORDER BY kp.created_at ASC
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
        WHERE is_active = true OR is_active IS NULL
        ORDER BY risk_id, created_at DESC
      ) er ON er.risk_id = i.id
      LEFT JOIN users u ON i.created_by_uuid = u.id
      ${whereClause}
      ORDER BY p.score DESC NULLS LAST, i.created_at DESC
    `;

    const result = await pool.query(query, params);
    const summary = {
      totalRisiko: result.rows.length,
      totalAktif: 0,
      totalSelesai: 0,
      totalKontrol: 0,
      totalTindakan: 0,
      tindakanSelesai: 0,
      tindakanOverdue: 0,
    };

    const daftarAktif = [];
    const daftarSelesai = [];
    const now = new Date();

    result.rows.forEach((row) => {
      let isClosed = ["Closed", "CLOSED", "DITUTUP", "Selesai"].includes(
        row.status_utama_risiko,
      );

      if (isClosed) summary.totalSelesai++;
      else summary.totalAktif++;

      const flattenedMitigasi = flattenMitigasiRows(row.list_kontrol, now);

      let totalKontrolRisk = Array.isArray(row.list_kontrol)
        ? row.list_kontrol.length
        : 0;
      let totalTindakanRisk = 0;
      let tindakanSelesaiRisk = 0;
      let hasOverdueAction = false;

      flattenedMitigasi.forEach((m) => {
        if (m.action_plan !== "Belum Ada Rencana Tindakan") {
          totalTindakanRisk++;
          if (m.is_done) tindakanSelesaiRisk++;
          if (m.has_overdue) {
            hasOverdueAction = true;
            summary.tindakanOverdue++;
          }
        }
      });

      summary.totalKontrol += totalKontrolRisk;
      summary.totalTindakan += totalTindakanRisk;
      summary.tindakanSelesai += tindakanSelesaiRisk;

      const progressPercent =
        totalTindakanRisk > 0
          ? Math.round((tindakanSelesaiRisk / totalTindakanRisk) * 100)
          : 0;

      let statusBatasWaktu = "Sesuai Jadwal";
      if (hasOverdueAction) statusBatasWaktu = "Terlambat";
      else if (
        totalTindakanRisk > 0 &&
        tindakanSelesaiRisk === totalTindakanRisk
      )
        statusBatasWaktu = "Tuntas";

      const itemLaporan = {
        risk_id: row.risk_id,
        judul_risiko: row.nama_resiko,
        unit_kerja: row.pemilik_risiko || "Belum ada pemilik",
        deskripsi_risiko: row.deskripsi || "-",
        kategori_risiko: row.kategori_name || "-",
        level_risiko: getRiskLevelLabel(row.risk_score),
        risk_score: row.risk_score,
        total_kontrol: totalKontrolRisk,
        total_tindakan: totalTindakanRisk,
        progress_tindakan: `${progressPercent}% (${tindakanSelesaiRisk}/${totalTindakanRisk})`,
        status_batas_waktu: statusBatasWaktu,
        has_overdue: hasOverdueAction,
        mitigasi_rows: flattenedMitigasi, // 🎯 DATA MENDATAR KESAMPING (Pengendalian | Tindakan | PIC | Target | Status | Realisasi | Bukti)
        status_utama: isClosed ? "Selesai" : "Aktif",
      };

      if (isClosed) daftarSelesai.push(itemLaporan);
      else daftarAktif.push(itemLaporan);
    });

    return { summary, daftarAktif, daftarSelesai };
  } catch (error) {
    console.error("❌ Error fetching perlakuan report data:", error);
    throw error;
  }
};

// Report Data Kejadian Risiko
exports.getKejadianReportData = async (tahun, bulan, filter) => {
  try {
    const pool = getPool();

    // 1. Ambil log master bulanan
    let logQuery = `
      SELECT l.*, u.username AS pelapor
      FROM log_risiko_bulanan l
      LEFT JOIN users u ON l.reported_by = u.id
      WHERE l.tahun = $1 AND l.bulan = $2
    `;
    let logParams = [tahun, bulan];

    if (filter?.created_by_uuid) {
      logQuery += ` AND l.reported_by = $3`;
      logParams.push(filter.created_by_uuid);
    }

    const logResult = await pool.query(logQuery, logParams);

    const logMaster = logResult.rows[0] || {
      id: null,
      tahun,
      bulan,
      status_laporan: "BELUM_DIISI",
      pelapor: null,
      reported_at: null,
    };

    const groupedKejadian = {};
    const listRisikoNihil = [];
    const listBelumDicatat = [];
    let totalKejadian = 0;

    // 2. JIKA STATUS LAPORAN INDUK ADALAH 'NIHIL' MURNI GLOBAL
    if (logMaster.status_laporan === "NIHIL") {
      let masterRisikoQuery = `
        SELECT 
          ir.id AS risk_id, ir.nama_resiko, ir.status AS status_utama_risiko,
          k.name AS kategori_name, u.username AS pemilik_risiko
        FROM identifikasi_resiko ir
        LEFT JOIN kategori_resiko k ON k.id = ir.kategori_id
        LEFT JOIN users u ON ir.created_by_uuid = u.id
        WHERE (ir.status != 'Deleted' OR ir.status IS NULL)
      `;
      let masterParams = [];
      if (filter?.created_by_uuid) {
        masterRisikoQuery += ` AND ir.created_by_uuid = $1`;
        masterParams.push(filter.created_by_uuid);
      }
      masterRisikoQuery += ` ORDER BY ir.nama_resiko ASC`;

      const masterRisikoResult = await pool.query(
        masterRisikoQuery,
        masterParams,
      );

      masterRisikoResult.rows.forEach((row) => {
        listRisikoNihil.push({
          risk_id: row.risk_id,
          nama_resiko: row.nama_resiko,
          kategori_name: row.kategori_name || "-",
          pemilik_risiko: row.pemilik_risiko || "Belum ada pemilik",
          status_pengisian: "NIHIL",
          is_nihil: true,
          keterangan_nihil: "Seluruh sistem dilaporkan NIHIL secara global.",
        });
      });
    } else {
      // 3. JIKA LAPORAN TERJADI RISIKO / KOMBINASI / BELUM DIISI
      let hybridQuery = `
        SELECT 
          ir.id AS risk_id, ir.nama_resiko, ir.status AS status_utama_risiko,
          k.name AS kategori_name, u.username AS pemilik_risiko,
          kd.id AS kejadian_id, kd.tanggal_kejadian, kd.sebab_saat_ini, kd.dampak_riil,
          kd.tindakan_lanjutan, kd.created_at AS kejadian_created_at,
          kd.is_nihil, kd.keterangan_nihil
        FROM identifikasi_resiko ir
        LEFT JOIN kategori_resiko k ON k.id = ir.kategori_id
        LEFT JOIN users u ON ir.created_by_uuid = u.id
        LEFT JOIN kejadian_risiko_detail kd ON kd.risk_id = ir.id 
          AND (kd.log_bulanan_id = $1 OR kd.log_bulanan_id IN (
            SELECT id FROM log_risiko_bulanan WHERE tahun = $2 AND bulan = $3
          ))
        WHERE (ir.status != 'Deleted' OR ir.status IS NULL)
      `;
      let params = [logMaster.id || null, tahun, bulan];

      if (filter?.created_by_uuid) {
        hybridQuery += ` AND ir.created_by_uuid = $${params.length + 1}`;
        params.push(filter.created_by_uuid);
      }

      hybridQuery += ` ORDER BY ir.nama_resiko ASC, kd.tanggal_kejadian DESC`;
      const hybridResult = await pool.query(hybridQuery, params);

      hybridResult.rows.forEach((row) => {
        // Kasus A: Risiko Memiliki Catatan Kejadian Aktual (is_nihil = false)
        if (row.kejadian_id && row.is_nihil === false) {
          totalKejadian++;
          if (!groupedKejadian[row.risk_id]) {
            groupedKejadian[row.risk_id] = {
              risk_id: row.risk_id,
              nama_resiko: row.nama_resiko,
              kategori_name: row.kategori_name || "-",
              pemilik_risiko: row.pemilik_risiko || "Belum ada pemilik",
              status_pengisian: "Terjadi Kejadian",
              insiden: [],
            };
          }
          groupedKejadian[row.risk_id].insiden.push({
            kejadian_id: row.kejadian_id,
            tanggal_kejadian: row.tanggal_kejadian,
            sebab_saat_ini: row.sebab_saat_ini || "-",
            dampak_riil: row.dampak_riil || "-",
            tindakan_lanjutan: row.tindakan_lanjutan || "-",
            created_at: row.kejadian_created_at,
          });
        }
        // Kasus B: Risiko Di-klik NIHIL oleh user (is_nihil = true)
        else if (row.kejadian_id && row.is_nihil === true) {
          if (!listRisikoNihil.some((n) => n.risk_id === row.risk_id)) {
            listRisikoNihil.push({
              risk_id: row.risk_id,
              nama_resiko: row.nama_resiko,
              kategori_name: row.kategori_name || "-",
              pemilik_risiko: row.pemilik_risiko || "Belum ada pemilik",
              status_pengisian: "NIHIL",
              is_nihil: true,
              keterangan_nihil:
                row.keterangan_nihil || "Dinyatakan NIHIL oleh unit pengisi.",
            });
          }
        }
        // Kasus C: Belum Diisi / Belum Melakukan Pencatatan
        else {
          if (!listBelumDicatat.some((b) => b.risk_id === row.risk_id)) {
            listBelumDicatat.push({
              risk_id: row.risk_id,
              nama_resiko: row.nama_resiko,
              kategori_name: row.kategori_name || "-",
              pemilik_risiko: row.pemilik_risiko || "Belum ada pemilik",
              status_pengisian: "Belum Mengisi",
              status_pencatatan: "Belum Melakukan Pencatatan",
            });
          }
        }
      });

      // Cleansing: Hapus dari listNihil / listBelum jika risiko terbukti punya insiden aktual
      Object.keys(groupedKejadian).forEach((activeRiskId) => {
        let idx = listRisikoNihil.findIndex((n) => n.risk_id === activeRiskId);
        if (idx !== -1) listRisikoNihil.splice(idx, 1);

        idx = listBelumDicatat.findIndex((b) => b.risk_id === activeRiskId);
        if (idx !== -1) listBelumDicatat.splice(idx, 1);
      });

      // Cleansing: Hapus dari listBelum jika risiko di-klik NIHIL
      listRisikoNihil.forEach((nihilItem) => {
        const idx = listBelumDicatat.findIndex(
          (b) => b.risk_id === nihilItem.risk_id,
        );
        if (idx !== -1) listBelumDicatat.splice(idx, 1);
      });
    }

    return {
      logMaster,
      totalKejadian,
      daftarKejadian: Object.values(groupedKejadian),
      daftarNihil: listRisikoNihil,
      daftarBelumDicatat: listBelumDicatat,
    };
  } catch (error) {
    console.error("❌ Error fetching kejadian report data:", error);
    throw error;
  }
};

// Report Data Analisis Residu Risiko
exports.getResiduReportData = async (filter) => {
  try {
    const pool = getPool();
    const currentYear = new Date().getFullYear();

    let params = [currentYear];
    let conditions = [];

    // Filter hak akses unit kerja
    if (filter?.created_by_uuid) {
      params.push(filter.created_by_uuid);
      conditions.push(`ir.created_by_uuid = $${params.length}`);
    }

    conditions.push(`(ir.status != 'Deleted' OR ir.status IS NULL)`);

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        ir.id AS risk_id,
        ir.nama_resiko,
        ir.deskripsi,
        ir.status AS status_utama_risiko,
        k.name AS kategori_name,
        u.username AS pemilik_risiko,
        
        -- Inherent Assessment (Before)
        pr_before.likelihood AS likelihood_before,
        pr_before.impact AS impact_before,
        pr_before.score AS inherent_score,
        
        -- Residual Assessment (After)
        pr_after.id AS assessment_after_id,
        pr_after.likelihood AS likelihood_after,
        pr_after.impact AS impact_after,
        pr_after.score AS score_after,

        -- Status Kejadian Risiko Tahun Ini
        COALESCE((
          SELECT COUNT(krd.id)
          FROM kejadian_risiko_detail krd
          JOIN log_risiko_bulanan lrb ON krd.log_bulanan_id = lrb.id
          WHERE krd.risk_id = ir.id AND lrb.tahun = $1 AND krd.is_nihil = false
        ), 0) AS total_kejadian

      FROM identifikasi_resiko ir
      LEFT JOIN kategori_resiko k ON k.id = ir.kategori_id
      LEFT JOIN users u ON ir.created_by_uuid = u.id
      LEFT JOIN penilaian_resiko pr_before ON pr_before.risk_id = ir.id AND pr_before.assessment_type = 'INHERENT'
      LEFT JOIN penilaian_resiko pr_after ON pr_after.risk_id = ir.id AND pr_after.assessment_type = 'RESIDUAL'
      ${whereClause}
      ORDER BY pr_before.score DESC NULLS LAST, ir.created_at DESC
    `;

    console.log("📝 Query Laporan Residu Risiko Executing...");
    const result = await pool.query(query, params);

    const summary = {
      totalRisiko: result.rows.length,
      sudahResidu: 0,
      belumResidu: 0,
      totalKejadianTahunIni: 0,
    };

    const daftarLaporan = [];

    result.rows.forEach((row) => {
      const isResiduEvaluated = Boolean(row.assessment_after_id);
      const kejadianCount = parseInt(row.total_kejadian || 0, 10);

      if (isResiduEvaluated) summary.sudahResidu++;
      else summary.belumResidu++;

      summary.totalKejadianTahunIni += kejadianCount;

      daftarLaporan.push({
        risk_id: row.risk_id,
        judul_risiko: row.nama_resiko,
        unit_kerja: row.pemilik_risiko || "Belum ada pemilik",
        deskripsi_risiko: row.deskripsi || "-",
        kategori_risiko: row.kategori_name || "-",

        // Before / Inherent Assessment
        before: {
          likelihood: row.likelihood_before || null,
          impact: row.impact_before || null,
          score: row.inherent_score || null,
          level: getRiskLevelLabel(row.inherent_score),
        },

        // After / Residual Assessment
        after: {
          is_evaluated: isResiduEvaluated,
          likelihood: row.likelihood_after || null,
          impact: row.impact_after || null,
          score: row.score_after || null,
          level: isResiduEvaluated ? getRiskLevelLabel(row.score_after) : "-",
        },

        total_kejadian: kejadianCount,
        status_kejadian:
          kejadianCount > 0 ? `${kejadianCount} Insiden` : "Nihil Kejadian",
        status_analisis_residu: isResiduEvaluated
          ? "Sudah Dianalisis"
          : "Belum Dianalisis",
      });
    });

    return {
      summary,
      daftarLaporan,
    };
  } catch (error) {
    console.error("❌ Error fetching residu report data:", error);
    throw error;
  }
};

// Report Data Profile Risiko
exports.getProfileReportData = async (filter) => {
  try {
    const pool = getPool();

    let params = [];
    let conditions = [];

    // Filter hak akses unit kerja jika bukan Admin
    if (filter?.created_by_uuid) {
      params.push(filter.created_by_uuid);
      conditions.push(`ir.created_by_uuid = $${params.length}`);
    }

    conditions.push(`(ir.status != 'Deleted' OR ir.status IS NULL)`);

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        pr.id AS profile_id,
        pr.risk_level,
        pr.assigned_at,
        ir.id AS risk_id,
        ir.nama_resiko,
        ir.deskripsi,
        ir.status AS status_utama_risiko,
        u.username AS pemilik_risiko,
        k.name AS kategori_name,
        
        -- Inherent Assessment (Skala Before)
        an.likelihood,
        an.impact,
        an.score AS risk_score,
        
        -- Evaluasi Risiko
        CASE 
          WHEN er.strategi = 'TREAT' THEN 'Mitigasi'
          WHEN er.strategi = 'TRANSFER' THEN 'Transfer'
          WHEN er.strategi = 'AVOID' THEN 'Hindari'
          WHEN er.strategi = 'ACCEPT' THEN 'Terima'
          ELSE '-'
        END as strategi,
        CASE 
          WHEN er.prioritas = '1' OR er.prioritas = 1 THEN 'Sangat Mendesak'
          WHEN er.prioritas = '2' OR er.prioritas = 2 THEN 'Penting'
          WHEN er.prioritas = '3' OR er.prioritas = 3 THEN 'Sedang'
          WHEN er.prioritas = '4' OR er.prioritas = 4 THEN 'Monitoring'
          ELSE '-'
        END as prioritas,

        -- Agregasi Kontrol Pengendalian dan Action Kontrol
        COALESCE(
          (
            SELECT json_agg(
              jsonb_build_object(
                'id', kp.id,
                'nama_kontrol', kp.nama_kontrol,
                'tipe', kp.tipe,
                'deskripsi', kp.deskripsi,
                'actions', COALESCE(
                  (
                    SELECT json_agg(
                      jsonb_build_object(
                        'id', ak.id,
                        'action_plan', ak.action_plan,
                        'pic_name', ak.pic_name,
                        'target_date', ak.target_date,
                        'realisasi_date', ak.realisasi_date,
                        'status', ak.status,
                        'bukti_mitigasi', ak.bukti_mitigasi
                      ) ORDER BY ak.created_at ASC
                    )
                    FROM action_kontrol ak
                    WHERE ak.kontrol_id = kp.id
                  ), '[]'::json
                )
              ) ORDER BY kp.created_at ASC
            )
            FROM kontrol_pengendalian kp
            WHERE kp.risk_id = ir.id
          ), '[]'::json
        ) AS list_kontrol

      FROM profile_risiko pr
      JOIN penilaian_resiko an ON pr.risk_analysis_id = an.id
      JOIN identifikasi_resiko ir ON an.risk_id = ir.id
      LEFT JOIN kategori_resiko k ON k.id = ir.kategori_id
      LEFT JOIN users u ON pr.owner_id = u.id
      LEFT JOIN (
        SELECT DISTINCT ON (risk_id) risk_id, strategi, prioritas
        FROM evaluasi_resiko
        WHERE is_active = true OR is_active IS NULL
        ORDER BY risk_id, created_at DESC
      ) er ON er.risk_id = ir.id
      ${whereClause}
      ORDER BY an.score DESC NULLS LAST, pr.assigned_at DESC
    `;

    console.log("📝 Query Laporan Profil Risiko Executing...");
    const result = await pool.query(query, params);

    const summary = {
      totalProfile: result.rows.length,
      totalKontrol: 0,
      totalTindakan: 0,
    };

    const daftarLaporan = [];
    const now = new Date();

    result.rows.forEach((row) => {
      const flattenedMitigasi = flattenMitigasiRows(row.list_kontrol, now);

      let totalKontrolRisk = Array.isArray(row.list_kontrol)
        ? row.list_kontrol.length
        : 0;
      let totalTindakanRisk = 0;

      flattenedMitigasi.forEach((m) => {
        if (m.action_plan !== "Belum Ada Rencana Tindakan") {
          totalTindakanRisk++;
        }
      });

      summary.totalKontrol += totalKontrolRisk;
      summary.totalTindakan += totalTindakanRisk;

      const statusText =
        row.status_utama_risiko === "Open"
          ? "Aktif"
          : row.status_utama_risiko === "On Progress"
            ? "Aktif Kembali"
            : "Selesai";

      daftarLaporan.push({
        profile_id: row.profile_id,
        risk_id: row.risk_id,
        judul_risiko: row.nama_resiko,
        unit_kerja: row.pemilik_risiko || "Belum ada pemilik",
        deskripsi_risiko: row.deskripsi || "-",
        status_risiko: statusText,
        kategori_risiko: row.kategori_name || "-",

        before: {
          likelihood: row.likelihood || null,
          impact: row.impact || null,
          score: row.risk_score || null,
          level: getRiskLevelLabel(row.risk_score),
        },

        strategi: row.strategi,
        prioritas: row.prioritas,
        tanggal_profile: row.assigned_at ? formatDate(row.assigned_at) : "-",
        total_kontrol: totalKontrolRisk,
        total_tindakan: totalTindakanRisk,
        mitigasi_rows: flattenedMitigasi,
      });
    });

    return {
      summary,
      daftarLaporan,
    };
  } catch (error) {
    console.error("❌ Error fetching profile report data:", error);
    throw error;
  }
};

// =========================================================================
// GENERATE EXCEL START UNTUK IDENTIFIKASI, ANALISIS, DAN EVALUASI RISIKO
// =========================================================================

const applyCommonExcelStyles = (sheet, titleText, headersCount) => {
  const lastColumnLetter = String.fromCharCode(64 + headersCount);

  sheet.mergeCells(`A1:${lastColumnLetter}1`);
  const titleCell = sheet.getCell("A1");
  titleCell.value = titleText.toUpperCase();
  titleCell.font = { size: 11, bold: true, color: { argb: "FFFFFF" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "1E3A8A" },
  }; // Deep Royal Blue
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 30;

  sheet.getCell("A3").value = "Dicetak Tanggal:";
  sheet.getCell("B3").value = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  sheet.getCell("A3").font = { bold: true };
  sheet.addRow([]);
};

const styleExcelHeader = (headerRow) => {
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFF" }, size: 9.5 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "475569" },
    }; // Slate Gray
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
};

// 1. Excel Identifikasi Risiko
exports.generateIdentifikasiExcel = async (res, reportData) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Identifikasi Risiko");

  // Dilebarkan ke 9 Kolom (A - I)
  applyCommonExcelStyles(sheet, "Laporan Hasil Identifikasi Risiko Kerja", 9);
  sheet.getCell("A4").value = "Total Risiko:";
  sheet.getCell("B4").value = `${reportData.summary.totalIdentifikasi} Risiko`;
  sheet.getCell("A4").font = { bold: true };

  const headerRow = sheet.addRow([
    "No",
    "Unit Kerja",
    "Judul Risiko",
    "Kategori Risiko",
    "Deskripsi Risiko",
    "Penyebab",
    "Dampak",
    "Pengendalian yang Ada",
    "Tanggal Identifikasi",
    "Status",
  ]);
  styleExcelHeader(headerRow);

  reportData.daftarLaporan.forEach((row, idx) => {
    const r = sheet.addRow([
      idx + 1,
      row.pemilik_risiko,
      row.nama_resiko,
      row.kategori_name,
      row.deskripsi,
      row.penyebab,
      row.dampak,
      row.pengendalian,
      row.tanggal_identifikasi ? formatDate(row.tanggal_identifikasi) : "-",
      row.status_utama_risiko === "Open"
        ? "Aktif"
        : row.status_utama_risiko === "On Progress"
          ? "Aktif Kembali"
          : "Selesai",
    ]);

    // Align Top Semua Sel
    r.getCell(1).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(2).alignment = { vertical: "top" };
    r.getCell(3).alignment = { wrapText: true, vertical: "top" };
    r.getCell(4).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(5).alignment = { wrapText: true, vertical: "top" };
    r.getCell(6).alignment = { wrapText: true, vertical: "top" };
    r.getCell(7).alignment = { wrapText: true, vertical: "top" };
    r.getCell(8).alignment = { wrapText: true, vertical: "top" };
    r.getCell(9).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(10).alignment = { horizontal: "center", vertical: "top" };
  });

  sheet.columns = [
    { width: 5 }, // No
    { width: 22 }, // Pemilik
    { width: 28 }, // Judul
    { width: 18 }, // Kategori
    { width: 32 }, // Deskripsi
    { width: 32 }, // Penyebab
    { width: 32 }, // Dampak
    { width: 18 }, // Tanggal
    { width: 15 }, // Status
  ];

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="laporan-identifikasi-risiko.xlsx"',
  );
  await workbook.xlsx.write(res);
  res.end();
};

// 2. Excel Analisis / Penilaian Risiko (Dengan Indikator Tingkat Risiko)
exports.generateAnalisisExcel = async (res, reportData) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Analisis Risiko");

  // Apply styles dilebarkan ke 11 kolom (A sampai K)
  applyCommonExcelStyles(
    sheet,
    "Laporan Analisis & Penilaian Risiko (Inherent)",
    11, // 11 Kolom (A - K)
  );

  sheet.getCell("A4").value = "Sudah Dinilai:";
  sheet.getCell("B4").value = `${reportData.summary.totalDinilai} Risiko`;
  sheet.getCell("C4").value = "Belum Dinilai:";
  sheet.getCell("D4").value = `${reportData.summary.belumDinilai} Risiko`;
  ["A4", "C4"].forEach((c) => (sheet.getCell(c).font = { bold: true }));

  // Headers Lengkap (11 Kolom)
  const headerRow = sheet.addRow([
    "No",
    "Unit Kerja",
    "Judul Risiko",
    "Kategori Risiko",
    "Deskripsi Risiko",
    "Penyebab",
    "Dampak",
    "Pengendalian yang Ada",
    "Skor Kemungkinan",
    "Skor Dampak",
    "Skor Risiko",
  ]);
  styleExcelHeader(headerRow);

  reportData.daftarLaporan.forEach((row, idx) => {
    const r = sheet.addRow([
      idx + 1,
      row.analisis.pemilik_risiko, // 1. Unit Kerja
      row.analisis.judul_risiko, // 2. Judul Risiko
      row.analisis.kategori_risiko, // 3. Kategori Risiko
      row.analisis.deskripsi, // 4. Deskripsi Risiko
      row.analisis.penyebab, // 5. Penyebab
      row.analisis.dampak, // 6. Dampak
      row.analisis.pengendalian, // 7. Pengendalian
      row.analisis.likelihood || "-", // 8. Skor Kemungkinan
      row.analisis.impact || "-", // 9. Skor Dampak
      row.analisis.score
        ? `${row.analisis.score} (${row.analisis.tingkat_risiko})`
        : "-", // 10. Skor Risiko
    ]);

    // Format Alignment Sel
    r.getCell(1).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(2).alignment = { vertical: "top" };
    r.getCell(3).alignment = { wrapText: true, vertical: "top" };
    r.getCell(4).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(5).alignment = { wrapText: true, vertical: "top" };
    r.getCell(6).alignment = { wrapText: true, vertical: "top" };
    r.getCell(7).alignment = { wrapText: true, vertical: "top" };
    r.getCell(8).alignment = { wrapText: true, vertical: "top" };
    ["9", "10", "11"].forEach((cIdx) => {
      r.getCell(parseInt(cIdx)).alignment = {
        horizontal: "center",
        vertical: "top",
      };
    });

    // Indikator Warna Skor Risiko pada Kolom 11 (K)
    if (row.analisis.score) {
      let color = "FEF08A"; // Yellow / MEDIUM
      if (row.analisis.tingkat_risiko === "HIGH") color = "FCA5A5"; // Red / HIGH
      if (row.analisis.tingkat_risiko === "LOW") color = "BBF7D0"; // Green / LOW

      r.getCell(11).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: color },
      };
      r.getCell(11).font = { bold: true };
    }
  });

  // Lebar Kolom Proposional
  sheet.columns = [
    { width: 5 }, // No
    { width: 22 }, // Unit Kerja
    { width: 26 }, // Judul Risiko
    { width: 18 }, // Kategori Risiko
    { width: 30 }, // Deskripsi
    { width: 30 }, // Penyebab
    { width: 30 }, // Dampak
    { width: 30 }, // Pengendalian
    { width: 16 }, // Likelihood
    { width: 14 }, // Impact
    { width: 16 }, // Skor Risiko
  ];

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="laporan-analisis-risiko.xlsx"',
  );
  await workbook.xlsx.write(res);
  res.end();
};

// 3. Excel Evaluasi Risiko
exports.generateEvaluasiExcel = async (res, reportData) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Evaluasi Risiko");

  applyCommonExcelStyles(
    sheet,
    "Laporan Evaluasi & Strategi Mitigasi Risiko",
    8,
  );

  const headerRow = sheet.addRow([
    "No",
    "Nama Risiko Utama",
    "Kategori Risiko",
    "Pemilik Risiko",
    "Status Mitigasi",
    "Strategi Penanganan",
    "Prioritas",
    "Justifikasi / Tindak Lanjut",
  ]);
  styleExcelHeader(headerRow);

  reportData.daftarLaporan.forEach((row, idx) => {
    const isEval = row.evaluasi.status === "SUDAH_DIEVALUASI";
    const r = sheet.addRow([
      idx + 1,
      row.nama_resiko,
      row.kategori_name,
      row.pemilik_risiko,
      isEval ? "Mitigasi Siap" : "Belum Evaluasi",
      row.evaluasi.strategi || "-",
      row.evaluasi.prioritas || "-",
      row.evaluasi.justifikasi || row.evaluasi.keterangan,
    ]);

    // 🎯 PERBAIKAN: Semua sel di-set vertical 'top'
    r.getCell(1).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    r.getCell(3).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(4).alignment = { vertical: "top" };
    r.getCell(5).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(6).alignment = { wrapText: true, vertical: "top" };
    r.getCell(7).alignment = { horizontal: "center", vertical: "top" };
    r.getCell(8).alignment = { wrapText: true, vertical: "top" };

    if (!isEval) {
      r.getCell(5).font = { italic: true, color: { argb: "94A3B8" } };
    }
  });

  sheet.columns = [
    { width: 5 }, // No
    { width: 32 }, // Judul
    { width: 18 }, // Kategori
    { width: 22 }, // Pemilik
    { width: 16 }, // Status
    { width: 22 }, // Strategi
    { width: 18 }, // Prioritas
    { width: 45 }, // Justifikasi
  ];

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="laporan-evaluasi-risiko.xlsx"',
  );
  await workbook.xlsx.write(res);
  res.end();
};

// 4. Excel Perlakuan Risiko
exports.generatePerlakuanExcel = async (res, reportData) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Perlakuan Risiko");

  // Title Banner (15 Kolom A - O)
  applyCommonExcelStyles(
    sheet,
    "Laporan Pemantauan Perlakuan & Mitigasi Risiko Mendetail",
    15,
  );

  sheet.getCell("A4").value = "Total Mitigasi Risiko:";
  sheet.getCell("B4").value = `${reportData.summary.totalRisiko} Risiko`;
  sheet.getCell("D4").value = "Total Pengendalian:";
  sheet.getCell("E4").value = `${reportData.summary.totalKontrol} Pengendalian`;
  sheet.getCell("G4").value = "Total Action Plan:";
  sheet.getCell("H4").value = `${reportData.summary.totalTindakan} Tindakan`;

  sheet.getCell("A5").value = "Risiko Aktif:";
  sheet.getCell("B5").value = `${reportData.summary.totalAktif} Risiko`;
  sheet.getCell("D5").value = "Risiko Selesai:";
  sheet.getCell("E5").value = `${reportData.summary.totalSelesai} Risiko`;
  sheet.getCell("G5").value = "Tindakan Terlambat:";
  sheet.getCell("H5").value = `${reportData.summary.tindakanOverdue} Terlambat`;

  ["A4", "D4", "G4", "A5", "D5", "G5"].forEach(
    (c) => (sheet.getCell(c).font = { bold: true }),
  );
  sheet.addRow([]);

  // Header 15 Kolom
  const headers = [
    "No",
    "Judul Risiko",
    "Unit Kerja",
    "Deskripsi Risiko",
    "Kategori",
    "Level Risiko",
    "Progress",
    "Status Jadwal",
    "Pengendalian", // 👈 Kolom Mendatar
    "Rencana Tindakan", // 👈 Kolom Mendatar
    "PIC", // 👈 Kolom Mendatar
    "Target Date", // 👈 Kolom Mendatar
    "Status Tindakan", // 👈 Kolom Mendatar
    "Realisasi Date", // 👈 Kolom Mendatar
    "Bukti Mitigasi", // 👈 Kolom Mendatar
  ];

  const renderTable = (titleTable, dataList) => {
    const subHeaderRow = sheet.addRow([titleTable]);
    sheet.mergeCells(`A${subHeaderRow.number}:O${subHeaderRow.number}`);
    const cell = sheet.getCell(`A${subHeaderRow.number}`);
    cell.font = { bold: true, color: { argb: "FFFFFF" }, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "1E3A8A" },
    };
    cell.alignment = { vertical: "middle", indent: 1 };
    subHeaderRow.height = 22;

    const hRow = sheet.addRow(headers);
    styleExcelHeader(hRow);

    if (dataList.length === 0) {
      const emptyRow = sheet.addRow([
        "Data kosong / Tidak ada risiko pada bagian ini.",
      ]);
      sheet.mergeCells(`A${emptyRow.number}:O${emptyRow.number}`);
      sheet.getCell(`A${emptyRow.number}`).alignment = { horizontal: "center" };
    } else {
      let noCounter = 1;
      dataList.forEach((risk) => {
        const startRowNumber = sheet.lastRow.number + 1;
        const mitigasiList = risk.mitigasi_rows;

        mitigasiList.forEach((m) => {
          const r = sheet.addRow([
            noCounter,
            risk.judul_risiko,
            risk.unit_kerja,
            risk.deskripsi_risiko,
            risk.kategori_risiko,
            `${risk.risk_score || "-"} (${risk.level_risiko})`,
            risk.progress_tindakan,
            risk.status_batas_waktu,
            m.nama_kontrol, // 👈
            m.action_plan, // 👈
            m.pic_name, // 👈
            m.target_date, // 👈
            m.status_action, // 👈
            m.realisasi_date, // 👈
            m.bukti_mitigasi, // 👈
          ]);

          r.eachCell(
            (c) => (c.alignment = { vertical: "top", wrapText: true }),
          );
          ["1", "6", "7", "8", "11", "12", "13", "14"].forEach((cIdx) => {
            r.getCell(parseInt(cIdx)).alignment = {
              horizontal: "center",
              vertical: "top",
            };
          });

          if (m.has_overdue) {
            r.getCell(13).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FCA5A5" },
            };
          }
        });

        const endRowNumber = sheet.lastRow.number;

        // Merge Vertikal Kolom Risiko (A-H) jika 1 Risiko memiliki banyak baris mitigasi
        if (endRowNumber > startRowNumber) {
          for (let colIdx = 1; colIdx <= 8; colIdx++) {
            const colLetter = String.fromCharCode(64 + colIdx);
            sheet.mergeCells(
              `${colLetter}${startRowNumber}:${colLetter}${endRowNumber}`,
            );
          }
        }

        noCounter++;
      });
    }

    sheet.addRow([]);
  };

  renderTable("A. RISIKO AKTIF DALAM MITIGASI", reportData.daftarAktif);
  renderTable(
    "B. RIWAYAT RISIKO MITIGASI SELESAI (CLOSED)",
    reportData.daftarSelesai,
  );

  sheet.columns = [
    { width: 5 }, // No
    { width: 25 }, // Judul
    { width: 18 }, // Unit Kerja
    { width: 25 }, // Deskripsi
    { width: 16 }, // Kategori
    { width: 14 }, // Level
    { width: 16 }, // Progress
    { width: 16 }, // Status Jadwal
    { width: 30 }, // Pengendalian
    { width: 32 }, // Action Plan
    { width: 18 }, // PIC
    { width: 14 }, // Target
    { width: 16 }, // Status
    { width: 14 }, // Realisasi
    { width: 25 }, // Bukti
  ];

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="laporan-perlakuan-risiko.xlsx"',
  );
  await workbook.xlsx.write(res);
  res.end();
};

// 5. Excel Analisis Residu Risiko
exports.generateResiduExcel = async (res, reportData) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Analisis Residu Risiko");

  // Title Banner (12 Kolom A - L)
  applyCommonExcelStyles(
    sheet,
    "Laporan Analisis & Evaluasi Risiko Residu (Post-Mitigasi)",
    12,
  );

  // Summary Metadata Header
  sheet.getCell("A4").value = "Total Risiko:";
  sheet.getCell("B4").value = `${reportData.summary.totalRisiko} Risiko`;
  sheet.getCell("D4").value = "Sudah Dianalisis Residu:";
  sheet.getCell("E4").value = `${reportData.summary.sudahResidu} Risiko`;

  sheet.getCell("A5").value = "Belum Dianalisis Residu:";
  sheet.getCell("B5").value = `${reportData.summary.belumResidu} Risiko`;
  sheet.getCell("D5").value = "Total Kejadian (Tahun Ini):";
  sheet.getCell("E5").value =
    `${reportData.summary.totalKejadianTahunIni} Insiden`;

  ["A4", "D4", "A5", "D5"].forEach(
    (c) => (sheet.getCell(c).font = { bold: true }),
  );

  sheet.addRow([]); // Spacer

  const headers = [
    "No",
    "Judul Risiko",
    "Unit Kerja",
    "Deskripsi Risiko",
    "Kategori Risiko",
    "Kemungkinan (Inherent)",
    "Dampak (Inherent)",
    "Skor Inherent (Before)",
    "Kemungkinan (Residual)",
    "Dampak (Residual)",
    "Skor Residual (After)",
    "Kejadian (Tahun Ini)",
    "Status Residu",
  ];

  const headerRow = sheet.addRow(headers);
  styleExcelHeader(headerRow);

  reportData.daftarLaporan.forEach((row, idx) => {
    const r = sheet.addRow([
      idx + 1,
      row.judul_risiko,
      row.unit_kerja,
      row.deskripsi_risiko,
      row.kategori_risiko,
      row.before.likelihood || "-",
      row.before.impact || "-",
      row.before.score ? `${row.before.score} (${row.before.level})` : "-",
      row.after.likelihood || "-",
      row.after.impact || "-",
      row.after.score ? `${row.after.score} (${row.after.level})` : "-",
      row.status_kejadian,
      row.status_analisis_residu,
    ]);

    r.eachCell((c) => (c.alignment = { vertical: "top", wrapText: true }));
    r.getCell(1).alignment = { horizontal: "center", vertical: "top" };
    ["6", "7", "8", "9", "10", "11", "12", "13"].forEach((cIdx) => {
      r.getCell(parseInt(cIdx)).alignment = {
        horizontal: "center",
        vertical: "top",
      };
    });

    // Color Fill untuk Inherent Score
    if (row.before.score) {
      r.getCell(8).font = { bold: true };
    }

    // Color Fill untuk Residual Score
    if (row.after.score) {
      r.getCell(11).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "BBF7D0" }, // Soft Green Indikator Penurunan Risiko
      };
      r.getCell(11).font = { bold: true, color: { argb: "15803D" } };
    } else {
      r.getCell(13).font = { italic: true, color: { argb: "94A3B8" } };
    }
  });

  sheet.columns = [
    { width: 5 }, // No
    { width: 28 }, // Judul
    { width: 20 }, // Unit Kerja
    { width: 30 }, // Deskripsi
    { width: 18 }, // Kategori
    { width: 14 }, // L Before
    { width: 14 }, // I Before
    { width: 18 }, // Score Before
    { width: 14 }, // L After
    { width: 14 }, // I After
    { width: 18 }, // Score After
    { width: 18 }, // Kejadian
    { width: 18 }, // Status
  ];

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="laporan-analisis-residu-risiko.xlsx"',
  );
  await workbook.xlsx.write(res);
  res.end();
};

// 6. Excel Profile Risiko
exports.generateProfileExcel = async (res, reportData) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Profil Risiko Utama");

  applyCommonExcelStyles(
    sheet,
    "Laporan Register Profil Risiko Utama Organisasi Mendetail",
    19, // 19 Kolom A - S
  );

  sheet.getCell("A4").value = "Total Profil Risiko:";
  sheet.getCell("B4").value = `${reportData.summary.totalProfile} Item`;
  sheet.getCell("D4").value = "Total Pengendalian:";
  sheet.getCell("E4").value = `${reportData.summary.totalKontrol} Pengendalian`;
  sheet.getCell("G4").value = "Total Action Plan:";
  sheet.getCell("H4").value = `${reportData.summary.totalTindakan} Tindakan`;

  ["A4", "D4", "G4"].forEach((c) => (sheet.getCell(c).font = { bold: true }));
  sheet.addRow([]);

  const headers = [
    "No",
    "Judul Risiko",
    "Unit Kerja",
    "Deskripsi Risiko",
    "Status Risiko",
    "Kategori",
    "Likelihood (Inherent)",
    "Impact (Inherent)",
    "Skor Inherent",
    "Strategi",
    "Prioritas",
    "Tgl Masuk Profil",
    "Pengendalian", // 👈
    "Rencana Tindakan", // 👈
    "PIC", // 👈
    "Target Date", // 👈
    "Status Tindakan", // 👈
    "Realisasi Date", // 👈
    "Bukti Mitigasi", // 👈
  ];

  const headerRow = sheet.addRow(headers);
  styleExcelHeader(headerRow);

  let noCounter = 1;
  reportData.daftarLaporan.forEach((risk) => {
    const startRowNumber = sheet.lastRow.number + 1;
    const mitigasiList = risk.mitigasi_rows;

    mitigasiList.forEach((m) => {
      const r = sheet.addRow([
        noCounter,
        risk.judul_risiko,
        risk.unit_kerja,
        risk.deskripsi_risiko,
        risk.status_risiko,
        risk.kategori_risiko,
        risk.before.likelihood || "-",
        risk.before.impact || "-",
        risk.before.score ? `${risk.before.score} (${risk.before.level})` : "-",
        risk.strategi,
        risk.prioritas,
        risk.tanggal_profile,
        m.nama_kontrol, // 👈
        m.action_plan, // 👈
        m.pic_name, // 👈
        m.target_date, // 👈
        m.status_action, // 👈
        m.realisasi_date, // 👈
        m.bukti_mitigasi, // 👈
      ]);

      r.eachCell((c) => (c.alignment = { vertical: "top", wrapText: true }));
      [
        "1",
        "5",
        "7",
        "8",
        "9",
        "10",
        "11",
        "12",
        "15",
        "16",
        "17",
        "18",
      ].forEach((cIdx) => {
        r.getCell(parseInt(cIdx)).alignment = {
          horizontal: "center",
          vertical: "top",
        };
      });

      if (risk.before.score) {
        let color = "FEF08A";
        if (risk.before.level === "Ekstrim" || risk.before.level === "Tinggi")
          color = "FCA5A5";
        if (risk.before.level === "Rendah") color = "BBF7D0";

        r.getCell(9).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: color },
        };
        r.getCell(9).font = { bold: true };
      }
    });

    const endRowNumber = sheet.lastRow.number;

    if (endRowNumber > startRowNumber) {
      for (let colIdx = 1; colIdx <= 12; colIdx++) {
        const colLetter = String.fromCharCode(64 + colIdx);
        sheet.mergeCells(
          `${colLetter}${startRowNumber}:${colLetter}${endRowNumber}`,
        );
      }
    }

    noCounter++;
  });

  sheet.columns = [
    { width: 5 }, // No
    { width: 25 }, // Judul
    { width: 18 }, // Unit Kerja
    { width: 25 }, // Deskripsi
    { width: 14 }, // Status
    { width: 16 }, // Kategori
    { width: 12 }, // L
    { width: 12 }, // I
    { width: 16 }, // Inherent
    { width: 14 }, // Strategi
    { width: 16 }, // Prioritas
    { width: 16 }, // Tgl Profil
    { width: 28 }, // Pengendalian
    { width: 30 }, // Action Plan
    { width: 16 }, // PIC
    { width: 14 }, // Target
    { width: 15 }, // Status
    { width: 14 }, // Realisasi
    { width: 22 }, // Bukti
  ];

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="laporan-profile-risiko.xlsx"',
  );
  await workbook.xlsx.write(res);
  res.end();
};

// 7. Excel Kejadian Risiko
exports.generateKejadianRisikoExcel = async (
  res,
  logMaster,
  totalKejadian,
  daftarKejadian,
  daftarNihil,
  daftarBelumDicatat,
  namaBulanStr,
  bulan,
  tahun,
) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Laporan ${getNamaBulan(bulan)}`);

  // Meta Header Banner (Kolom A - I)
  sheet.mergeCells("A1:I1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `LAPORAN BULANAN PENCATATAN KEJADIAN RISIKO (${namaBulanStr} ${tahun})`;
  titleCell.font = { size: 11, bold: true, color: { argb: "FFFFFF" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "9C0006" },
  };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;

  sheet.getCell("A3").value = "Periode Laporan:";
  sheet.getCell("B3").value = `${getNamaBulan(bulan)} ${tahun}`;
  sheet.getCell("A4").value = "Status Dokumen:";
  sheet.getCell("B4").value = logMaster.status_laporan;
  sheet.getCell("A5").value = "Total Insiden Aktual:";
  sheet.getCell("B5").value = `${totalKejadian} Kejadian`;
  ["A3", "A4", "A5"].forEach((c) => (sheet.getCell(c).font = { bold: true }));

  sheet.addRow([]);

  // ==========================================
  // TABEL A: DAFTAR INSIDEN / KEJADIAN AKTUAL
  // ==========================================
  const headersA = [
    "No",
    "Nama Risiko Utama",
    "Kategori Risiko",
    "Unit Kerja",
    "Tanggal Kejadian", // 👈 Kolom Terpisah
    "Status Pengisian", // 👈 Kolom Terpisah
    "Sebab Saat Ini",
    "Dampak Riil",
    "Tindakan Lanjutan", // 👈 Header Khusus Kejadian
  ];

  const subA = sheet.addRow(["A. DAFTAR INSIDEN / KEJADIAN AKTUAL"]);
  sheet.mergeCells(`A${subA.number}:I${subA.number}`);
  subA.getCell(1).font = { bold: true, color: { argb: "FFFFFF" } };
  subA.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "1F4E78" },
  };

  const hRowA = sheet.addRow(headersA);
  styleExcelHeader(hRowA);

  let globalNo = 1;

  if (daftarKejadian.length === 0) {
    const emptyRow = sheet.addRow([
      "Nihil. Tidak ada temuan insiden aktual pada bulan ini.",
    ]);
    sheet.mergeCells(`A${emptyRow.number}:I${emptyRow.number}`);
    sheet.getCell(`A${emptyRow.number}`).alignment = { horizontal: "center" };
    sheet.getCell(`A${emptyRow.number}`).font = {
      italic: true,
      color: { argb: "64748B" },
    };
  } else {
    daftarKejadian.forEach((group) => {
      group.insiden.forEach((insiden) => {
        const r = sheet.addRow([
          globalNo++,
          group.nama_resiko,
          group.kategori_name,
          group.pemilik_risiko,
          insiden.tanggal_kejadian ? formatDate(insiden.tanggal_kejadian) : "-",
          "Terjadi Kejadian",
          insiden.sebab_saat_ini || "-",
          insiden.dampak_riil || "-",
          insiden.tindakan_lanjutan || "-",
        ]);
        r.eachCell((c) => (c.alignment = { vertical: "top", wrapText: true }));
        r.getCell(1).alignment = { horizontal: "center", vertical: "top" };
        r.getCell(5).alignment = { horizontal: "center", vertical: "top" };
        r.getCell(6).alignment = { horizontal: "center", vertical: "top" };
        r.getCell(6).font = { bold: true, color: { argb: "B91C1C" } };
      });
    });
  }

  sheet.addRow([]);

  // ==========================================
  // TABEL B: KONFIRMASI NIHIL KEJADIAN
  // ==========================================
  const headersB = [
    "No",
    "Nama Risiko Utama",
    "Kategori Risiko",
    "Unit Kerja",
    "Tanggal Kejadian",
    "Status Pengisian",
    "Sebab Saat Ini",
    "Dampak Riil",
    "Keterangan / Evaluasi Kendali Nihil", // 👈 Header Khusus Nihil
  ];

  const subB = sheet.addRow([
    "B. DAFTAR RISIKO DENGAN KONFIRMASI NIHIL KEJADIAN",
  ]);
  sheet.mergeCells(`A${subB.number}:I${subB.number}`);
  subB.getCell(1).font = { bold: true, color: { argb: "FFFFFF" } };
  subB.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "15803D" },
  };

  const hRowB = sheet.addRow(headersB);
  styleExcelHeader(hRowB);

  if (daftarNihil.length === 0) {
    const emptyRow = sheet.addRow([
      "Tidak ada risiko yang di-konfirmasi NIHIL.",
    ]);
    sheet.mergeCells(`A${emptyRow.number}:I${emptyRow.number}`);
    sheet.getCell(`A${emptyRow.number}`).alignment = { horizontal: "center" };
  } else {
    let noB = 1;
    daftarNihil.forEach((nihil) => {
      const r = sheet.addRow([
        noB++,
        nihil.nama_resiko,
        nihil.kategori_name,
        nihil.pemilik_risiko,
        "-",
        "NIHIL",
        "-",
        "-",
        nihil.keterangan_nihil || "Dinyatakan NIHIL oleh unit pengisi.",
      ]);
      r.eachCell((c) => (c.alignment = { vertical: "top", wrapText: true }));
      r.getCell(1).alignment = { horizontal: "center", vertical: "top" };
      r.getCell(5).alignment = { horizontal: "center", vertical: "top" };
      r.getCell(6).alignment = { horizontal: "center", vertical: "top" };
      r.getCell(6).font = { italic: true, color: { argb: "15803D" } };
    });
  }

  sheet.addRow([]);

  // ==========================================
  // TABEL C: BELUM MELAKUKAN PENCATATAN (ABSENSI)
  // ==========================================
  const subC = sheet.addRow([
    "C. DAFTAR RISIKO UNIT YANG BELUM MELAKUKAN PENCATATAN KEJADIAN",
  ]);
  sheet.mergeCells(`A${subC.number}:I${subC.number}`);
  subC.getCell(1).font = { bold: true, color: { argb: "FFFFFF" } };
  subC.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "B91C1C" },
  };

  const hRowC = sheet.addRow(headersB); // Menggunakan Header B (Evaluasi Kendali Nihil)
  styleExcelHeader(hRowC);

  if (daftarBelumDicatat.length === 0) {
    const emptyRow = sheet.addRow([
      "Seluruh unit kerja telah tuntas mengisi pencatatan bulan ini.",
    ]);
    sheet.mergeCells(`A${emptyRow.number}:I${emptyRow.number}`);
    sheet.getCell(`A${emptyRow.number}`).alignment = { horizontal: "center" };
  } else {
    let noC = 1;
    daftarBelumDicatat.forEach((belum) => {
      const r = sheet.addRow([
        noC++,
        belum.nama_resiko,
        belum.kategori_name,
        belum.pemilik_risiko,
        "-",
        "Belum Mengisi",
        "-",
        "-",
        "Unit belum melakukan konfirmasi pencatatan/NIHIL pada bulan ini.",
      ]);
      r.eachCell((c) => (c.alignment = { vertical: "top", wrapText: true }));
      r.getCell(1).alignment = { horizontal: "center", vertical: "top" };
      r.getCell(5).alignment = { horizontal: "center", vertical: "top" };
      r.getCell(6).alignment = { horizontal: "center", vertical: "top" };
      r.getCell(6).font = { italic: true, color: { argb: "B91C1C" } };
      r.getCell(9).font = { italic: true, color: { argb: "B91C1C" } };
    });
  }

  sheet.columns = [
    { width: 5 }, // No
    { width: 30 }, // Judul
    { width: 16 }, // Kategori
    { width: 20 }, // Pemilik
    { width: 16 }, // Tgl Kejadian
    { width: 16 }, // Status Pengisian
    { width: 28 }, // Sebab
    { width: 28 }, // Dampak
    { width: 35 }, // Tindakan / Ket Nihil
  ];

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="laporan-kejadian-risiko-${tahun}-${bulan}.xlsx"`,
  );
  await workbook.xlsx.write(res);
  res.end();
};

// =========================================================================
// GENERATE EXCEL END UNTUK IDENTIFIKASI, ANALISIS, DAN EVALUASI RISIKO
// =========================================================================

// =========================================================================
// GENERATE PDF START UNTUK IDENTIFIKASI, ANALISIS, DAN EVALUASI RISIKO
// =========================================================================

// =========================================================================
// HELPER GLOBAL UNTUK MENGGAMBAR KOP/HEADER UTAMA DOKUMEN
// =========================================================================
const drawPdfHeaderBanner = (
  doc,
  titleText,
  fullWidth,
  summaryLabels,
  rightText = "",
) => {
  doc.rect(30, 30, fullWidth, 40).fill("#1E3A8A");
  doc
    .fillColor("#FFFFFF")
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(titleText.toUpperCase(), 30, 44, {
      align: "center",
      width: fullWidth,
    });

  doc.fillColor("#334155").fontSize(9).font("Helvetica");
  let currentMetaY = 85;

  doc.text(
    `Dicetak Tanggal    : ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`,
    35,
    currentMetaY,
  );
  currentMetaY += 14;

  summaryLabels.forEach((item) => {
    doc.text(`${item.label.padEnd(18, " ")}: ${item.value}`, 35, currentMetaY);
    currentMetaY += 14;
  });

  if (rightText) {
    doc.fillColor("#475569").font("Helvetica-Bold").text(rightText, 30, 85, {
      align: "right",
      width: fullWidth,
    });
  }

  return currentMetaY + 15;
};

// =========================================================================
// 1. GENERATOR PDF: IDENTIFIKASI RISIKO
// =========================================================================
exports.generateIdentifikasiPDF = async (res, reportData) => {
  try {
    const doc = new PDFDocument({
      margin: 30,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="laporan-identifikasi-risiko.pdf"',
    );
    doc.pipe(res);

    const fullWidth = doc.page.width - 60; // 782 pt
    const summaryLabels = [
      {
        label: "Total Risiko",
        value: `${reportData.summary.totalIdentifikasi} Risiko`,
      },
    ];

    let currentY = drawPdfHeaderBanner(
      doc,
      "Laporan Register Identifikasi Risiko Kerja",
      fullWidth,
      summaryLabels,
    );

    // 🎯 FIX PRESISI LEBAR: 22 + 75 + 95 + 65 + 105 + 105 + 100 + 100 + 65 + 50 = 782 pt (Pas A4 Landscape)
    const colW = {
      no: 22,
      pemilik: 75,
      nama: 95,
      kategori: 65,
      deskripsi: 105,
      penyebab: 105,
      dampak: 100,
      pengendalian: 100,
      tgl: 65,
      status: 50,
    };

    // Rantai Koordinat X Akumulatif
    const colX = {
      no: 30,
      pemilik: 30 + colW.no,
      nama: 30 + colW.no + colW.pemilik,
      kategori: 30 + colW.no + colW.pemilik + colW.nama,
      deskripsi: 30 + colW.no + colW.pemilik + colW.nama + colW.kategori,
      penyebab:
        30 +
        colW.no +
        colW.pemilik +
        colW.nama +
        colW.kategori +
        colW.deskripsi,
      dampak:
        30 +
        colW.no +
        colW.pemilik +
        colW.nama +
        colW.kategori +
        colW.deskripsi +
        colW.penyebab,
      pengendalian:
        30 +
        colW.no +
        colW.pemilik +
        colW.nama +
        colW.kategori +
        colW.deskripsi +
        colW.penyebab +
        colW.dampak,
      tgl:
        30 +
        colW.no +
        colW.pemilik +
        colW.nama +
        colW.kategori +
        colW.deskripsi +
        colW.penyebab +
        colW.dampak +
        colW.pengendalian,
      status:
        30 +
        colW.no +
        colW.pemilik +
        colW.nama +
        colW.kategori +
        colW.deskripsi +
        colW.penyebab +
        colW.dampak +
        colW.pengendalian +
        colW.tgl,
    };

    const drawTableHeader = (yPos) => {
      doc.rect(30, yPos, fullWidth, 20).fill("#475569");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7.5);
      doc.text("No", colX.no, yPos + 6, { width: colW.no, align: "center" });
      doc.text("Unit Kerja", colX.pemilik + 2, yPos + 6, {
        width: colW.pemilik - 2,
      });
      doc.text("Judul Risiko Utama", colX.nama + 2, yPos + 6, {
        width: colW.nama - 2,
      });
      doc.text("Kategori", colX.kategori + 2, yPos + 6, {
        width: colW.kategori - 2,
      });
      doc.text("Deskripsi Risiko", colX.deskripsi + 2, yPos + 6, {
        width: colW.deskripsi - 2,
      });
      doc.text("Penyebab", colX.penyebab + 2, yPos + 6, {
        width: colW.penyebab - 2,
      });
      doc.text("Dampak", colX.dampak + 2, yPos + 6, { width: colW.dampak - 2 });
      doc.text("Pengendalian yang Ada", colX.pengendalian + 2, yPos + 6, {
        width: colW.pengendalian - 2,
      });
      doc.text("Tgl Identifikasi", colX.tgl, yPos + 6, {
        width: colW.tgl,
        align: "center",
      });
      doc.text("Status", colX.status, yPos + 6, {
        width: colW.status,
        align: "center",
      });
      return yPos + 20;
    };

    let tableStartY = currentY;
    currentY = drawTableHeader(currentY);

    reportData.daftarLaporan.forEach((row, idx) => {
      // Hitung tinggi sel dinamis berdasarkan kolom teks panjang (termasuk pengendalian)
      const pemH = doc.heightOfString(row.pemilik_risiko, {
        width: colW.pemilik - 4,
        fontSize: 7,
      });
      const namaH = doc.heightOfString(row.nama_resiko, {
        width: colW.nama - 4,
        fontSize: 7,
      });
      const katH = doc.heightOfString(row.kategori_name, {
        width: colW.kategori - 4,
        fontSize: 7,
      });
      const deskH = doc.heightOfString(row.deskripsi, {
        width: colW.deskripsi - 4,
        fontSize: 7,
      });
      const sebabH = doc.heightOfString(row.penyebab, {
        width: colW.penyebab - 4,
        fontSize: 7,
      });
      const dampakH = doc.heightOfString(row.dampak, {
        width: colW.dampak - 4,
        fontSize: 7,
      });
      const pengendalianH = doc.heightOfString(row.pengendalian, {
        width: colW.pengendalian - 4,
        fontSize: 7,
      });

      const rowHeight = Math.max(
        22,
        pemH + 8,
        namaH + 8,
        katH + 8,
        deskH + 8,
        sebabH + 8,
        dampakH + 8,
        pengendalianH + 8,
      );

      // Proteksi luapan halaman (Page break check)
      if (currentY + rowHeight > doc.page.height - 40) {
        doc.moveTo(30, tableStartY).lineTo(30, currentY).stroke("#CBD5E1");
        doc
          .moveTo(30 + fullWidth, tableStartY)
          .lineTo(30 + fullWidth, currentY)
          .stroke("#CBD5E1");

        doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
        tableStartY = 30;
        currentY = drawTableHeader(30);
      }

      // Zebra striping baris genap
      if (idx % 2 === 1)
        doc.rect(30, currentY, fullWidth, rowHeight).fill("#F8FAFC");

      // Border horizontal baris
      doc
        .moveTo(30, currentY + rowHeight)
        .lineTo(30 + fullWidth, currentY + rowHeight)
        .stroke("#E2E8F0");

      // Isi Konten Baris Sel
      doc.fillColor("#334155").font("Helvetica").fontSize(7);
      doc.text(`${idx + 1}`, colX.no, currentY + 4, {
        width: colW.no,
        align: "center",
      });
      doc.text(row.pemilik_risiko, colX.pemilik + 2, currentY + 4, {
        width: colW.pemilik - 4,
      });
      doc
        .font("Helvetica-Bold")
        .text(row.nama_resiko, colX.nama + 2, currentY + 4, {
          width: colW.nama - 4,
        });
      doc
        .font("Helvetica")
        .text(row.kategori_name, colX.kategori + 2, currentY + 4, {
          width: colW.kategori - 4,
        });
      doc.text(row.deskripsi, colX.deskripsi + 2, currentY + 4, {
        width: colW.deskripsi - 4,
      });
      doc.text(row.penyebab, colX.penyebab + 2, currentY + 4, {
        width: colW.penyebab - 4,
      });
      doc.text(row.dampak, colX.dampak + 2, currentY + 4, {
        width: colW.dampak - 4,
      });

      // 🎯 Kolom Pengendalian
      doc.text(row.pengendalian, colX.pengendalian + 2, currentY + 4, {
        width: colW.pengendalian - 4,
      });

      const tglStr = row.tanggal_identifikasi
        ? new Date(row.tanggal_identifikasi).toLocaleDateString("id-ID")
        : "-";
      doc.text(tglStr, colX.tgl, currentY + 4, {
        width: colW.tgl,
        align: "center",
      });

      const statusText =
        row.status_utama_risiko === "Open"
          ? "Aktif"
          : row.status_utama_risiko === "On Progress"
            ? "Aktif Kembali"
            : "Selesai";

      doc.text(statusText, colX.status, currentY + 4, {
        width: colW.status,
        align: "center",
      });

      currentY += rowHeight;
    });

    // Border vertikal penutup tabel
    doc.moveTo(30, tableStartY).lineTo(30, currentY).stroke("#CBD5E1");
    doc
      .moveTo(30 + fullWidth, tableStartY)
      .lineTo(30 + fullWidth, currentY)
      .stroke("#CBD5E1");

    doc.end();
  } catch (error) {
    console.error("❌ Gagal membuat PDF Identifikasi:", error);
    if (!res.headersSent)
      res.status(500).json({ success: false, message: error.message });
  }
};

// =========================================================================
// 2. GENERATOR PDF: ANALISIS / PENILAIAN RISIKO
// =========================================================================
exports.generateAnalisisPDF = async (res, reportData) => {
  try {
    const doc = new PDFDocument({
      margin: 30,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="laporan-analisis-risiko.pdf"',
    );
    doc.pipe(res);

    const fullWidth = doc.page.width - 60; // Total 782 pt
    const summaryLabels = [
      {
        label: "Sudah Asesmen",
        value: `${reportData.summary.totalDinilai} Risiko`,
      },
      {
        label: "Belum Asesmen",
        value: `${reportData.summary.belumDinilai} Risiko`,
      },
    ];

    let currentY = drawPdfHeaderBanner(
      doc,
      "Laporan Matriks Analisis & Penilaian Risiko Inherent",
      fullWidth,
      summaryLabels,
    );

    // 🎯 FIX PRESISI: Total colW = 22 + 80 + 110 + 75 + 110 + 110 + 105 + 105 + 22 + 22 + 21 = 782 pt (Pas A4 Landscape)
    const colW = {
      no: 22,
      unit: 80,
      judul: 110,
      kategori: 75,
      deskripsi: 110,
      penyebab: 110,
      dampak: 105,
      pengendalian: 105,
      L: 22,
      I: 22,
      score: 21,
    };

    // Rantai Koordinat X Akumulatif Murni
    const colX = {
      no: 30,
      unit: 30 + colW.no,
      judul: 30 + colW.no + colW.unit,
      kategori: 30 + colW.no + colW.unit + colW.judul,
      deskripsi: 30 + colW.no + colW.unit + colW.judul + colW.kategori,
      penyebab:
        30 + colW.no + colW.unit + colW.judul + colW.kategori + colW.deskripsi,
      dampak:
        30 +
        colW.no +
        colW.unit +
        colW.judul +
        colW.kategori +
        colW.deskripsi +
        colW.penyebab,
      pengendalian:
        30 +
        colW.no +
        colW.unit +
        colW.judul +
        colW.kategori +
        colW.deskripsi +
        colW.penyebab +
        colW.dampak,
      L:
        30 +
        colW.no +
        colW.unit +
        colW.judul +
        colW.kategori +
        colW.deskripsi +
        colW.penyebab +
        colW.dampak +
        colW.pengendalian,
      I:
        30 +
        colW.no +
        colW.unit +
        colW.judul +
        colW.kategori +
        colW.deskripsi +
        colW.penyebab +
        colW.dampak +
        colW.pengendalian +
        colW.L,
      score:
        30 +
        colW.no +
        colW.unit +
        colW.judul +
        colW.kategori +
        colW.deskripsi +
        colW.penyebab +
        colW.dampak +
        colW.pengendalian +
        colW.L +
        colW.I,
    };

    const drawTableHeader = (yPos) => {
      doc.rect(30, yPos, fullWidth, 20).fill("#475569");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7.5);

      doc.text("No", colX.no, yPos + 6, { width: colW.no, align: "center" });
      doc.text("Unit Kerja", colX.unit + 2, yPos + 6, { width: colW.unit - 2 });
      doc.text("Judul Risiko", colX.judul + 2, yPos + 6, {
        width: colW.judul - 2,
      });
      doc.text("Kategori", colX.kategori + 2, yPos + 6, {
        width: colW.kategori - 2,
      });
      doc.text("Deskripsi Risiko", colX.deskripsi + 2, yPos + 6, {
        width: colW.deskripsi - 2,
      });
      doc.text("Penyebab", colX.penyebab + 2, yPos + 6, {
        width: colW.penyebab - 2,
      });
      doc.text("Dampak", colX.dampak + 2, yPos + 6, { width: colW.dampak - 2 });
      doc.text("Pengendalian", colX.pengendalian + 2, yPos + 6, {
        width: colW.pengendalian - 2,
      });
      doc.text("SK", colX.L, yPos + 6, { width: colW.L, align: "center" });
      doc.text("SD", colX.I, yPos + 6, { width: colW.I, align: "center" });
      doc.text("Skor", colX.score, yPos + 6, {
        width: colW.score,
        align: "center",
      });

      return yPos + 20;
    };

    let tableStartY = currentY;
    currentY = drawTableHeader(currentY);

    reportData.daftarLaporan.forEach((row, idx) => {
      // Hitung tinggi sel dinamis berdasarkan kolom yang berpotensi memiliki teks panjang
      const unitH = doc.heightOfString(row.analisis.pemilik_risiko, {
        width: colW.unit - 4,
        fontSize: 7,
      });
      const judulH = doc.heightOfString(row.analisis.judul_risiko, {
        width: colW.judul - 4,
        fontSize: 7,
      });
      const katH = doc.heightOfString(row.analisis.kategori_risiko, {
        width: colW.kategori - 4,
        fontSize: 7,
      });
      const deskH = doc.heightOfString(row.analisis.deskripsi, {
        width: colW.deskripsi - 4,
        fontSize: 7,
      });
      const sebabH = doc.heightOfString(row.analisis.penyebab, {
        width: colW.penyebab - 4,
        fontSize: 7,
      });
      const dampakH = doc.heightOfString(row.analisis.dampak, {
        width: colW.dampak - 4,
        fontSize: 7,
      });
      const pengendalianH = doc.heightOfString(row.analisis.pengendalian, {
        width: colW.pengendalian - 4,
        fontSize: 7,
      });

      const rowHeight = Math.max(
        22,
        unitH + 8,
        judulH + 8,
        katH + 8,
        deskH + 8,
        sebabH + 8,
        dampakH + 8,
        pengendalianH + 8,
      );

      // Proteksi Luapan Halaman (Page Break Check)
      if (currentY + rowHeight > doc.page.height - 40) {
        doc.moveTo(30, tableStartY).lineTo(30, currentY).stroke("#CBD5E1");
        doc
          .moveTo(30 + fullWidth, tableStartY)
          .lineTo(30 + fullWidth, currentY)
          .stroke("#CBD5E1");

        doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
        tableStartY = 30;
        currentY = drawTableHeader(30);
      }

      // Striping Warna Sel Genap
      if (idx % 2 === 1) {
        doc.rect(30, currentY, fullWidth, rowHeight).fill("#F8FAFC");
      }

      // Mewarnai Kotak Sel Skor Risiko (Kolom Terakhir)
      if (row.analisis.score) {
        let blockColor = "#FEF9C3"; // Yellow (Medium)
        if (row.analisis.tingkat_risiko === "HIGH") blockColor = "#FEE2E2"; // Red (High)
        if (row.analisis.tingkat_risiko === "LOW") blockColor = "#DCFCE7"; // Green (Low)

        doc.rect(colX.score, currentY, colW.score, rowHeight).fill(blockColor);
      }

      // Border Horizontal Sel
      doc
        .moveTo(30, currentY + rowHeight)
        .lineTo(30 + fullWidth, currentY + rowHeight)
        .stroke("#E2E8F0");

      // Isi Data 11 Kolom
      doc.fillColor("#334155").font("Helvetica").fontSize(7);

      doc.text(`${idx + 1}`, colX.no, currentY + 4, {
        width: colW.no,
        align: "center",
      });
      doc.text(row.analisis.pemilik_risiko, colX.unit + 2, currentY + 4, {
        width: colW.unit - 4,
      });
      doc
        .font("Helvetica-Bold")
        .text(row.analisis.judul_risiko, colX.judul + 2, currentY + 4, {
          width: colW.judul - 4,
        });
      doc
        .font("Helvetica")
        .text(row.analisis.kategori_risiko, colX.kategori + 2, currentY + 4, {
          width: colW.kategori - 4,
        });
      doc.text(row.analisis.deskripsi, colX.deskripsi + 2, currentY + 4, {
        width: colW.deskripsi - 4,
      });
      doc.text(row.analisis.penyebab, colX.penyebab + 2, currentY + 4, {
        width: colW.penyebab - 4,
      });
      doc.text(row.analisis.dampak, colX.dampak + 2, currentY + 4, {
        width: colW.dampak - 4,
      });
      doc.text(row.analisis.pengendalian, colX.pengendalian + 2, currentY + 4, {
        width: colW.pengendalian - 4,
      });

      doc.text(row.analisis.likelihood || "-", colX.L, currentY + 4, {
        width: colW.L,
        align: "center",
      });
      doc.text(row.analisis.impact || "-", colX.I, currentY + 4, {
        width: colW.I,
        align: "center",
      });

      // Skor Risiko
      if (row.analisis.score) {
        let textColor = "#A16207";
        if (row.analisis.tingkat_risiko === "HIGH") textColor = "#B91C1C";
        if (row.analisis.tingkat_risiko === "LOW") textColor = "#15803D";

        doc
          .font("Helvetica-Bold")
          .fillColor(textColor)
          .text(`${row.analisis.score}`, colX.score, currentY + 4, {
            width: colW.score,
            align: "center",
          });
      } else {
        doc.fillColor("#94A3B8").text("-", colX.score, currentY + 4, {
          width: colW.score,
          align: "center",
        });
      }

      currentY += rowHeight;
    });

    // Border Vertikal Penutup Tabel
    doc.moveTo(30, tableStartY).lineTo(30, currentY).stroke("#CBD5E1");
    doc
      .moveTo(30 + fullWidth, tableStartY)
      .lineTo(30 + fullWidth, currentY)
      .stroke("#CBD5E1");

    // Penomoran Halaman Otomatis (Halaman X dari Y)
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor("#64748B").fontSize(7.5).font("Helvetica");
      doc.text(
        `Halaman ${i + 1} dari ${pages.count}`,
        30,
        doc.page.height - 25,
        {
          align: "right",
          width: doc.page.width - 60,
        },
      );
    }

    doc.end();
  } catch (error) {
    console.error("❌ Gagal membuat PDF Analisis:", error);
    if (!res.headersSent)
      res.status(500).json({ success: false, message: error.message });
  }
};

// =========================================================================
// 3. GENERATOR PDF: EVALUASI RISIKO
// =========================================================================
exports.generateEvaluasiPDF = async (res, reportData) => {
  try {
    const doc = new PDFDocument({
      margin: 30,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="laporan-evaluasi-risiko.pdf"',
    );
    doc.pipe(res);

    const fullWidth = doc.page.width - 60; // Pas 782 pt
    const summaryLabels = [
      {
        label: "Mitigasi Siap",
        value: `${reportData.summary.totalDievaluasi} Risiko`,
      },
      {
        label: "Belum Mitigasi",
        value: `${reportData.summary.belumDievaluasi} Risiko`,
      },
    ];

    let currentY = drawPdfHeaderBanner(
      doc,
      "Laporan Evaluasi Rencana Tindak Lanjut Mitigasi Risiko",
      fullWidth,
      summaryLabels,
    );

    // 🎯 FIX PRESISI TOTAL: 22 + 140 + 100 + 65 + 75 + 70 + 310 = 782 pt (Presisi Tanpa Overflow)
    const colW = {
      no: 22,
      nama: 140,
      pemilik: 100,
      status: 65,
      strategi: 75,
      prio: 70,
      justifikasi: 310, // Ruang Luas untuk Teks Paragraf Panjang
    };

    const colX = {
      no: 30,
      nama: 30 + colW.no,
      pemilik: 30 + colW.no + colW.nama,
      status: 30 + colW.no + colW.nama + colW.pemilik,
      strategi: 30 + colW.no + colW.nama + colW.pemilik + colW.status,
      prio:
        30 + colW.no + colW.nama + colW.pemilik + colW.status + colW.strategi,
      justifikasi:
        30 +
        colW.no +
        colW.nama +
        colW.pemilik +
        colW.status +
        colW.strategi +
        colW.prio,
    };

    const drawTableHeader = (yPos) => {
      doc.rect(30, yPos, fullWidth, 20).fill("#334155");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7.5);
      doc.text("No", colX.no, yPos + 6, { width: colW.no, align: "center" });
      doc.text("Nama Risiko Utama", colX.nama + 3, yPos + 6, {
        width: colW.nama - 3,
      });
      doc.text("Pemilik Risiko", colX.pemilik + 3, yPos + 6, {
        width: colW.pemilik - 3,
      });
      doc.text("Mitigasi", colX.status, yPos + 6, {
        width: colW.status,
        align: "center",
      });
      doc.text("Strategi", colX.strategi + 3, yPos + 6, {
        width: colW.strategi - 3,
      });
      doc.text("Prioritas", colX.prio, yPos + 6, {
        width: colW.prio,
        align: "center",
      });
      doc.text("Justifikasi / Tindak Lanjut", colX.justifikasi + 3, yPos + 6, {
        width: colW.justifikasi - 3,
      });
      return yPos + 20;
    };

    let tableStartY = currentY;
    currentY = drawTableHeader(currentY);

    reportData.daftarLaporan.forEach((row, idx) => {
      const isEval = row.evaluasi.status === "SUDAH_DIEVALUASI";

      const namaH = doc.heightOfString(row.nama_resiko, {
        width: colW.nama - 6,
        fontSize: 7,
      });
      const pemH = doc.heightOfString(row.pemilik_risiko, {
        width: colW.pemilik - 6,
        fontSize: 7,
      });
      const stratH = doc.heightOfString(row.evaluasi.strategi || "-", {
        width: colW.strategi - 6,
        fontSize: 7,
      });

      const justifikasiText =
        row.evaluasi.justifikasi || row.evaluasi.keterangan || "-";
      const justH = doc.heightOfString(justifikasiText, {
        width: colW.justifikasi - 8, // Padding Kanan Aman
        fontSize: 7,
      });

      const rowHeight = Math.max(
        22,
        namaH + 8,
        pemH + 8,
        stratH + 8,
        justH + 8,
      );

      if (currentY + rowHeight > doc.page.height - 40) {
        doc.moveTo(30, tableStartY).lineTo(30, currentY).stroke("#CBD5E1");
        doc
          .moveTo(30 + fullWidth, tableStartY)
          .lineTo(30 + fullWidth, currentY)
          .stroke("#CBD5E1");

        doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
        tableStartY = 30;
        currentY = drawTableHeader(30);
      }

      if (idx % 2 === 1)
        doc.rect(30, currentY, fullWidth, rowHeight).fill("#F8FAFC");

      doc
        .moveTo(30, currentY + rowHeight)
        .lineTo(30 + fullWidth, currentY + rowHeight)
        .stroke("#E2E8F0");

      doc.fillColor("#334155").font("Helvetica").fontSize(7);
      doc.text(`${idx + 1}`, colX.no, currentY + 4, {
        width: colW.no,
        align: "center",
      });
      doc
        .font("Helvetica-Bold")
        .text(row.nama_resiko, colX.nama + 3, currentY + 4, {
          width: colW.nama - 6,
        });
      doc
        .font("Helvetica")
        .text(row.pemilik_risiko, colX.pemilik + 3, currentY + 4, {
          width: colW.pemilik - 6,
        });

      // Status Mitigasi
      doc
        .font(isEval ? "Helvetica" : "Helvetica-Oblique")
        .fillColor(isEval ? "#15803D" : "#64748B")
        .text(
          isEval ? "Mitigasi Siap" : "Belum Mitigasi",
          colX.status,
          currentY + 4,
          { width: colW.status, align: "center" },
        );

      doc.font("Helvetica").fillColor("#334155");
      doc.text(row.evaluasi.strategi || "-", colX.strategi + 3, currentY + 4, {
        width: colW.strategi - 6,
      });
      doc
        .font("Helvetica-Bold")
        .text(row.evaluasi.prioritas || "-", colX.prio, currentY + 4, {
          width: colW.prio,
          align: "center",
        });

      // 🎯 Justifikasi Rapi (Diberi Batas Padding Aman agar Tidak Terpotong Line End)
      doc
        .font(isEval ? "Helvetica" : "Helvetica-Oblique")
        .fillColor(isEval ? "#1E293B" : "#64748B")
        .text(justifikasiText, colX.justifikasi + 3, currentY + 4, {
          width: colW.justifikasi - 8,
        });

      currentY += rowHeight;
    });

    doc.moveTo(30, tableStartY).lineTo(30, currentY).stroke("#CBD5E1");
    doc
      .moveTo(30 + fullWidth, tableStartY)
      .lineTo(30 + fullWidth, currentY)
      .stroke("#CBD5E1");

    // Penomoran Halaman Otomatis
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor("#64748B").fontSize(7.5).font("Helvetica");
      doc.text(
        `Halaman ${i + 1} dari ${pages.count}`,
        30,
        doc.page.height - 25,
        {
          align: "right",
          width: doc.page.width - 60,
        },
      );
    }

    doc.end();
  } catch (error) {
    console.error("❌ Gagal membuat PDF Evaluasi:", error);
    if (!res.headersSent)
      res.status(500).json({ success: false, message: error.message });
  }
};

// 4. GENERATE PDF: PERLAKUAN RISIKO
exports.generatePerlakuanPDF = async (res, reportData) => {
  try {
    const doc = new PDFDocument({
      margin: 30,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="laporan-perlakuan-risiko.pdf"',
    );
    doc.pipe(res);

    const fullWidth = doc.page.width - 60; // 782 pt
    const summaryLabels = [
      { label: "Risiko Aktif", value: `${reportData.summary.totalAktif} Item` },
      {
        label: "Risiko Selesai",
        value: `${reportData.summary.totalSelesai} Item`,
      },
      {
        label: "Total Action Plan",
        value: `${reportData.summary.totalTindakan} Action (${reportData.summary.tindakanOverdue} Overdue)`,
      },
    ];

    let currentY = drawPdfHeaderBanner(
      doc,
      "Laporan Pemantauan Perlakuan & Mitigasi Risiko Mendetail",
      fullWidth,
      summaryLabels,
    );

    // 🎯 GRID LEBAR KOLOM (Total Pas 782 pt)
    const colW = {
      no: 18,
      judul: 85,
      unit: 55,
      deskripsi: 110,
      level: 40,
      progress: 40,
      pengendalian: 95,
      tindakan: 100,
      pic: 55,
      target: 45,
      status_act: 48,
      realisasi: 45,
      bukti: 81,
    };

    const colX = {
      no: 30,
      judul: 30 + colW.no,
      unit: 30 + colW.no + colW.judul,
      deskripsi: 30 + colW.no + colW.judul + colW.unit,
      level: 30 + colW.no + colW.judul + colW.unit + colW.deskripsi,
      progress:
        30 + colW.no + colW.judul + colW.unit + colW.deskripsi + colW.level,
      pengendalian:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.level +
        colW.progress,
      tindakan:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.level +
        colW.progress +
        colW.pengendalian,
      pic:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.level +
        colW.progress +
        colW.pengendalian +
        colW.tindakan,
      target:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.level +
        colW.progress +
        colW.pengendalian +
        colW.tindakan +
        colW.pic,
      status_act:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.level +
        colW.progress +
        colW.pengendalian +
        colW.tindakan +
        colW.pic +
        colW.target,
      realisasi:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.level +
        colW.progress +
        colW.pengendalian +
        colW.tindakan +
        colW.pic +
        colW.target +
        colW.status_act,
      bukti:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.level +
        colW.progress +
        colW.pengendalian +
        colW.tindakan +
        colW.pic +
        colW.target +
        colW.status_act +
        colW.realisasi,
    };

    const drawTableHeader = (yPos) => {
      doc.rect(30, yPos, fullWidth, 20).fill("#334155");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(6);

      doc.text("No", colX.no, yPos + 6, { width: colW.no, align: "center" });
      doc.text("Judul Risiko", colX.judul + 2, yPos + 6, {
        width: colW.judul - 2,
      });
      doc.text("Unit Kerja", colX.unit + 2, yPos + 6, { width: colW.unit - 2 });
      doc.text("Deskripsi", colX.deskripsi + 2, yPos + 6, {
        width: colW.deskripsi - 2,
      });
      doc.text("Level", colX.level, yPos + 6, {
        width: colW.level,
        align: "center",
      });
      doc.text("Progress", colX.progress, yPos + 6, {
        width: colW.progress,
        align: "center",
      });
      doc.text("Pengendalian Ada", colX.pengendalian + 2, yPos + 6, {
        width: colW.pengendalian - 2,
      });
      doc.text("Rencana Tindakan", colX.tindakan + 2, yPos + 6, {
        width: colW.tindakan - 2,
      });
      doc.text("PIC", colX.pic + 2, yPos + 6, { width: colW.pic - 2 });
      doc.text("Target", colX.target, yPos + 6, {
        width: colW.target,
        align: "center",
      });
      doc.text("Status", colX.status_act, yPos + 6, {
        width: colW.status_act,
        align: "center",
      });
      doc.text("Realisasi", colX.realisasi, yPos + 6, {
        width: colW.realisasi,
        align: "center",
      });
      doc.text("Bukti Mitigasi", colX.bukti + 2, yPos + 6, {
        width: colW.bukti - 2,
      });

      return yPos + 20;
    };

    const renderPdfSectionTable = (titleText, dataList) => {
      if (currentY + 35 > doc.page.height - 40) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
        currentY = 30;
      }

      doc.rect(30, currentY, fullWidth, 16).fill("#1E3A8A");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
      doc.text(titleText, 35, currentY + 4, { width: fullWidth - 10 });
      currentY += 16;

      let tableStartY = currentY;
      currentY = drawTableHeader(currentY);

      if (dataList.length === 0) {
        doc.rect(30, currentY, fullWidth, 20).stroke("#CBD5E1");
        doc.fillColor("#64748B").font("Helvetica-Oblique").fontSize(7);
        doc.text("Tidak ada data risiko pada bagian ini.", 30, currentY + 6, {
          align: "center",
          width: fullWidth,
        });
        currentY += 20;
      } else {
        dataList.forEach((risk, rIdx) => {
          risk.mitigasi_rows.forEach((m, mIdx) => {
            const judulH =
              mIdx === 0
                ? doc.heightOfString(risk.judul_risiko, {
                    width: colW.judul - 4,
                    fontSize: 5.5,
                  })
                : 0;
            const unitH =
              mIdx === 0
                ? doc.heightOfString(risk.unit_kerja, {
                    width: colW.unit - 4,
                    fontSize: 5.5,
                  })
                : 0;
            const deskH =
              mIdx === 0
                ? doc.heightOfString(risk.deskripsi_risiko, {
                    width: colW.deskripsi - 4,
                    fontSize: 5.5,
                  })
                : 0;

            const ctrlH = doc.heightOfString(m.nama_kontrol, {
              width: colW.pengendalian - 4,
              fontSize: 5.5,
            });
            const actH = doc.heightOfString(m.action_plan, {
              width: colW.tindakan - 4,
              fontSize: 5.5,
            });
            const buktiH = doc.heightOfString(m.bukti_mitigasi, {
              width: colW.bukti - 4,
              fontSize: 5.5,
            });
            const rowHeight = Math.max(
              18,
              judulH + 6,
              unitH + 6,
              deskH + 6,
              ctrlH + 6,
              actH + 6,
              buktiH + 6,
            );

            if (currentY + rowHeight > doc.page.height - 40) {
              doc
                .moveTo(30, tableStartY)
                .lineTo(30, currentY)
                .stroke("#CBD5E1");
              doc
                .moveTo(30 + fullWidth, tableStartY)
                .lineTo(30 + fullWidth, currentY)
                .stroke("#CBD5E1");

              doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
              tableStartY = 30;
              currentY = drawTableHeader(30);
            }

            if (rIdx % 2 === 1) {
              doc.rect(30, currentY, fullWidth, rowHeight).fill("#F8FAFC");
            }

            doc
              .moveTo(30, currentY + rowHeight)
              .lineTo(30 + fullWidth, currentY + rowHeight)
              .stroke("#E2E8F0");

            doc.fillColor("#334155").font("Helvetica").fontSize(5.5);

            if (mIdx === 0) {
              doc.text(`${rIdx + 1}`, colX.no, currentY + 3, {
                width: colW.no,
                align: "center",
              });
              doc
                .font("Helvetica-Bold")
                .text(risk.judul_risiko, colX.judul + 2, currentY + 3, {
                  width: colW.judul - 4,
                });
              doc
                .font("Helvetica")
                .text(risk.unit_kerja, colX.unit + 2, currentY + 3, {
                  width: colW.unit - 4,
                });
              doc.text(
                risk.deskripsi_risiko,
                colX.deskripsi + 2,
                currentY + 3,
                { width: colW.deskripsi - 4 },
              );
              doc.text(
                `${risk.risk_score || "-"} (${risk.level_risiko})`,
                colX.level,
                currentY + 3,
                { width: colW.level, align: "center" },
              );
              doc.text(risk.progress_tindakan, colX.progress, currentY + 3, {
                width: colW.progress,
                align: "center",
              });
            }

            doc.font("Helvetica");
            doc.text(m.nama_kontrol, colX.pengendalian + 2, currentY + 3, {
              width: colW.pengendalian - 4,
            });
            doc.text(m.action_plan, colX.tindakan + 2, currentY + 3, {
              width: colW.tindakan - 4,
            });
            doc.text(m.pic_name, colX.pic + 2, currentY + 3, {
              width: colW.pic - 4,
            });
            doc.text(m.target_date, colX.target, currentY + 3, {
              width: colW.target,
              align: "center",
            });

            if (m.has_overdue) doc.fillColor("#B91C1C").font("Helvetica-Bold");
            doc.text(m.status_action, colX.status_act, currentY + 3, {
              width: colW.status_act,
              align: "center",
            });

            doc.font("Helvetica").fillColor("#334155");
            doc.text(m.realisasi_date, colX.realisasi, currentY + 3, {
              width: colW.realisasi,
              align: "center",
            });
            doc.text(m.bukti_mitigasi, colX.bukti + 2, currentY + 3, {
              width: colW.bukti - 4,
            });

            currentY += rowHeight;
          });
        });
      }

      doc.moveTo(30, tableStartY).lineTo(30, currentY).stroke("#CBD5E1");
      doc
        .moveTo(30 + fullWidth, tableStartY)
        .lineTo(30 + fullWidth, currentY)
        .stroke("#CBD5E1");

      currentY += 15;
    };

    renderPdfSectionTable(
      "A. RISIKO AKTIF DALAM PERLAKUAN / MITIGASI",
      reportData.daftarAktif,
    );
    renderPdfSectionTable(
      "B. RIWAYAT RISIKO MITIGASI SELESAI (CLOSED)",
      reportData.daftarSelesai,
    );

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor("#64748B").fontSize(7.5).font("Helvetica");
      doc.text(
        `Halaman ${i + 1} dari ${pages.count}`,
        30,
        doc.page.height - 25,
        {
          align: "right",
          width: doc.page.width - 60,
        },
      );
    }

    doc.end();
  } catch (error) {
    console.error("❌ Gagal membuat PDF Perlakuan:", error);
    if (!res.headersSent)
      res.status(500).json({ success: false, message: error.message });
  }
};

// 5. GENERATE PDF: ANALISIS RESIDU RISIKO
exports.generateResiduPDF = async (req, res, reportData) => {
  try {
    const doc = new PDFDocument({
      margin: 30,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="laporan-analisis-residu-risiko.pdf"',
    );
    doc.pipe(res);

    const fullWidth = doc.page.width - 60; // 782 pt
    const summaryLabels = [
      {
        label: "Sudah Residu",
        value: `${reportData.summary.sudahResidu} Risiko`,
      },
      {
        label: "Belum Residu",
        value: `${reportData.summary.belumResidu} Risiko`,
      },
      {
        label: "Kejadian Tahun Ini",
        value: `${reportData.summary.totalKejadianTahunIni} Insiden`,
      },
    ];

    let currentY = drawPdfHeaderBanner(
      doc,
      "Laporan Matriks Analisis & Evaluasi Risiko Residu",
      fullWidth,
      summaryLabels,
    );

    // 🎯 GRID LEBAR KOLOM (Total Pas 782 pt)
    const colW = {
      no: 22,
      judul: 110,
      unit: 80,
      deskripsi: 100,
      kategori: 70,
      l_bef: 25,
      i_bef: 25,
      sc_bef: 65,
      l_aft: 25,
      i_aft: 25,
      sc_aft: 65,
      kejadian: 80,
      status: 90,
    };

    const colX = {
      no: 30,
      judul: 30 + colW.no,
      unit: 30 + colW.no + colW.judul,
      deskripsi: 30 + colW.no + colW.judul + colW.unit,
      kategori: 30 + colW.no + colW.judul + colW.unit + colW.deskripsi,
      l_bef:
        30 + colW.no + colW.judul + colW.unit + colW.deskripsi + colW.kategori,
      i_bef:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.kategori +
        colW.l_bef,
      sc_bef:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.kategori +
        colW.l_bef +
        colW.i_bef,
      l_aft:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef,
      i_aft:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef +
        colW.l_aft,
      sc_aft:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef +
        colW.l_aft +
        colW.i_aft,
      kejadian:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef +
        colW.l_aft +
        colW.i_aft +
        colW.sc_aft,
      status:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef +
        colW.l_aft +
        colW.i_aft +
        colW.sc_aft +
        colW.kejadian,
    };

    const drawTableHeader = (yPos) => {
      doc.rect(30, yPos, fullWidth, 20).fill("#334155");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(6.5);

      doc.text("No", colX.no, yPos + 6, { width: colW.no, align: "center" });
      doc.text("Judul Risiko", colX.judul + 2, yPos + 6, {
        width: colW.judul - 2,
      });
      doc.text("Unit Kerja", colX.unit + 2, yPos + 6, { width: colW.unit - 2 });
      doc.text("Deskripsi", colX.deskripsi + 2, yPos + 6, {
        width: colW.deskripsi - 2,
      });
      doc.text("Kategori", colX.kategori + 2, yPos + 6, {
        width: colW.kategori - 2,
      });
      doc.text("L.B", colX.l_bef, yPos + 6, {
        width: colW.l_bef,
        align: "center",
      });
      doc.text("I.B", colX.i_bef, yPos + 6, {
        width: colW.i_bef,
        align: "center",
      });
      doc.text("Inherent", colX.sc_bef, yPos + 6, {
        width: colW.sc_bef,
        align: "center",
      });
      doc.text("L.A", colX.l_aft, yPos + 6, {
        width: colW.l_aft,
        align: "center",
      });
      doc.text("I.A", colX.i_aft, yPos + 6, {
        width: colW.i_aft,
        align: "center",
      });
      doc.text("Residual", colX.sc_aft, yPos + 6, {
        width: colW.sc_aft,
        align: "center",
      });
      doc.text("Insiden", colX.kejadian, yPos + 6, {
        width: colW.kejadian,
        align: "center",
      });
      doc.text("Status Residu", colX.status, yPos + 6, {
        width: colW.status,
        align: "center",
      });

      return yPos + 20;
    };

    let tableStartY = currentY;
    currentY = drawTableHeader(currentY);

    reportData.daftarLaporan.forEach((row, idx) => {
      const judulH = doc.heightOfString(row.judul_risiko, {
        width: colW.judul - 4,
        fontSize: 6.5,
      });
      const unitH = doc.heightOfString(row.unit_kerja, {
        width: colW.unit - 4,
        fontSize: 6.5,
      });
      const deskH = doc.heightOfString(row.deskripsi_risiko, {
        width: colW.deskripsi - 4,
        fontSize: 6.5,
      });

      const rowHeight = Math.max(22, judulH + 8, unitH + 8, deskH + 8);

      if (currentY + rowHeight > doc.page.height - 40) {
        doc.moveTo(30, tableStartY).lineTo(30, currentY).stroke("#CBD5E1");
        doc
          .moveTo(30 + fullWidth, tableStartY)
          .lineTo(30 + fullWidth, currentY)
          .stroke("#CBD5E1");

        doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
        tableStartY = 30;
        currentY = drawTableHeader(30);
      }

      if (idx % 2 === 1)
        doc.rect(30, currentY, fullWidth, rowHeight).fill("#F8FAFC");
      doc
        .moveTo(30, currentY + rowHeight)
        .lineTo(30 + fullWidth, currentY + rowHeight)
        .stroke("#E2E8F0");

      doc.fillColor("#334155").font("Helvetica").fontSize(6.5);
      doc.text(`${idx + 1}`, colX.no, currentY + 4, {
        width: colW.no,
        align: "center",
      });
      doc
        .font("Helvetica-Bold")
        .text(row.judul_risiko, colX.judul + 2, currentY + 4, {
          width: colW.judul - 4,
        });
      doc.font("Helvetica").text(row.unit_kerja, colX.unit + 2, currentY + 4, {
        width: colW.unit - 4,
      });
      doc.text(row.deskripsi_risiko, colX.deskripsi + 2, currentY + 4, {
        width: colW.deskripsi - 4,
      });
      doc.text(row.kategori_risiko, colX.kategori + 2, currentY + 4, {
        width: colW.kategori - 4,
      });

      // Before Assessment
      doc.text(row.before.likelihood || "-", colX.l_bef, currentY + 4, {
        width: colW.l_bef,
        align: "center",
      });
      doc.text(row.before.impact || "-", colX.i_bef, currentY + 4, {
        width: colW.i_bef,
        align: "center",
      });
      doc
        .font("Helvetica-Bold")
        .text(
          `${row.before.score || "-"} (${row.before.level})`,
          colX.sc_bef,
          currentY + 4,
          { width: colW.sc_bef, align: "center" },
        );

      // After Assessment
      doc.font("Helvetica");
      doc.text(row.after.likelihood || "-", colX.l_aft, currentY + 4, {
        width: colW.l_aft,
        align: "center",
      });
      doc.text(row.after.impact || "-", colX.i_aft, currentY + 4, {
        width: colW.i_aft,
        align: "center",
      });

      if (row.after.score) {
        doc
          .font("Helvetica-Bold")
          .fillColor("#15803D")
          .text(
            `${row.after.score} (${row.after.level})`,
            colX.sc_aft,
            currentY + 4,
            { width: colW.sc_aft, align: "center" },
          );
      } else {
        doc.fillColor("#94A3B8").text("-", colX.sc_aft, currentY + 4, {
          width: colW.sc_aft,
          align: "center",
        });
      }

      // Insiden & Status
      doc.font("Helvetica").fillColor("#334155");
      doc.text(row.status_kejadian, colX.kejadian, currentY + 4, {
        width: colW.kejadian,
        align: "center",
      });

      doc
        .font(row.after.is_evaluated ? "Helvetica" : "Helvetica-Oblique")
        .fillColor(row.after.is_evaluated ? "#1E293B" : "#94A3B8")
        .text(row.status_analisis_residu, colX.status, currentY + 4, {
          width: colW.status,
          align: "center",
        });

      currentY += rowHeight;
    });

    doc.moveTo(30, tableStartY).lineTo(30, currentY).stroke("#CBD5E1");
    doc
      .moveTo(30 + fullWidth, tableStartY)
      .lineTo(30 + fullWidth, currentY)
      .stroke("#CBD5E1");

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor("#64748B").fontSize(7.5).font("Helvetica");
      doc.text(
        `Halaman ${i + 1} dari ${pages.count}`,
        30,
        doc.page.height - 25,
        {
          align: "right",
          width: doc.page.width - 60,
        },
      );
    }

    doc.end();
  } catch (error) {
    console.error("❌ Gagal membuat PDF Residu:", error);
    if (!res.headersSent)
      res.status(500).json({ success: false, message: error.message });
  }
};

// 6. GENERATE PDF: PROFILE RISIKO
exports.generateProfilePDF = async (req, res, reportData) => {
  try {
    const doc = new PDFDocument({
      margin: 30,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="laporan-profile-risiko.pdf"',
    );
    doc.pipe(res);

    const fullWidth = doc.page.width - 60; // 782 pt
    const summaryLabels = [
      {
        label: "Total Profil Risiko",
        value: `${reportData.summary.totalProfile} Item`,
      },
      {
        label: "Total Pengendalian",
        value: `${reportData.summary.totalKontrol} Kontrol`,
      },
      {
        label: "Total Action Plan",
        value: `${reportData.summary.totalTindakan} Tindakan`,
      },
    ];

    let currentY = drawPdfHeaderBanner(
      doc,
      "Laporan Register Profil Risiko Utama Organisasi",
      fullWidth,
      summaryLabels,
    );

    const colW = {
      no: 18,
      judul: 75,
      unit: 50,
      deskripsi: 65,
      status: 38,
      kategori: 48,
      l_bef: 18,
      i_bef: 18,
      sc_bef: 42,
      strategi: 40,
      prio: 45,
      pengendalian: 85,
      tindakan: 90,
      pic: 45,
      target: 40,
      status_act: 40,
      realisasi: 40,
      bukti: 87,
    };

    const colX = {
      no: 30,
      judul: 30 + colW.no,
      unit: 30 + colW.no + colW.judul,
      deskripsi: 30 + colW.no + colW.judul + colW.unit,
      status: 30 + colW.no + colW.judul + colW.unit + colW.deskripsi,
      kategori:
        30 + colW.no + colW.judul + colW.unit + colW.deskripsi + colW.status,
      l_bef:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.status +
        colW.kategori,
      i_bef:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.status +
        colW.kategori +
        colW.l_bef,
      sc_bef:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.status +
        colW.kategori +
        colW.l_bef +
        colW.i_bef,
      strategi:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.status +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef,
      prio:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.status +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef +
        colW.strategi,
      pengendalian:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.status +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef +
        colW.strategi +
        colW.prio,
      tindakan:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.status +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef +
        colW.strategi +
        colW.prio +
        colW.pengendalian,
      pic:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.status +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef +
        colW.strategi +
        colW.prio +
        colW.pengendalian +
        colW.tindakan,
      target:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.status +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef +
        colW.strategi +
        colW.prio +
        colW.pengendalian +
        colW.tindakan +
        colW.pic,
      status_act:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.status +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef +
        colW.strategi +
        colW.prio +
        colW.pengendalian +
        colW.tindakan +
        colW.pic +
        colW.target,
      realisasi:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.status +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef +
        colW.strategi +
        colW.prio +
        colW.pengendalian +
        colW.tindakan +
        colW.pic +
        colW.target +
        colW.status_act,
      bukti:
        30 +
        colW.no +
        colW.judul +
        colW.unit +
        colW.deskripsi +
        colW.status +
        colW.kategori +
        colW.l_bef +
        colW.i_bef +
        colW.sc_bef +
        colW.strategi +
        colW.prio +
        colW.pengendalian +
        colW.tindakan +
        colW.pic +
        colW.target +
        colW.status_act +
        colW.realisasi,
    };

    const drawTableHeader = (yPos) => {
      doc.rect(30, yPos, fullWidth, 20).fill("#334155");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(5.5);

      doc.text("No", colX.no, yPos + 6, { width: colW.no, align: "center" });
      doc.text("Judul Risiko", colX.judul + 2, yPos + 6, {
        width: colW.judul - 2,
      });
      doc.text("Unit", colX.unit + 2, yPos + 6, { width: colW.unit - 2 });
      doc.text("Deskripsi", colX.deskripsi + 2, yPos + 6, {
        width: colW.deskripsi - 2,
      });
      doc.text("Status", colX.status, yPos + 6, {
        width: colW.status,
        align: "center",
      });
      doc.text("Kategori", colX.kategori + 2, yPos + 6, {
        width: colW.kategori - 2,
      });
      doc.text("L", colX.l_bef, yPos + 6, {
        width: colW.l_bef,
        align: "center",
      });
      doc.text("I", colX.i_bef, yPos + 6, {
        width: colW.i_bef,
        align: "center",
      });
      doc.text("Skor", colX.sc_bef, yPos + 6, {
        width: colW.sc_bef,
        align: "center",
      });
      doc.text("Strategi", colX.strategi + 2, yPos + 6, {
        width: colW.strategi - 2,
      });
      doc.text("Prioritas", colX.prio, yPos + 6, {
        width: colW.prio,
        align: "center",
      });
      doc.text("Pengendalian", colX.pengendalian + 2, yPos + 6, {
        width: colW.pengendalian - 2,
      });
      doc.text("Rencana Tindakan", colX.tindakan + 2, yPos + 6, {
        width: colW.tindakan - 2,
      });
      doc.text("PIC", colX.pic + 2, yPos + 6, { width: colW.pic - 2 });
      doc.text("Target", colX.target, yPos + 6, {
        width: colW.target,
        align: "center",
      });
      doc.text("Status", colX.status_act, yPos + 6, {
        width: colW.status_act,
        align: "center",
      });
      doc.text("Realisasi", colX.realisasi, yPos + 6, {
        width: colW.realisasi,
        align: "center",
      });
      doc.text("Bukti Mitigasi", colX.bukti + 2, yPos + 6, {
        width: colW.bukti - 2,
      });

      return yPos + 20;
    };

    let tableStartY = currentY;
    currentY = drawTableHeader(currentY);

    reportData.daftarLaporan.forEach((risk, rIdx) => {
      risk.mitigasi_rows.forEach((m) => {
        const ctrlH = doc.heightOfString(m.nama_kontrol, {
          width: colW.pengendalian - 4,
          fontSize: 5,
        });
        const actH = doc.heightOfString(m.action_plan, {
          width: colW.tindakan - 4,
          fontSize: 5,
        });
        const buktiH = doc.heightOfString(m.bukti_mitigasi, {
          width: colW.bukti - 4,
          fontSize: 5,
        });

        const rowHeight = Math.max(18, ctrlH + 6, actH + 6, buktiH + 6);

        if (currentY + rowHeight > doc.page.height - 40) {
          doc.moveTo(30, tableStartY).lineTo(30, currentY).stroke("#CBD5E1");
          doc
            .moveTo(30 + fullWidth, tableStartY)
            .lineTo(30 + fullWidth, currentY)
            .stroke("#CBD5E1");

          doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
          tableStartY = 30;
          currentY = drawTableHeader(30);
        }

        if (rIdx % 2 === 1)
          doc.rect(30, currentY, fullWidth, rowHeight).fill("#F8FAFC");
        doc
          .moveTo(30, currentY + rowHeight)
          .lineTo(30 + fullWidth, currentY + rowHeight)
          .stroke("#E2E8F0");

        doc.fillColor("#334155").font("Helvetica").fontSize(5);

        doc.text(`${rIdx + 1}`, colX.no, currentY + 3, {
          width: colW.no,
          align: "center",
        });
        doc
          .font("Helvetica-Bold")
          .text(risk.judul_risiko, colX.judul + 2, currentY + 3, {
            width: colW.judul - 4,
          });
        doc
          .font("Helvetica")
          .text(risk.unit_kerja, colX.unit + 2, currentY + 3, {
            width: colW.unit - 4,
          });
        doc.text(risk.deskripsi_risiko, colX.deskripsi + 2, currentY + 3, {
          width: colW.deskripsi - 4,
        });
        doc.text(risk.status_risiko, colX.status, currentY + 3, {
          width: colW.status,
          align: "center",
        });
        doc.text(risk.kategori_risiko, colX.kategori + 2, currentY + 3, {
          width: colW.kategori - 4,
        });

        doc.text(risk.before.likelihood || "-", colX.l_bef, currentY + 3, {
          width: colW.l_bef,
          align: "center",
        });
        doc.text(risk.before.impact || "-", colX.i_bef, currentY + 3, {
          width: colW.i_bef,
          align: "center",
        });
        doc
          .font("Helvetica-Bold")
          .text(
            `${risk.before.score || "-"}\n(${risk.before.level})`,
            colX.sc_bef,
            currentY + 3,
            { width: colW.sc_bef, align: "center" },
          );

        doc.font("Helvetica");
        doc.text(risk.strategi, colX.strategi + 2, currentY + 3, {
          width: colW.strategi - 2,
        });
        doc.text(risk.prioritas, colX.prio, currentY + 3, {
          width: colW.prio,
          align: "center",
        });

        // Mitigasi Kesamping
        doc.text(m.nama_kontrol, colX.pengendalian + 2, currentY + 3, {
          width: colW.pengendalian - 4,
        });
        doc.text(m.action_plan, colX.tindakan + 2, currentY + 3, {
          width: colW.tindakan - 4,
        });
        doc.text(m.pic_name, colX.pic + 2, currentY + 3, {
          width: colW.pic - 4,
        });
        doc.text(m.target_date, colX.target, currentY + 3, {
          width: colW.target,
          align: "center",
        });
        doc.text(m.status_action, colX.status_act, currentY + 3, {
          width: colW.status_act,
          align: "center",
        });
        doc.text(m.realisasi_date, colX.realisasi, currentY + 3, {
          width: colW.realisasi,
          align: "center",
        });
        doc.text(m.bukti_mitigasi, colX.bukti + 2, currentY + 3, {
          width: colW.bukti - 4,
        });

        currentY += rowHeight;
      });
    });

    doc.moveTo(30, tableStartY).lineTo(30, currentY).stroke("#CBD5E1");
    doc
      .moveTo(30 + fullWidth, tableStartY)
      .lineTo(30 + fullWidth, currentY)
      .stroke("#CBD5E1");

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor("#64748B").fontSize(7.5).font("Helvetica");
      doc.text(
        `Halaman ${i + 1} dari ${pages.count}`,
        30,
        doc.page.height - 25,
        {
          align: "right",
          width: doc.page.width - 60,
        },
      );
    }

    doc.end();
  } catch (error) {
    console.error("❌ Gagal membuat PDF Profil Risiko:", error);
    if (!res.headersSent)
      res.status(500).json({ success: false, message: error.message });
  }
};

// =========================================================================
// GENERATE PDF END UNTUK IDENTIFIKASI, ANALISIS, DAN EVALUASI RISIKO
// =========================================================================
