/* eslint-disable prettier/prettier */
const { getPool } = require('../config/db') // <-- UBAH INI!

// GET semua konteks risiko
// GET semua konteks risiko
exports.getKonteks = async (req, res) => {
  try {
    const pool = getPool()
    const user = req.user // <-- TAMBAHKAN!

    console.log('👤 User akses konteks:', user?.email, 'Role:', user?.role) // <-- LOG

    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 5
    const offset = (page - 1) * limit

    // CEK TABEL
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'konteks_resiko'
      );
    `)

    if (!tableCheck.rows[0].exists) {
      console.log('⚠️ Tabel konteks_resiko belum ada')
      return res.json({
        data: [],
        total: 0,
        page,
        limit,
      })
    }

    const data = await pool.query(
      `SELECT *
       FROM konteks_resiko
       WHERE status = true
       ORDER BY dibuat_pada DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )

    const total = await pool.query(`SELECT COUNT(*) FROM konteks_resiko WHERE status = true`)

    console.log(`✅ Mendapatkan ${data.rows.length} konteks`)

    res.json({
      data: data.rows,
      total: parseInt(total.rows[0].count),
      page,
      limit,
    })
  } catch (error) {
    console.error('❌ GET KONTEKS ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

// CREATE konteks
exports.createKonteks = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const {
      politik_ekonomi,
      sosial_teknologi,
      hukum_regulasi,
      lingkungan,
      sasaran_strategis,
      kapabilitas_sumber_daya,
      struktur_budaya,
      ambang_dampak_rp,
      metode_evaluasi,
      selera_resiko,
      periode,
      unit_kerja,
      dibuat_oleh,
    } = req.body

    const result = await pool.query(
      `INSERT INTO konteks_resiko (
        politik_ekonomi,
        sosial_teknologi,
        hukum_regulasi,
        lingkungan,
        sasaran_strategis,
        kapabilitas_sumber_daya,
        struktur_budaya,
        ambang_dampak_rp,
        metode_evaluasi,
        selera_resiko,
        periode,
        unit_kerja,
        dibuat_oleh,
        status,
        dibuat_pada
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,NOW()
      )
      RETURNING *`,
      [
        politik_ekonomi,
        sosial_teknologi,
        hukum_regulasi,
        lingkungan,
        sasaran_strategis,
        kapabilitas_sumber_daya,
        struktur_budaya,
        ambang_dampak_rp ? Number(ambang_dampak_rp) : null,
        metode_evaluasi,
        selera_resiko,
        periode,
        unit_kerja,
        dibuat_oleh,
      ],
    )

    return res.status(201).json({
      message: 'Konteks risiko berhasil disimpan',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ CREATE KONTEKS ERROR:', error)
    return res.status(500).json({
      message: error.message,
      detail: error.detail,
      code: error.code,
    })
  }
}

// UPDATE konteks
exports.updateKonteks = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const { id } = req.params

    const result = await pool.query(
      `UPDATE konteks_resiko
       SET unit_kerja=$1, periode=$2, metode_evaluasi=$3, selera_resiko=$4, ambang_dampak_rp=$5
       WHERE id=$6
       RETURNING *`,
      [
        req.body.unit_kerja,
        req.body.periode,
        req.body.metode_evaluasi,
        req.body.selera_resiko,
        req.body.ambang_dampak_rp,
        id,
      ],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Konteks tidak ditemukan' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('❌ UPDATE KONTEKS ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

// DELETE konteks (soft delete)
exports.deleteKonteks = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const { id } = req.params

    const result = await pool.query(
      `UPDATE konteks_resiko
       SET status = false
       WHERE id = $1
       RETURNING id, unit_kerja, status`,
      [id],
    )

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: 'Data tidak ditemukan / ID tidak cocok',
      })
    }

    res.json({
      message: 'Konteks risiko berhasil dihapus',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ DELETE KONTEKS ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}
