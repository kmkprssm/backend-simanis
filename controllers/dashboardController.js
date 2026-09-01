/* eslint-disable prettier/prettier */
const { getPool } = require("../config/db");

// Helper function untuk warna kategori
function getCategoryColor(category) {
  const colorMap = {
    Strategis: "#1890ff",
    Operasional: "#52c41a",
    Keuangan: "#722ed1",
    Kepatuhan: "#fa8c16",
    Teknologi: "#f5222d",
  };
  return colorMap[category] || "#d9d9d9";
}

/* =============================
   DASHBOARD STATISTICS - DENGAN FILTER!
============================= */
exports.getDashboardStats = async (req, res) => {
  try {
    const pool = getPool();
    const user = req.user;

    console.log("👤 User:", user?.email, "Role:", user?.role);
    console.log("🟡 Fetching dashboard stats...");

    let params = [];
    let filterCondition = "";

    if (user?.role !== "ADMIN" && user?.role !== "GUEST") {
      const userIdValue = user.id || user.uuid;
      params.push(userIdValue);
      filterCondition = `AND ir.created_by_uuid = $${params.length}`;
    }

    // --- QUERY EXECUTION ---

    // 1. Total Risiko
    const totalRisks = await pool.query(
      `
      SELECT COUNT(*) as total 
      FROM identifikasi_resiko ir
      WHERE 1=1 ${filterCondition}
    `,
      params,
    );
    console.log("✅ Query 1 - Total Risks:", totalRisks.rows[0]?.total);

    // 2. Risiko Aktif (Open)
    const activeRisks = await pool.query(
      `
      SELECT COUNT(*) as total 
      FROM identifikasi_resiko ir
      WHERE (ir.status = 'Open' OR ir.status IS NULL OR ir.status ILIKE 'aktif')
        ${filterCondition}
    `,
      params,
    );

    // 3. Risiko Closed
    const closedRisks = await pool.query(
      `
      SELECT COUNT(*) as total 
      FROM identifikasi_resiko ir
      WHERE ir.status IN ('Closed', 'CLOSED', 'DITUTUP')
        ${filterCondition}
    `,
      params,
    );

    // 4. High/Extreme Risks (score >= 17)
    const highRisks = await pool.query(
      `
      SELECT COUNT(DISTINCT ir.id) as total
      FROM identifikasi_resiko ir
      JOIN penilaian_resiko pr ON ir.id = pr.risk_id
      WHERE pr.score >= 17 
        AND pr.assessment_type = 'INHERENT'
        AND (ir.status = 'Open' OR ir.status IS NULL OR ir.status ILIKE 'aktif')
        ${filterCondition}
    `,
      params,
    );

    // 5. Rata-rata Progress dari Action Plan
    let avgProgress;
    try {
      avgProgress = await pool.query(
        `
        WITH risk_action_summary AS (
          SELECT 
            ir.id,
            COUNT(ak.id) as total_actions,
            SUM(CASE WHEN ak.status IN ('Closed', 'CLOSED') THEN 1 ELSE 0 END) as closed_actions
          FROM identifikasi_resiko ir
          LEFT JOIN kontrol_pengendalian kp ON ir.id = kp.risk_id
          LEFT JOIN action_kontrol ak ON kp.id = ak.kontrol_id
          WHERE (ir.status = 'Open' OR ir.status IS NULL OR ir.status ILIKE 'aktif')
          ${filterCondition}
          GROUP BY ir.id
        ),
        risk_progress_calc AS (
          SELECT 
            CASE 
              WHEN total_actions = 0 THEN 0
              ELSE ROUND((closed_actions * 100.0 / total_actions), 1)
            END as progress_percentage
          FROM risk_action_summary
        )
        SELECT 
          COALESCE(AVG(progress_percentage), 0) as avg_progress,
          COUNT(*) as total_risks_calculated
        FROM risk_progress_calc
      `,
        params,
      );
    } catch (err) {
      console.log("⚠️ Query 5 skipped:", err.message);
      avgProgress = { rows: [{ avg_progress: 0, total_risks_calculated: 0 }] };
    }

    // 6. Rata-rata Efektivitas Kontrol
    let avgEffectiveness;
    try {
      avgEffectiveness = await pool.query(
        `
        SELECT COALESCE(AVG(pk.effectiveness), 0) as avg_effectiveness
        FROM (
          SELECT DISTINCT ON (pk.kontrol_id)
            pk.kontrol_id,
            pk.effectiveness
          FROM penilaian_kontrol pk
          JOIN kontrol_pengendalian kp ON pk.kontrol_id = kp.id
          JOIN identifikasi_resiko ir ON kp.risk_id = ir.id
          WHERE 1=1 ${filterCondition}
          ORDER BY pk.kontrol_id, pk.assessed_at DESC
        ) pk
      `,
        params,
      );
    } catch (err) {
      console.log("⚠️ Query 6 skipped:", err.message);
      avgEffectiveness = { rows: [{ avg_effectiveness: 0 }] };
    }

    // 7. Risiko per Kategori (🛠️ FIXED PLACEMENT FOR WHERE CLAUSE)
    const risksByCategory = await pool.query(
      `
      SELECT 
        kr.name as category,
        COUNT(ir.id) as count
      FROM kategori_resiko kr
      LEFT JOIN identifikasi_resiko ir ON kr.id = ir.kategori_id
      WHERE 1=1 ${filterCondition}
      GROUP BY kr.id, kr.name
      ORDER BY kr.name
    `,
      params,
    );

    // 8. Top 5 Risiko dengan Score Tertinggi
    const topRisks = await pool.query(
      `
      SELECT 
        ir.id, ir.nama_resiko, ir.deskripsi, COALESCE(ir.status, 'Open') as status,
        kr.name as kategori, pr.score as inherent_score
      FROM identifikasi_resiko ir
      LEFT JOIN kategori_resiko kr ON ir.kategori_id = kr.id
      LEFT JOIN penilaian_resiko pr ON ir.id = pr.risk_id AND pr.assessment_type = 'INHERENT'
      WHERE (ir.status = 'Open' OR ir.status IS NULL OR ir.status ILIKE 'aktif')
      ${filterCondition}
      ORDER BY pr.score DESC NULLS LAST
      LIMIT 5
    `,
      params,
    );

    // 9. Total Kontrol
    const totalControls = await pool.query(
      `
      SELECT COUNT(*) as total 
      FROM kontrol_pengendalian kp
      JOIN identifikasi_resiko ir ON kp.risk_id = ir.id
      WHERE 1=1 ${filterCondition}
    `,
      params,
    );

    // 10. Pending Actions
    const pendingActions = await pool.query(
      `
      SELECT COUNT(*) as total 
      FROM action_kontrol ak
      JOIN kontrol_pengendalian kp ON ak.kontrol_id = kp.id
      JOIN identifikasi_resiko ir ON kp.risk_id = ir.id
      WHERE ak.status IN ('Open', 'On Progress', 'OPEN', 'ON PROGRESS')
      ${filterCondition}
    `,
      params,
    );

    // 11. Upcoming Actions
    const upcomingActions = await pool.query(
      `
      SELECT ak.id, ak.action_plan, ak.pic_name, ak.target_date, ak.status, kp.nama_kontrol, ir.nama_resiko
      FROM action_kontrol ak
      JOIN kontrol_pengendalian kp ON ak.kontrol_id = kp.id
      JOIN identifikasi_resiko ir ON kp.risk_id = ir.id
      WHERE ak.status IN ('Open', 'On Progress', 'OPEN', 'ON PROGRESS')
        AND ak.target_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')
        ${filterCondition}
      ORDER BY ak.target_date ASC
      LIMIT 5
    `,
      params,
    );

    // 12. Kontrol dengan Efektivitas Rendah
    const lowEffectivenessControls = await pool.query(
      `
      SELECT kp.id, kp.nama_kontrol, kp.tipe, pk.effectiveness, ir.nama_resiko
      FROM kontrol_pengendalian kp
      JOIN (
        SELECT DISTINCT ON (kontrol_id) kontrol_id, effectiveness
        FROM penilaian_kontrol
        ORDER BY kontrol_id, assessed_at DESC
      ) pk ON kp.id = pk.kontrol_id
      JOIN identifikasi_resiko ir ON kp.risk_id = ir.id
      WHERE pk.effectiveness < 60
        AND (ir.status = 'Open' OR ir.status IS NULL OR ir.status ILIKE 'aktif')
        ${filterCondition}
      ORDER BY pk.effectiveness ASC
      LIMIT 5
    `,
      params,
    );

    // 13. Total profile risiko
    const profileRisks = await pool.query(
      `
        SELECT COUNT(DISTINCT prf.id) as total 
        FROM profile_risiko prf
        JOIN penilaian_resiko pr ON prf.risk_analysis_id = pr.id
        JOIN identifikasi_resiko ir ON pr.risk_id = ir.id
        WHERE 1=1 ${filterCondition}
      `,
      params,
    );

    let progressStats;
    try {
      progressStats = await pool.query(
        `
          WITH risk_profile_flag AS (
            -- Ambil ID risiko yang masuk ke dalam profile_risiko
            SELECT DISTINCT pr.risk_id
            FROM profile_risiko prf
            JOIN penilaian_resiko pr ON prf.risk_analysis_id = pr.id
          ),
          action_scores AS (
            SELECT 
              ir.id AS risk_id,
              CASE WHEN rpf.risk_id IS NOT NULL THEN true ELSE false END AS is_profile,
              COUNT(ak.id) AS total_actions,
              SUM(
                CASE 
                  WHEN UPPER(ak.status) = 'CLOSED' THEN 100
                  WHEN UPPER(ak.status) = 'ON PROGRESS' THEN 50
                  ELSE 0 
                END
              ) AS total_score
            FROM identifikasi_resiko ir
            LEFT JOIN risk_profile_flag rpf ON ir.id = rpf.risk_id
            LEFT JOIN kontrol_pengendalian kp ON ir.id = kp.risk_id
            LEFT JOIN action_kontrol ak ON kp.id = ak.kontrol_id
            WHERE (ir.status = 'Open' OR ir.status IS NULL OR ir.status ILIKE 'aktif')
            ${filterCondition}
            GROUP BY ir.id, rpf.risk_id
          ),
          risk_percentages AS (
            SELECT 
              risk_id,
              is_profile,
              CASE 
                WHEN total_actions = 0 THEN 0
                ELSE (total_score * 1.0 / total_actions)
              END AS risk_progress
            FROM action_scores
          )
          SELECT 
            COALESCE(AVG(risk_progress), 0) AS avg_total_progress,
            COALESCE(AVG(CASE WHEN is_profile = true THEN risk_progress END), 0) AS avg_profile_progress
          FROM risk_percentages
        `,
        params,
      );
    } catch (err) {
      progressStats = {
        rows: [{ avg_total_progress: 0, avg_profile_progress: 0 }],
      };
    }

    // --- RESPONSE MAPPING ---
    const response = {
      metrics: {
        totalRisks: parseInt(totalRisks.rows[0]?.total || 0),
        profileRisks: parseInt(profileRisks.rows[0]?.total || 0),
        highRisks: parseInt(highRisks.rows[0]?.total || 0),
        activeRisks: parseInt(activeRisks.rows[0]?.total || 0),
        avgProgress: parseFloat(
          progressStats.rows[0]?.avg_total_progress || 0,
        ).toFixed(1),
        avgProfileProgress: parseFloat(
          progressStats.rows[0]?.avg_profile_progress || 0,
        ).toFixed(1),
        avgEffectiveness: parseFloat(
          avgEffectiveness.rows[0]?.avg_effectiveness || 0,
        ).toFixed(1),
        closedRisks: parseInt(closedRisks.rows[0]?.total || 0),
        totalControls: parseInt(totalControls.rows[0]?.total || 0),
        pendingActions: parseInt(pendingActions.rows[0]?.total || 0),
      },
      categories: risksByCategory.rows.map((row) => ({
        name: row.category,
        count: parseInt(row.count || 0),
        color:
          typeof getCategoryColor === "function"
            ? getCategoryColor(row.category)
            : "#000",
      })),
      topRisks: topRisks.rows.map((row) => ({
        id: row.id,
        nama_resiko: row.nama_resiko,
        deskripsi: row.deskripsi,
        status: row.status,
        kategori: row.kategori,
        inherent_score: row.inherent_score || 0,
      })),
      upcomingActions: upcomingActions.rows,
      lowEffectivenessControls: lowEffectivenessControls.rows,
    };

    console.log({ avgProfile: response.metrics });

    res.json(response);
  } catch (err) {
    console.error("❌ getDashboardStats error:", err);
    res.status(500).json({
      success: false,
      message: "Gagal memuat statistik dashboard",
      error: err.message,
    });
  }
};

/* =============================
   STUB FUNCTIONS UNTUK ROUTES YANG ADA
============================= */

// 1. Untuk route: /api/dashboard/trend dan /api/dashboard/progress-trend
exports.getProgressTrend = async (req, res) => {
  try {
    const pool = getPool();
    console.log("🟡 Getting progress trend...");

    // Data dummy untuk sekarang
    const dummyData = [
      { month: "2024-01", progress: 65 },
      { month: "2024-02", progress: 72 },
      { month: "2024-03", progress: 79.8 },
    ];

    res.json({
      success: true,
      data: dummyData,
    });
  } catch (err) {
    console.error("❌ getProgressTrend error:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil trend progress mitigasi",
    });
  }
};

// 2. Untuk route: /api/dashboard/risk-heatmap - DENGAN FILTER!
exports.getRiskHeatmap = async (req, res) => {
  try {
    const pool = getPool();
    const user = req.user;
    const assessmentType = req.query.type || "INHERENT";

    console.log("👤 User:", user?.email, "Role:", user?.role);

    const filterCondition =
      user.role !== "ADMIN" && user.role !== "GUEST"
        ? `AND ir.created_by_uuid = '${user.id}'`
        : "";

    const query = `
      SELECT
        pr.likelihood,
        pr.impact,
        COUNT(*) AS total,
        mr.risk_level,
        mr.color_hex
      FROM penilaian_resiko pr
      JOIN identifikasi_resiko ir ON pr.risk_id = ir.id
      JOIN matrik_resiko mr ON pr.score BETWEEN mr.min_score AND mr.max_score
      WHERE pr.assessment_type = $1
      ${filterCondition}
      GROUP BY
        pr.likelihood,
        pr.impact,
        mr.risk_level,
        mr.color_hex
      ORDER BY
        pr.likelihood DESC,
        pr.impact ASC;
    `;

    const { rows } = await pool.query(query, [assessmentType]);

    res.json({
      success: true,
      type: assessmentType,
      data: rows,
    });
  } catch (err) {
    console.error("❌ Heatmap error:", err);
    res.status(500).json({
      success: false,
      message: "Gagal memuat data heatmap",
    });
  }
};

// 3. Untuk route: /api/dashboard/status dan /api/dashboard/by-status
exports.getRisksByStatus = async (req, res) => {
  try {
    const pool = getPool();
    console.log("🟡 Getting risks by status...");

    const result = await pool.query(`
      SELECT 
        COALESCE(status, 'Open') as status,
        COUNT(*) as count
      FROM identifikasi_resiko
      GROUP BY COALESCE(status, 'Open')
      ORDER BY count DESC
    `);

    const statusData = result.rows.map((row) => ({
      name:
        row.status === "Open"
          ? "Aktif"
          : row.status === "Closed"
            ? "Ditutup"
            : row.status,
      value: parseInt(row.count),
      color:
        row.status === "Open"
          ? "#faad14"
          : row.status === "Closed"
            ? "#52c41a"
            : "#d9d9d9",
    }));

    res.json(statusData);
  } catch (err) {
    console.error("❌ getRisksByStatus error:", err);

    // Fallback dummy data
    res.json([
      { name: "Aktif", value: 2, color: "#faad14" },
      { name: "Ditutup", value: 4, color: "#52c41a" },
    ]);
  }
};

// 4. Untuk route: /api/dashboard/units dan /api/dashboard/by-unit
exports.getRisksByUnit = async (req, res) => {
  try {
    const pool = getPool();
    console.log("🟡 Getting risks by unit...");

    const result = await pool.query(`
      SELECT 
        kr.name as unit,
        COUNT(ir.id) as count
      FROM identifikasi_resiko ir
      LEFT JOIN kategori_resiko kr ON ir.kategori_id = kr.id
      GROUP BY kr.name
      ORDER BY count DESC
      LIMIT 10
    `);

    const unitData = result.rows.map((row) => ({
      name: row.unit || "Lainnya",
      count: parseInt(row.count),
    }));

    res.json(unitData);
  } catch (err) {
    console.error("❌ getRisksByUnit error:", err);

    // Fallback dummy data
    res.json([
      { name: "Operasional", count: 3 },
      { name: "Teknologi", count: 2 },
      { name: "Strategis", count: 1 },
    ]);
  }
};

// 5. Untuk route: /api/dashboard/details
exports.getDashboardDetails = async (req, res) => {
  try {
    const pool = getPool();
    console.log("🟡 Getting dashboard details...");

    const effectivenessQuery = `
      SELECT
        kp.tipe,
        COUNT(pk.kontrol_id) AS total,
        ROUND(AVG(pk.effectiveness)::numeric, 1) AS efektivitas
      FROM kontrol_pengendalian kp
      JOIN (
        SELECT DISTINCT ON (kontrol_id)
          kontrol_id,
          effectiveness
        FROM penilaian_kontrol
        ORDER BY kontrol_id, assessed_at DESC
      ) pk ON pk.kontrol_id = kp.id
      GROUP BY kp.tipe
      ORDER BY kp.tipe;
    `;

    const effectivenessResult = await pool.query(effectivenessQuery);

    res.json({
      detailedStats: {
        risksWithControls: 0,
        controlsWithoutAction: 0,
        overdueActions: 0,
        highProgressRisks: 0,
      },
      effectivenessByType: effectivenessResult.rows.map((r) => ({
        tipe: r.tipe,
        total: parseInt(r.total),
        efektivitas: parseFloat(r.efektivitas),
      })),
      actionStatusSummary: [],
      risksByStrategy: [],
    });
  } catch (err) {
    console.error("❌ getDashboardDetails error:", err);
    res.status(500).json({
      message: "Gagal memuat detail dashboard",
    });
  }
};
