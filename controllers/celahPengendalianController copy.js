const { getPool } = require('../config/db');

/**
 * GET semua risiko untuk dropdown (yang belum closed)
 */
exports.getRisiko = async (req, res, next) => {
  try {
    const pool = getPool();
    
    const q = `
      SELECT id as risk_id, nama_resiko, deskripsi
      FROM identifikasi_resiko
      WHERE (status IS NULL OR status != 'Closed')
      ORDER BY created_at DESC
    `
    
    console.log('📝 Menjalankan query getRisiko');
    const { rows } = await pool.query(q)
    console.log('✅ Data ditemukan:', rows.length, 'risiko');
    
    res.json(rows)
  } catch (err) {
    console.error('❌ Error di getRisiko:', err);
    res.status(500).json({ 
      message: 'Gagal memuat risiko', 
      error: err.message 
    });
  }
}

/**
 * GET kontrol berdasarkan risk_id
 */
exports.getKontrolByRisiko = async (req, res, next) => {
  try {
    const pool = getPool();
    const { risk_id } = req.params;
    
    console.log('📝 Parameter risk_id:', risk_id);
    
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
    
    console.log('📝 Get kontrol untuk risk_id:', risk_id);
    const { rows } = await pool.query(q, [risk_id])
    console.log('✅ Kontrol ditemukan:', rows.length);
    
    // Tambahkan effectiveness 0 untuk sementara
    const formattedRows = rows.map(row => ({
      ...row,
      effectiveness: 0
    }))
    
    res.json(formattedRows)
    
  } catch (err) {
    console.error('❌ Error di getKontrolByRisiko:', err);
    res.status(500).json({ 
      message: 'Gagal memuat kontrol', 
      error: err.message 
    });
  }
}

/**
 * GET summary efektivitas dan residual berdasarkan risk_id
 */
exports.getSummary = async (req, res, next) => {
  try {
    const pool = getPool();
    const { risk_id } = req.params;
    
    console.log('📝 Get summary untuk risk_id:', risk_id);
    
    // ===== PERBAIKAN: Query yang lebih sederhana =====
    
    // 1. Hitung rata-rata efektivitas dari action
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
    
    const avgResult = await pool.query(avgQuery, [risk_id])
    const avgEffectiveness = Number(avgResult.rows[0].avg_effectiveness) || 0
    
    // 2. Dapatkan inherent score dari risiko (dengan nilai default 10)
    let inherentScore = 10
    
    try {
      const riskQuery = `
        SELECT inherent_score
        FROM identifikasi_resiko
        WHERE id = $1
      `
      
      const riskResult = await pool.query(riskQuery, [risk_id])
      
      if (riskResult.rows.length > 0 && riskResult.rows[0].inherent_score !== null) {
        inherentScore = riskResult.rows[0].inherent_score
      }
    } catch (err) {
      console.log('⚠️ Gagal mengambil inherent_score, pakai default 10');
    }
    
    // 3. Hitung residual: inherent * (1 - effectiveness/100)
    const residualScore = inherentScore * (1 - (avgEffectiveness / 100))
    
    console.log('✅ Summary:', { 
      avgEffectiveness, 
      residualScore,
      inherentScore 
    });
    
    res.json({
      avg_effectiveness: avgEffectiveness,
      residual_score: Math.max(0, residualScore)
    })
    
  } catch (err) {
    console.error('❌ Error di getSummary:', err);
    res.status(500).json({ 
      message: 'Gagal memuat summary', 
      error: err.message 
    });
  }
}

/**
 * POST hitung efektivitas kontrol berdasarkan action
 */
exports.hitungEfektivitas = async (req, res, next) => {
  try {
    const pool = getPool();
    const { kontrolId } = req.params;
    const filter = req.filter;
    
    console.log('📝 Hitung efektivitas untuk kontrolId:', kontrolId);
    
    // Cek kepemilikan
    const cekQuery = `
      SELECT k.*, i.created_by_uuid
      FROM kontrol_pengendalian k
      JOIN identifikasi_resiko i ON i.id = k.risk_id
      WHERE k.id = $1
    `
    
    const cekResult = await pool.query(cekQuery, [kontrolId])
    
    if (cekResult.rows.length === 0) {
      return res.status(404).json({ message: 'Kontrol tidak ditemukan' })
    }
    
    if (filter?.created_by_uuid && cekResult.rows[0].created_by_uuid !== filter.created_by_uuid) {
      return res.status(403).json({ 
        message: 'Anda hanya bisa menghitung efektivitas kontrol milik sendiri' 
      })
    }
    
    // Ambil semua action untuk kontrol ini
    const actionQuery = `
      SELECT status
      FROM action_kontrol
      WHERE kontrol_id = $1
    `
    
    const actionResult = await pool.query(actionQuery, [kontrolId])
    const actions = actionResult.rows
    
    console.log('📝 Actions ditemukan:', actions.length);
    
    // Hitung efektivitas berdasarkan bobot status
    const WEIGHTS = {
      'Closed': 100,
      'On Progress': 50,
      'Open': 0,
      'Overdue': 0
    }
    
    let totalScore = 0
    actions.forEach(action => {
      totalScore += WEIGHTS[action.status] || 0
    })
    
    const effectiveness = actions.length > 0 ? Math.round(totalScore / actions.length) : 0
    
    // Kembalikan hasil tanpa menyimpan ke database
    res.json({
      message: '✅ Efektivitas berhasil dihitung',
      data: {
        kontrol_id: kontrolId,
        effectiveness: effectiveness,
        total_actions: actions.length,
        calculated_at: new Date().toISOString()
      }
    })
    
  } catch (err) {
    console.error('❌ Error di hitungEfektivitas:', err);
    res.status(500).json({ 
      message: 'Gagal menghitung efektivitas', 
      error: err.message 
    });
  }
}