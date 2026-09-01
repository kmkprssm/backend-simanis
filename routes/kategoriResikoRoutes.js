const express = require('express')
const router = express.Router()

// 🔥 IMPORT MIDDLEWARE
const auth = require('../middlewares/authMiddleware');
const {
  getKategoriResiko,
  getKategoriResikoById,
  createKategoriResiko,
  updateKategoriResiko,
  deleteKategoriResiko
} = require('../controllers/kategoriResikoController')

// 🔐 PAKAI MIDDLEWARE (kategori tidak perlu filter karena data master)
router.use(auth);

// ✅ Routes
router.get('/', getKategoriResiko)
router.get('/:id', getKategoriResikoById)
router.post('/', createKategoriResiko)
router.put('/:id', updateKategoriResiko)
router.delete('/:id', deleteKategoriResiko)

module.exports = router