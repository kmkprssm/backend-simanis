const express = require('express')
const router = express.Router()

// 🔥 IMPORT MIDDLEWARE
const auth = require('../middlewares/authMiddleware')
const { getUsersForFilter, getUsers } = require('../controllers/userController')

// 🔐 PAKAI MIDDLEWARE AUTH UNTUK SEMUA ROUTES
router.use(auth)

// ✅ Routes
router.get('/filter', getUsersForFilter)
router.get('/all', getUsers)

module.exports = router

