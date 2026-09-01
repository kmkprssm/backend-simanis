/* eslint-disable prettier/prettier */
const { getPool } = require('../config/db') // <-- UBAH INI!

// GET semua kategori risiko
exports.getKategoriResiko = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!

    console.log('📋 Mengambil semua kategori risiko...')

    const result = await pool.query(
      `SELECT id, name
       FROM kategori_resiko
       ORDER BY id`,
    )

    console.log(`✅ Mendapatkan ${result.rows.length} kategori`)
    res.json(result.rows)
  } catch (error) {
    console.error('❌ GET KATEGORI RESIKO ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

// GET kategori risiko by ID (tambahan untuk detail)
exports.getKategoriResikoById = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const { id } = req.params

    const result = await pool.query(
      `SELECT id, name, deskripsi, color 
       FROM kategori_resiko 
       WHERE id = $1`,
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Kategori tidak ditemukan' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('❌ GET KATEGORI BY ID ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}

// CREATE kategori risiko baru
exports.createKategoriResiko = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const { name, deskripsi, color } = req.body

    if (!name) {
      return res.status(400).json({ message: 'Nama kategori wajib diisi' })
    }

    const result = await pool.query(
      `INSERT INTO kategori_resiko (name, deskripsi, color, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, name, deskripsi, color`,
      [name, deskripsi || '', color || '#1890ff'],
    )

    res.status(201).json({
      message: 'Kategori risiko berhasil ditambahkan',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ CREATE KATEGORI ERROR:', error)

    if (error.code === '23505') {
      return res.status(400).json({
        message: 'Nama kategori sudah digunakan',
      })
    }

    res.status(500).json({ message: error.message })
  }
}

// UPDATE kategori risiko
exports.updateKategoriResiko = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const { id } = req.params
    const { name, deskripsi, color } = req.body

    const result = await pool.query(
      `UPDATE kategori_resiko 
       SET name = COALESCE($1, name),
           deskripsi = COALESCE($2, deskripsi),
           color = COALESCE($3, color),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, deskripsi, color`,
      [name, deskripsi, color, id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Kategori tidak ditemukan' })
    }

    res.json({
      message: 'Kategori risiko berhasil diupdate',
      data: result.rows[0],
    })
  } catch (error) {
    console.error('❌ UPDATE KATEGORI ERROR:', error)

    if (error.code === '23505') {
      return res.status(400).json({
        message: 'Nama kategori sudah digunakan',
      })
    }

    res.status(500).json({ message: error.message })
  }
}

// DELETE kategori risiko
exports.deleteKategoriResiko = async (req, res) => {
  try {
    const pool = getPool() // <-- TAMBAHKAN INI!
    const { id } = req.params

    // Cek apakah kategori digunakan di identifikasi_resiko
    const checkUsage = await pool.query(
      'SELECT id FROM identifikasi_resiko WHERE kategori_id = $1 LIMIT 1',
      [id],
    )

    if (checkUsage.rows.length > 0) {
      return res.status(400).json({
        message: 'Kategori tidak dapat dihapus karena masih digunakan oleh data risiko',
      })
    }

    const result = await pool.query('DELETE FROM kategori_resiko WHERE id = $1 RETURNING id', [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Kategori tidak ditemukan' })
    }

    res.json({
      message: 'Kategori risiko berhasil dihapus',
    })
  } catch (error) {
    console.error('❌ DELETE KATEGORI ERROR:', error)
    res.status(500).json({ message: error.message })
  }
}
