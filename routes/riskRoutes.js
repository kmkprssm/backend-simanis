const express = require('express')
const router = express.Router()

// 🔥 IMPORT MIDDLEWARE
const auth = require('../middlewares/authMiddleware')
const riskFilter = require('../middlewares/riskFilter')
const riskController = require('../controllers/riskController')

// 🔐 PASANG MIDDLEWARE UNTUK SEMUA ROUTE
router.use(auth)
router.use(riskFilter)

// Untuk menu Pemantauan
router.get('/active/monitoring', riskController.getActiveRisksForMonitoring)
router.get('/monitoring', riskController.getRisksForMonitoring)
router.get('/monitoring/:id', riskController.getRiskDetailWithMitigasiAndSummary)
router.get('/choosed', riskController.getRisksForChoosed)
router.get('/closed', riskController.getClosedRisks)

// Untuk close risk dari Pengendalian
router.put('/:id/close', riskController.closeRisk)

// Untuk update progress dari Pemantauan
router.put('/:risk_id/monitoring/progress', riskController.updateMonitoringProgress)

module.exports = router
