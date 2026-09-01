const express = require('express')
const router = express.Router()

// 🔥 IMPORT MIDDLEWARE
const auth = require('../middlewares/authMiddleware');

const { createKonteks, getKonteks, updateKonteks, deleteKonteks } = require('../controllers/konteksController')

// 🔐 PAKAI MIDDLEWARE AUTH UNTUK SEMUA ROUTES
router.use(auth);

// ✅ Routes
router.get('/', getKonteks) 
router.post('/', createKonteks)
router.put('/:id', updateKonteks)
router.delete('/:id', deleteKonteks)

module.exports = router