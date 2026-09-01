const express = require('express');
const router = express.Router();

// 🔥 IMPORT MIDDLEWARE!
const auth = require('../middlewares/authMiddleware');
const riskFilter = require('../middlewares/riskFilter');
const actionController = require('../controllers/actionController');

// 🔐 PASANG MIDDLEWARE UNTUK SEMUA ROUTE!
router.use(auth);
router.use(riskFilter);

// Routes
router.get('/', actionController.getAction);
router.get('/kontrol/:kontrol_id', actionController.getActionByKontrol);
router.post('/', actionController.createAction);
router.put('/:id', actionController.updateAction);
router.delete('/:id', actionController.deleteAction);

module.exports = router;