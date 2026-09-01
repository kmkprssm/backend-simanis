const express = require("express");
const router = express.Router();

// 🔥 IMPORT MIDDLEWARE
const auth = require("../middlewares/authMiddleware");
const riskFilter = require("../middlewares/riskFilter");
const reportController = require("../controllers/reportController");

// 🔐 PASANG MIDDLEWARE UNTUK SEMUA ROUTE
router.use(auth);
router.use(riskFilter);

// GET data laporan (JSON)
router.get("/data", reportController.getReportData);
router.get("/excel", reportController.generateExcel);
router.get("/pdf", reportController.generatePDF);
router.get("/kejadian/excel", reportController.generateKejadianExcel);
router.get("/kejadian/pdf", reportController.generateKejadianPDF);
router.get("/risk-report", reportController.getRiskReport);

module.exports = router;
