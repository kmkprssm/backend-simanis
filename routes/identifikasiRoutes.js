const express = require('express')
const router = express.Router()

// 🔥 IMPORT MIDDLEWARE
const auth = require('../middlewares/authMiddleware')
const riskFilter = require('../middlewares/riskFilter')

const identifikasiController = require('../controllers/identifikasiController')

// 🔐 PAKAI MIDDLEWARE - URUTAN PENTING!
router.use(auth) // <-- PERTAMA: auth dulu
router.use(riskFilter) // <-- KEDUA: baru filter

// ✅ Routes
router.get('/', identifikasiController.getIdentifikasi)
router.get('/:id', identifikasiController.getIdentifikasiById)
router.get('/active/mitigasi', identifikasiController.getRisikoAktifWithMitigasi)
router.get('/stats/risiko', identifikasiController.getStatsRisiko)
router.get('/stats/mitigasi', identifikasiController.getStatsRisikoWithMitigasi)
router.post('/', identifikasiController.createIdentifikasi)
router.put('/:id', identifikasiController.updateIdentifikasi)
router.delete('/:id', identifikasiController.deleteIdentifikasi)

module.exports = router
