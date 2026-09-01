const { getPool } = require('../config/db');  // <-- UBAH INI!

/* =============================
   RISIKO STATUS TREAT (HANYA YANG BELUM CLOSED)
   - DENGAN FILTER BERDASARKAN ROLE!
============================= */
exports.getRisikoTreat = async (req, res) => {
  try {
    const pool = getPool();  
    const user = req.user;
    const filter = req.filter;  
    
    console.log('👤 User:', user?.email, 'Role:', user?.role);
    console.log('🔍 Filter:', filter);

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

    // 🔥 FILTER DARI RISKFILTER MIDDLEWARE
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
    console.error('❌ getRisikoTreat error:', err);
    res.status(500).json({ message: 'Gagal memuat risiko TREAT' });
  }
};

/* =============================
   CREATE KONTROL PENGENDALIAN
   - DENGAN CEK KEPEMILIKAN RISIKO!
============================= */
exports.createKontrol = async (req, res) => {
  try {
    const pool = getPool();  // <-- TAMBAHKAN INI!
    const user = req.user;
    const filter = req.filter;
    const { risk_id, nama_kontrol, tipe, deskripsi } = req.body;

    console.log('📝 Create kontrol oleh user:', user.id, user.email);
    console.log('Body:', req.body);

    // Validasi input
    if (!risk_id || !nama_kontrol || !tipe) {
      return res.status(400).json({ 
        message: 'risk_id, nama_kontrol, dan tipe wajib diisi' 
      });
    }

    // 🔥 CEK APAKAH RISIKO INI MILIK USER? (via filter)
    if (filter?.created_by_uuid) {
      const cekRisiko = await pool.query(
        'SELECT id, nama_resiko, status, created_by_uuid FROM identifikasi_resiko WHERE id = $1',
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

    // Normalisasi tipe sesuai constraint database
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

    // INSERT kontrol dengan created_by_uuid
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
    console.error('❌ createKontrol error:', err);
    
    if (err.code === '23503') {
      return res.status(400).json({ message: 'Risk ID tidak valid' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ message: 'Tipe kontrol tidak sesuai' });
    }
    
    res.status(500).json({ message: 'Gagal menambahkan kontrol: ' + err.message });
  }
};

/* =============================
   DAFTAR KONTROL + PENILAIAN
   - DENGAN FILTER BERDASARKAN ROLE!
============================= */
exports.getKontrolByRisk = async (req, res) => {
  try {
    const pool = getPool();
    const { risk_id } = req.params;
    const user = req.user;
    const filter = req.filter;

    // 🔥 LOG UNTUK DEBUG
    console.log('🔍 ===== DEBUG KONTROL =====');
    console.log('📌 risk_id:', risk_id);
    console.log('👤 user:', user?.email, 'role:', user?.role);
    console.log('📋 filter:', filter);
    console.log('🔑 filter.created_by_uuid:', filter?.created_by_uuid);

    // 🔥 CEK APAKAH USER BERHAK LIHAT RISIKO INI?
    if (filter?.created_by_uuid) {
      console.log('🔍 Mengecek kepemilikan risiko...');
      
      const cekRisiko = await pool.query(
        'SELECT id, created_by_uuid, nama_resiko FROM identifikasi_resiko WHERE id = $1',
        [risk_id]
      );
      
      console.log('📊 Hasil cek risiko:', cekRisiko.rows[0]);
      
      if (cekRisiko.rows.length === 0) {
        console.log('❌ Risiko tidak ditemukan!');
        return res.status(404).json({ message: 'Risiko tidak ditemukan' });
      }
      
      console.log('📌 created_by_uuid di database:', cekRisiko.rows[0].created_by_uuid);
      console.log('📌 filter.created_by_uuid:', filter.created_by_uuid);
      console.log('📌 Apakah sama?', cekRisiko.rows[0].created_by_uuid === filter.created_by_uuid);
      
      if (cekRisiko.rows[0].created_by_uuid !== filter.created_by_uuid) {
        console.log('❌ AKSES DITOLAK! User bukan pemilik risiko');
        return res.status(403).json({ 
          message: 'Anda hanya bisa melihat kontrol pada risiko milik sendiri' 
        });
      }
      
      console.log('✅ Akses diterima, melanjutkan...');
    }

    // 🔥 CEK LANGSUNG DI DATABASE
    console.log('🔍 Mengecek kontrol di database untuk risk_id:', risk_id);
    
    const cekKontrol = await pool.query(
      'SELECT id, nama_kontrol FROM kontrol_pengendalian WHERE risk_id = $1',
      [risk_id]
    );
    
    console.log('📊 Jumlah kontrol di database:', cekKontrol.rows.length);
    if (cekKontrol.rows.length > 0) {
      console.log('📋 Daftar kontrol:', cekKontrol.rows);
    }

    const query = `
      SELECT 
        k.id,
        k.nama_kontrol,
        k.tipe,
        k.deskripsi,
        k.created_by_uuid,
        COALESCE(pk.effectiveness, 0) AS effectiveness,
        COALESCE(pk.status, 'Belum Dinilai') AS status,
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

    console.log('🔍 Menjalankan query kontrol...');
    const { rows } = await pool.query(query, [risk_id]);
    
    console.log(`✅ Query selesai, mendapatkan ${rows.length} kontrol`);
    console.log('📋 Data kontrol:', rows);
    console.log('🔍 ===== END DEBUG =====\n');
    
    res.json(rows);
    
  } catch (err) {
    console.error('❌ getKontrolByRisk error:', err);
    res.status(500).json({ message: 'Gagal memuat kontrol' });
  }
};
/* =============================
   SUMMARY & RESIDUAL
   - DENGAN CEK AKSES!
============================= */
exports.getSummary = async (req, res) => {
  try {
    const pool = getPool();  // <-- TAMBAHKAN INI!
    const { risk_id } = req.params;
    const user = req.user;
    const filter = req.filter;

    // 🔥 CEK AKSES
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

    const query = `
      SELECT
        COALESCE(AVG(pk.effectiveness), 0) AS avg_effectiveness,
        COALESCE(pr.score, 0) *
        (1 - COALESCE(AVG(pk.effectiveness), 0) / 100) AS residual_score
      FROM penilaian_resiko pr
      LEFT JOIN kontrol_pengendalian kp ON kp.risk_id = pr.risk_id
      LEFT JOIN (
        SELECT DISTINCT ON (kontrol_id)
          kontrol_id,
          effectiveness
        FROM penilaian_kontrol
        ORDER BY kontrol_id, assessed_at DESC
      ) pk ON pk.kontrol_id = kp.id
      WHERE pr.risk_id = $1
      GROUP BY pr.score
    `;

    const { rows } = await pool.query(query, [risk_id]);

    res.json(rows[0] || {
      avg_effectiveness: 0,
      residual_score: 0
    });
    
  } catch (err) {
    console.error('❌ getSummary error:', err);
    res.status(500).json({ message: 'Gagal menghitung summary risiko' });
  }
};

/* =============================
   HITUNG EFEKTIVITAS KONTROL
   - SESUAIKAN DENGAN STRUKTUR TABEL!
============================= */
exports.hitungEfektivitas = async (req, res) => {
  try {
    const pool = getPool();  // <-- TAMBAHKAN INI!
    const { kontrol_id } = req.params;
    const user = req.user;
    const filter = req.filter;
    
    // 🔥 CEK APAKAH KONTROL INI MILIK USER?
    if (filter?.created_by_uuid) {
      const cekKontrol = await pool.query(`
        SELECT k.*, i.created_by_uuid 
        FROM kontrol_pengendalian k
        JOIN identifikasi_resiko i ON i.id = k.risk_id
        WHERE k.id = $1
      `, [kontrol_id]);
      
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

    // 1. Validasi kontrol
    const kontrolResult = await pool.query(
      'SELECT id, nama_kontrol FROM kontrol_pengendalian WHERE id = $1',
      [kontrol_id]
    );
    
    if (kontrolResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Kontrol tidak ditemukan'
      });
    }
    
    const kontrolName = kontrolResult.rows[0].nama_kontrol;
    
    // 2. Ambil semua action terkait
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
      FROM public.action_kontrol
      WHERE kontrol_id = $1
    `;
    
    const { rows: actions } = await pool.query(actionQuery, [kontrol_id]);
    
    let effectiveness = 0;
    let statusLabel = 'INEFFECTIVE';
    
    if (actions.length === 0) {
      effectiveness = 0;
      statusLabel = 'INEFFECTIVE';
    } else {
      // 3. Hitung effectiveness berdasarkan weight
      const WEIGHTS = {
        'Closed': 100,
        'On Progress': 50,
        'Open': 0,
        'Overdue': 0
      };
      
      let totalScore = 0;
      actions.forEach(({ status }) => {
        totalScore += WEIGHTS[status] || 0;
      });
      
      effectiveness = Math.round(totalScore / actions.length);
      
      // 4. Tentukan status
      if (effectiveness >= 80) {
        statusLabel = 'EFFECTIVE';
      } else if (effectiveness >= 20) {
        statusLabel = 'PARTIAL';
      } else {
        statusLabel = 'INEFFECTIVE';
      }
    }
    
    // 5. Simpan hasil penilaian
    const saveQuery = `
      INSERT INTO penilaian_kontrol 
      (id, kontrol_id, effectiveness, status, assessed_at, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
      RETURNING *
    `;
    
    await pool.query(saveQuery, [kontrol_id, effectiveness, statusLabel]);
    
    // 6. Kirim response
    res.json({
      success: true,
      effectiveness,
      status: statusLabel,
      total_actions: actions.length,
      kontrol_name: kontrolName
    });
    
  } catch (err) {
    console.error('❌ hitungEfektivitas error:', err);
    
    res.status(500).json({ 
      success: false,
      error: 'Gagal menghitung efektivitas',
      detail: err.message
    });
  }
};