const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

router.use(auth);
router.use(authMiddleware);
// Dashboard routes
router.get('/stats', dashboardController.getDashboardStats);
router.get('/trend', dashboardController.getProgressTrend);
router.get('/status', dashboardController.getRisksByStatus);
router.get('/units', dashboardController.getRisksByUnit);
//router.get('/details', dashboardController.getDashboardDetails);
router.get('/', dashboardController.getDashboardStats); 
//router.get('/progress-trend', dashboardController.getProgressTrend)
router.get('/risk-heatmap', dashboardController.getRiskHeatmap)

module.exports = router;