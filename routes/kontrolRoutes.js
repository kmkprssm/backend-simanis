const express = require('express')
const router = express.Router()

// 🔥 IMPORT MIDDLEWARE
const auth = require('../middlewares/authMiddleware');
const riskFilter = require('../middlewares/riskFilter');
const kontrolController = require('../controllers/kontrolController');

// 🔐 PAKAI MIDDLEWARE
router.use(auth);
router.use(riskFilter);

// ✅ Routes untuk KONTROL
router.get('/', kontrolController.getAllKontrol);
router.get('/:risk_id', kontrolController.getKontrolByRisk);
router.post('/', kontrolController.createKontrol);
router.put('/:id', kontrolController.updateKontrol);
router.delete('/:id', kontrolController.deleteKontrol);
router.get('/status/:kontrol_id', kontrolController.getStatusKontrol);

module.exports = router