const express = require('express')
const router = express.Router()
const auth = require('../middlewares/authMiddleware')
const riskFilter = require('../middlewares/riskFilter')
const penilaianController = require('../controllers/penilaianController')

router.use(auth)
router.use(riskFilter)

router.get('/', penilaianController.getPenilaian)
router.get('/residu', penilaianController.getAnalisisResidu)
router.post('/', penilaianController.createPenilaian)
router.post('/residu', penilaianController.saveAnalisisResidu)
router.get('/stats', penilaianController.getStatsPenilaian)
router.put('/:id', penilaianController.updatePenilaian)
router.delete('/:id', penilaianController.deletePenilaian)
router.post('/kontrol', penilaianController.createPenilaianKontrol)

module.exports = router
