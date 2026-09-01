const express = require('express')
const router = express.Router()
const auth = require('../middlewares/authMiddleware')
const riskFilter = require('../middlewares/riskFilter')
const evaluasi = require('../controllers/evaluasiController')

router.use(auth)
router.use(riskFilter)

router.get('/riwayat/:risk_id', evaluasi.getRiwayatByRisk)
router.get('/', evaluasi.getEvaluasi)
router.get('/stats', evaluasi.getStatsEvaluasi)
router.post('/', evaluasi.createEvaluasi)
router.put('/:id', evaluasi.updateEvaluasi)

module.exports = router
