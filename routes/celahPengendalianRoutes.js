const express = require('express')
const router = express.Router()
const controller = require('../controllers/celahPengendalianController')
const auth = require('../middlewares/authMiddleware')
const riskFilter = require('../middlewares/riskFilter')

// TERAPKAN MIDDLEWARE AUTH DULU!
router.use(auth)
router.use(riskFilter)

// Routes yang sudah ada
router.get('/risiko', controller.getRisiko)
router.get('/risiko/stats', controller.getRisikoStats)
router.get('/kontrol/:risk_id', controller.getKontrolByRisiko)

// Routes tambahan yang diperlukan
router.get('/summary/:risk_id', controller.getSummary)
router.post('/hitung/:kontrolId', controller.hitungEfektivitas)
router.post('/hitung-simpan/:kontrolId', controller.hitungDanSimpanEfektivitas)

module.exports = router
