const { getPool } = require('../config/db');  // <-- UBAH INI!

/**
 * =====================================================
 * GET semua action - DENGAN FILTER!
 * =====================================================
 */
exports.getAction = async (req, res) => {
  try {
    const pool = getPool();  // <-- TAMBAHKAN INI!
    const user = req.user;
    const filter = req.filter;  // <-- PAKAI FILTER DARI MIDDLEWARE

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
    `;
    
    let params = [];
    let conditions = [];

    // 🔥 FILTER DARI RISKFILTER MIDDLEWARE
    if (filter?.created_by_uuid) {
      conditions.push(`i.created_by_uuid = $${params.length + 1}`);
      params.push(filter.created_by_uuid);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY a.created_at DESC`;

    console.log('📝 Action query:', query);
    console.log('📦 Params:', params);

    const result = await pool.query(query, params);
    res.json(result.rows);
    
  } catch (error) {
    console.error('❌ GET ACTION ERROR:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * =====================================================
 * GET action berdasarkan kontrol_id
 * =====================================================
 */
exports.getActionByKontrol = async (req, res) => {
  try {
    const pool = getPool();  // <-- TAMBAHKAN INI!
    const { kontrol_id } = req.params;
    const user = req.user;
    const filter = req.filter;

    // 🔥 CEK akses via filter
    if (filter?.created_by_uuid) {
      const cek = await pool.query(`
        SELECT i.created_by_uuid 
        FROM kontrol_pengendalian k
        JOIN identifikasi_resiko i ON i.id = k.risk_id
        WHERE k.id = $1
      `, [kontrol_id]);
      
      if (cek.rows.length === 0) {
        return res.status(404).json({ message: 'Kontrol tidak ditemukan' });
      }
      
      if (cek.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({ 
          message: 'Anda hanya bisa melihat action pada kontrol milik sendiri' 
        });
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
      [kontrol_id]
    );

    res.json(result.rows);
    
  } catch (error) {
    console.error('❌ GET ACTION BY KONTROL ERROR:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * =====================================================
 * POST action plan
 * =====================================================
 */
exports.createAction = async (req, res) => {
  try {
    const pool = getPool();  // <-- TAMBAHKAN INI!
    const user = req.user;
    const filter = req.filter;
    
    const {
      kontrol_id,
      action_plan,
      pic_name,
      target_date,
      kebutuhan_sumberdaya,
      status
    } = req.body;

    console.log('📝 Create action oleh user:', user.id);

    if (!kontrol_id || !action_plan) {
      return res.status(400).json({
        message: 'Kontrol dan action plan wajib diisi'
      });
    }

    // 🔥 CEK KEPEMILIKAN KONTROL via filter
    if (filter?.created_by_uuid) {
      const cek = await pool.query(`
        SELECT k.*, i.created_by_uuid 
        FROM kontrol_pengendalian k
        JOIN identifikasi_resiko i ON i.id = k.risk_id
        WHERE k.id = $1
      `, [kontrol_id]);
      
      if (cek.rows.length === 0) {
        return res.status(404).json({ message: 'Kontrol tidak ditemukan' });
      }
      
      if (cek.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({ 
          message: 'Anda hanya bisa membuat action pada kontrol milik sendiri' 
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO action_kontrol
       (kontrol_id, action_plan, pic_name, target_date, 
        kebutuhan_sumberdaya, status, created_by_uuid, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        kontrol_id,
        action_plan,
        pic_name || '',
        target_date || null,
        kebutuhan_sumberdaya || '',
        status || 'Open',
        user.id
      ]
    );

    res.status(201).json({
      message: '✅ Action plan berhasil disimpan',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ CREATE ACTION ERROR:', error);
    res.status(500).json({ 
      message: '❌ Gagal menambah action: ' + error.message 
    });
  }
};

/**
 * =====================================================
 * PUT update status / bukti action
 * =====================================================
 */
exports.updateAction = async (req, res) => {
  try {
    const pool = getPool();  // <-- TAMBAHKAN INI!
    const { id } = req.params;
    const user = req.user;
    const filter = req.filter;
    const { status, bukti_mitigasi } = req.body;

    // 🔥 CEK kepemilikan via filter
    if (filter?.created_by_uuid) {
      const cek = await pool.query(`
        SELECT a.*, i.created_by_uuid 
        FROM action_kontrol a
        JOIN kontrol_pengendalian k ON k.id = a.kontrol_id
        JOIN identifikasi_resiko i ON i.id = k.risk_id
        WHERE a.id = $1
      `, [id]);
      
      if (cek.rows.length === 0) {
        return res.status(404).json({ message: 'Action tidak ditemukan' });
      }
      
      if (cek.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({ 
          message: 'Anda hanya bisa mengupdate action milik sendiri' 
        });
      }
    }

    const current = await pool.query(
      `SELECT status, bukti_mitigasi FROM action_kontrol WHERE id = $1`,
      [id]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ message: 'Data tidak ditemukan' });
    }

    const currentStatus = current.rows[0].status;
    const currentBukti = current.rows[0].bukti_mitigasi;

    // 🔹 update bukti saja
    if (!status && bukti_mitigasi) {
      const result = await pool.query(
        `
        UPDATE action_kontrol
        SET bukti_mitigasi = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
        `,
        [bukti_mitigasi, id]
      );

      return res.json({
        message: 'Bukti mitigasi berhasil disimpan',
        data: result.rows[0]
      });
    }

    // 🔹 validasi alur status
    const flow = {
      Open: ['On Progress'],
      'On Progress': ['Closed'],
      Closed: []
    };

    if (!flow[currentStatus]?.includes(status)) {
      return res.status(400).json({
        message: `Status ${currentStatus} → ${status} tidak diizinkan`
      });
    }

    const buktiFinal = bukti_mitigasi || currentBukti;

    if (status === 'Closed' && !buktiFinal) {
      return res.status(400).json({
        message: 'Bukti mitigasi wajib diisi sebelum Closed'
      });
    }

    const result = await pool.query(
      `
      UPDATE action_kontrol
      SET status = $1,
          bukti_mitigasi = COALESCE($2, bukti_mitigasi),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
      `,
      [status, bukti_mitigasi || null, id]
    );

    res.json({
      message: 'Status action berhasil diperbarui',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ UPDATE ACTION ERROR:', error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * =====================================================
 * DELETE action plan
 * =====================================================
 */
exports.deleteAction = async (req, res) => {
  try {
    const pool = getPool();  // <-- TAMBAHKAN INI!
    const { id } = req.params;
    const user = req.user;
    const filter = req.filter;

    // 🔥 CEK kepemilikan via filter
    if (filter?.created_by_uuid) {
      const cek = await pool.query(`
        SELECT a.*, i.created_by_uuid 
        FROM action_kontrol a
        JOIN kontrol_pengendalian k ON k.id = a.kontrol_id
        JOIN identifikasi_resiko i ON i.id = k.risk_id
        WHERE a.id = $1
      `, [id]);
      
      if (cek.rows.length === 0) {
        return res.status(404).json({ message: 'Action tidak ditemukan' });
      }
      
      if (cek.rows[0].created_by_uuid !== filter.created_by_uuid) {
        return res.status(403).json({ 
          message: 'Anda hanya bisa menghapus action milik sendiri' 
        });
      }
    }

    const checkResult = await pool.query(
      `SELECT id FROM action_kontrol WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        message: 'Action plan tidak ditemukan' 
      });
    }

    const deleteResult = await pool.query(
      `DELETE FROM action_kontrol WHERE id = $1 RETURNING id`,
      [id]
    );

    res.json({
      success: true,
      message: 'Action plan berhasil dihapus',
      deletedId: deleteResult.rows[0].id
    });

  } catch (error) {
    console.error('❌ DELETE ACTION ERROR:', error);
    res.status(500).json({ 
      message: error.message 
    });
  }
};