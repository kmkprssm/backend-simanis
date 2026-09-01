const express = require('express')
const router = express.Router()
const controller = require('../controllers/celahPengendalianController')


// Routes yang sudah ada
router.get('/risiko', controller.getRisiko)
router.get('/kontrol/:risk_id', controller.getKontrolByRisiko)

// Routes tambahan yang diperlukan
router.get('/summary/:risk_id', controller.getSummary)
router.post('/hitung/:kontrolId', controller.hitungEfektivitas)

module.exports = router