const express = require('express')
const router = express.Router()

const auth = require('../middlewares/authMiddleware')
const riskFilter = require('../middlewares/riskFilter')

const {
  getKejadianRisiko,
  createKejadianRisiko,
  updateKejadianRisiko,
  getKejadianRisikoByRiskId,
} = require('../controllers/pencatatanKejadianRisikoController')

router.use(auth)
router.use(riskFilter)

router.get('/', getKejadianRisiko)
router.get('/:risk_id', getKejadianRisikoByRiskId)
router.post('/add', createKejadianRisiko)
router.put('/update/:id', updateKejadianRisiko)

module.exports = router

