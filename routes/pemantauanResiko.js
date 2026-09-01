const express = require('express')
const router = express.Router()

// 🔥 IMPORT MIDDLEWARE
const auth = require('../middlewares/authMiddleware');
const riskFilter = require('../middlewares/riskFilter');
const controller = require('../controllers/pemantauanResikoController')

// 🔐 PASANG MIDDLEWARE UNTUK SEMUA ROUTE
router.use(auth);
router.use(riskFilter);

// ✅ Routes
router.get('/', controller.getAll)
router.get('/by-risk/:risk_id', controller.getByRisk)
router.post('/', controller.create)
router.put('/:id', controller.update)     
router.delete('/:id', controller.delete)   

module.exports = router