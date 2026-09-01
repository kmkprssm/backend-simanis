const { getPool } = require('../config/db');

/**
 * GET risiko dengan strategi TREAT (yang belum closed)
 * DENGAN FILTER BERDASARKAN ROLE
 */
exports.getRisikoTreat = async (req, res, next) => {
  try {
    const pool = getPool();
    const filter = req.filter;
    
    console.log('🔍 getRisikoTreat - Filter:', filter);

    let query = `
      SELECT
        er.risk_id,
        ir.nama_resiko,
        ir.deskripsi,
        ir.status,
        ir.created_by_uuid,
        u.username AS pemilik_risiko
      FROM evaluasi_resiko er
      JOIN identifikasi_resiko ir ON ir.id = er.risk_id
      LEFT JOIN users u ON ir.created_by_uuid = u.id
      WHERE er.strategi = 'TREAT'
        AND er.is_active = true
        AND (ir.status IS NULL OR ir.status != 'Closed')
    `;
    
    let params = [];
    let conditions = [];

    // FILTER DARI RISKFILTER MIDDLEWARE
    if (filter?.created_by_uuid) {
      conditions.push(`ir.created_by_uuid = $${params.length + 1}`);
      params.push(filter.created_by_uuid);
    }

    if (conditions.length > 0) {
      query += ` AND ` + conditions.join(' AND ');
    }

    query += ` ORDER BY ir.nama_resiko`;

    console.log('📝 Query:', query);
    console.log('📦 Params:', params);

    const { rows } = await pool.query(query, params);
    console.log(`✅ Mendapatkan ${rows.length} data risiko TREAT`);
    
    res.json(rows);
    
  } catch (err) {
    console.error('❌ Error di getRisikoTreat:', err);
    res.status(500).json({ 
      message: 'Gagal memuat risiko TREAT', 
      error: err.message 
    });
  }
};

/**
 * GET kontrol berdasarkan risk_id dengan penilaian terbaru
 * DENGAN FILTER BERDASARKAN ROLE
 */
exports.getKontrolByRisk = async (req, res, next) => {
  try {
    const pool = getPool();
    const { risk_id } = req.params;
    const filter = req.filter;
    
    console.log('🔍 getKontrolByRisk - risk_id:', risk_id);
    console.log('🔍 Filter:', filter);

    // CEK AKSES KE RISIKO
    if (filter?.created_by_uuid) {
      const cekRisiko = await pool.query(
        'SELECT created_by_uuid FROM identifikasi_resiko WHERE id = $1',
        [risk_id]
      );
      
      if (cekRisiko.rows.length === 0) {
        return res.status(404).json({ message: 'Risiko tidak ditemukan' });
      }
      
      if (cekRisiko.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({ 
          message: 'Anda hanya bisa melihat kontrol pada risiko milik sendiri' 
        });
      }
    }
    
    const query = `
      SELECT 
        k.id,
        k.risk_id,
        k.nama_kontrol,
        k.tipe,
        k.deskripsi,
        k.created_by_uuid,
        k.created_at,
        k.updated_at,
        COALESCE(pk.effectiveness, 0) AS effectiveness,
        COALESCE(pk.status, 'Belum Dinilai') AS status_penilaian,
        (
          SELECT COUNT(*) 
          FROM action_kontrol a 
          WHERE a.kontrol_id = k.id
        ) AS total_action,
        (
          SELECT COUNT(*) 
          FROM action_kontrol a 
          WHERE a.kontrol_id = k.id AND a.status = 'Closed'
        ) AS closed_action
      FROM kontrol_pengendalian k
      LEFT JOIN (
        SELECT DISTINCT ON (kontrol_id)
          kontrol_id,
          effectiveness,
          status
        FROM penilaian_kontrol
        ORDER BY kontrol_id, assessed_at DESC
      ) pk ON pk.kontrol_id = k.id
      WHERE k.risk_id = $1
      ORDER BY k.nama_kontrol
    `;
    
    const { rows } = await pool.query(query, [risk_id]);
    console.log(`✅ Mendapatkan ${rows.length} kontrol`);
    
    res.json(rows);
    
  } catch (err) {
    console.error('❌ Error di getKontrolByRisk:', err);
    res.status(500).json({ 
      message: 'Gagal memuat kontrol', 
      error: err.message 
    });
  }
};

/**
 * POST create kontrol baru
 * DENGAN CEK KEPEMILIKAN RISIKO
 */
exports.createKontrol = async (req, res, next) => {
  try {
    const pool = getPool();
    const user = req.user;
    const filter = req.filter;
    const { risk_id, nama_kontrol, tipe, deskripsi } = req.body;

    console.log('📝 Create kontrol oleh user:', user?.id, user?.email);
    console.log('Body:', req.body);

    // Validasi input
    if (!risk_id || !nama_kontrol || !tipe) {
      return res.status(400).json({ 
        message: 'risk_id, nama_kontrol, dan tipe wajib diisi' 
      });
    }

    // CEK KEPEMILIKAN RISIKO
    if (filter?.created_by_uuid) {
      const cekRisiko = await pool.query(
        'SELECT id, status, created_by_uuid FROM identifikasi_resiko WHERE id = $1',
        [risk_id]
      );
      
      if (cekRisiko.rows.length === 0) {
        return res.status(404).json({ message: 'Risiko tidak ditemukan' });
      }
      
      if (cekRisiko.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({ 
          message: 'Anda hanya bisa menambah kontrol ke risiko milik sendiri' 
        });
      }

      // Cek apakah risiko sudah closed?
      if (cekRisiko.rows[0].status === 'Closed' || cekRisiko.rows[0].status === 'CLOSED') {
        return res.status(400).json({ 
          message: 'Tidak dapat menambah kontrol ke risiko yang sudah CLOSED' 
        });
      }
    }

    // Normalisasi tipe
    const mapTipe = {
      'preventif': 'PREVENTIVE',
      'detektif': 'DETECTIVE',
      'korektif': 'CORRECTIVE',
      'preventive': 'PREVENTIVE',
      'detective': 'DETECTIVE',
      'corrective': 'CORRECTIVE'
    };
    const key = tipe?.toLowerCase().trim();
    const tipeFinal = mapTipe[key] || tipe;

    // INSERT kontrol
    const query = `
      INSERT INTO kontrol_pengendalian
      (id, risk_id, nama_kontrol, tipe, deskripsi, created_by_uuid, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, [
      risk_id,
      nama_kontrol,
      tipeFinal,
      deskripsi || null,
      user.id
    ]);

    res.status(201).json({
      message: '✅ Kontrol berhasil ditambahkan',
      data: rows[0]
    });
    
  } catch (err) {
    console.error('❌ Error di createKontrol:', err);
    
    if (err.code === '23503') {
      return res.status(400).json({ message: 'Risk ID tidak valid' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ message: 'Tipe kontrol tidak sesuai' });
    }
    
    res.status(500).json({ 
      message: 'Gagal menambahkan kontrol: ' + err.message 
    });
  }
};

/**
 * GET summary efektivitas dan residual berdasarkan risk_id
 * DENGAN FILTER BERDASARKAN ROLE
 */
exports.getSummary = async (req, res, next) => {
  try {
    const pool = getPool();
    const { risk_id } = req.params;
    const filter = req.filter;
    
    console.log('📝 Get summary untuk risk_id:', risk_id);

    // CEK AKSES KE RISIKO
    if (filter?.created_by_uuid) {
      const cekRisiko = await pool.query(
        'SELECT created_by_uuid FROM identifikasi_resiko WHERE id = $1',
        [risk_id]
      );
      
      if (cekRisiko.rows.length === 0) {
        return res.status(404).json({ message: 'Risiko tidak ditemukan' });
      }
      
      if (cekRisiko.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({ 
          message: 'Anda tidak memiliki akses ke summary risiko ini' 
        });
      }
    }
    
    // Hitung rata-rata efektivitas dari penilaian kontrol terbaru
    const avgQuery = `
      SELECT COALESCE(AVG(pk.effectiveness), 0) as avg_effectiveness
      FROM kontrol_pengendalian k
      LEFT JOIN (
        SELECT DISTINCT ON (kontrol_id)
          kontrol_id,
          effectiveness
        FROM penilaian_kontrol
        ORDER BY kontrol_id, assessed_at DESC
      ) pk ON pk.kontrol_id = k.id
      WHERE k.risk_id = $1
    `;
    
    const avgResult = await pool.query(avgQuery, [risk_id]);
    const avgEffectiveness = Number(avgResult.rows[0].avg_effectiveness) || 0;
    
    // Dapatkan inherent score dari penilaian_resiko
    let inherentScore = 10; // Default
    
    const riskQuery = `
      SELECT score
      FROM penilaian_resiko
      WHERE risk_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const riskResult = await pool.query(riskQuery, [risk_id]);
    
    if (riskResult.rows.length > 0 && riskResult.rows[0].score !== null) {
      inherentScore = riskResult.rows[0].score;
    }
    
    // Hitung residual: inherent * (1 - effectiveness/100)
    const residualScore = inherentScore * (1 - (avgEffectiveness / 100));
    
    console.log('✅ Summary:', { 
      avgEffectiveness, 
      residualScore: Math.max(0, residualScore),
      inherentScore 
    });
    
    res.json({
      avg_effectiveness: avgEffectiveness,
      residual_score: Math.max(0, residualScore)
    });
    
  } catch (err) {
    console.error('❌ Error di getSummary:', err);
    res.status(500).json({ 
      message: 'Gagal memuat summary', 
      error: err.message 
    });
  }
};

/**
 * POST hitung efektivitas kontrol berdasarkan action
 * DENGAN FILTER BERDASARKAN ROLE DAN SIMPAN KE DATABASE
 */
exports.hitungEfektivitas = async (req, res, next) => {
  try {
    const pool = getPool();
    const { kontrolId } = req.params;
    const filter = req.filter;
    
    console.log('📝 Hitung efektivitas untuk kontrolId:', kontrolId);

    // CEK KEPEMILIKAN KONTROL
    if (filter?.created_by_uuid) {
      const cekKontrol = await pool.query(`
        SELECT k.*, i.created_by_uuid 
        FROM kontrol_pengendalian k
        JOIN identifikasi_resiko i ON i.id = k.risk_id
        WHERE k.id = $1
      `, [kontrolId]);
      
      if (cekKontrol.rows.length === 0) {
        return res.status(404).json({ 
          success: false,
          error: 'Kontrol tidak ditemukan' 
        });
      }
      
      if (cekKontrol.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({ 
          success: false,
          error: 'Anda hanya bisa menghitung efektivitas kontrol milik sendiri' 
        });
      }
    }
    
    // Ambil semua action untuk kontrol ini
    const actionQuery = `
      SELECT 
        id,
        action_plan,
        CASE
          WHEN status != 'Closed'
               AND target_date IS NOT NULL
               AND target_date < CURRENT_DATE
            THEN 'Overdue'
          ELSE status
        END AS status
      FROM action_kontrol
      WHERE kontrol_id = $1
    `;
    
    const actionResult = await pool.query(actionQuery, [kontrolId]);
    const actions = actionResult.rows;
    
    console.log('📝 Actions ditemukan:', actions.length);
    
    // Hitung efektivitas berdasarkan bobot status
    const WEIGHTS = {
      'Closed': 100,
      'On Progress': 50,
      'Open': 0,
      'Overdue': 0
    };
    
    let totalScore = 0;
    actions.forEach(action => {
      totalScore += WEIGHTS[action.status] || 0;
    });
    
    const effectiveness = actions.length > 0 ? Math.round(totalScore / actions.length) : 0;
    
    // Tentukan status berdasarkan effectiveness
    let statusLabel = 'INEFFECTIVE';
    if (effectiveness >= 80) {
      statusLabel = 'EFFECTIVE';
    } else if (effectiveness >= 20) {
      statusLabel = 'PARTIAL';
    }
    
    // SIMPAN KE DATABASE
    const saveQuery = `
      INSERT INTO penilaian_kontrol 
      (id, kontrol_id, effectiveness, status, assessed_at, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
      RETURNING *
    `;
    
    await pool.query(saveQuery, [kontrolId, effectiveness, statusLabel]);
    
    res.json({
      success: true,
      message: '✅ Efektivitas berhasil dihitung dan disimpan',
      data: {
        kontrol_id: kontrolId,
        effectiveness: effectiveness,
        status: statusLabel,
        total_actions: actions.length,
        calculated_at: new Date().toISOString()
      }
    });
    
  } catch (err) {
    console.error('❌ Error di hitungEfektivitas:', err);
    res.status(500).json({ 
      success: false,
      message: 'Gagal menghitung efektivitas', 
      error: err.message 
    });
  }
};

// ===== EXPORT SEMUA FUNGSI =====
module.exports = {
  getRisikoTreat,
  getKontrolByRisk,
  createKontrol,
  getSummary,
  hitungEfektivitas
};