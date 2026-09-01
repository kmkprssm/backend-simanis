const express = require("express");
const router = express.Router();

// 🔥 IMPORT MIDDLEWARE
const auth = require("../middlewares/authMiddleware");
const riskFilter = require("../middlewares/riskFilter");
const {
  getProfileRisiko,
  createProfileRisiko,
  updateProfileRisiko,
  deleteProfileRisiko,
} = require("../controllers/profileRisikoController");

router.use(auth);
router.use(riskFilter);

// ✅ Routes
router.get("/", getProfileRisiko);
router.post("/add", createProfileRisiko);
router.patch("/update/:id", updateProfileRisiko);
router.delete("/delete/:id", deleteProfileRisiko);

module.exports = router;
