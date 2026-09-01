// celahRoutes.js - sementara
const express = require('express')
const router = express.Router()
const auth = require('../middlewares/authMiddleware');
const riskFilter = require('../middlewares/riskFilter');
const celahController = require('../controllers/celahController')

router.use(auth);
router.use(riskFilter);

router.get('/risiko', celahController.getRisikoTreat)
router.get('/kontrol/:risk_id', celahController.getKontrolByRisk)
router.get('/summary/:risk_id', celahController.getSummary)
router.post('/kontrol', celahController.createKontrol)
router.post('/hitung/:kontrol_id', celahController.hitungEfektivitas) 

module.exports = router