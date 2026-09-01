const express = require('express')
const router = express.Router()
const heatmapController = require('../controllers/heatmapController')

router.get('/risk-heatmap', heatmapController.getRiskHeatmap)

module.exports = router
