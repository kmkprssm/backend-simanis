/* eslint-disable prettier/prettier */
// middleware/riskFilter.js
const riskFilter = (req, res, next) => {
  try {
    // Dapatkan user dari middleware auth
    const user = req.user;

    // Log untuk debugging
    console.log("🔍 RiskFilter - User:", {
      id: user?.id,
      role: user?.role,
      email: user?.email,
    });

    // 🔥 PASTIKAN FILTER DIBUAT DENGAN BENAR
    if (!user) {
      console.log("⚠️ RiskFilter: No user found");
      req.filter = {};
      return next();
    }

    // Buat object filter yang akan digunakan di controller
    if (user.role === "ADMIN") {
      // ADMIN melihat semua data
      req.filter = {};
      console.log("📋 ADMIN - tanpa filter (melihat semua data)");
    } else if (user.role === "GUEST") {
      // ADMIN melihat semua data
      req.filter = {};
      console.log("📋 GUEST - tanpa filter (melihat semua data)");
    } else {
      // USER hanya melihat data miliknya sendiri
      req.filter = {
        created_by_uuid: user.id,
      };
      console.log("📋 USER - filter berdasarkan created_by_uuid:", user.id);
    }

    next();
  } catch (error) {
    console.error("❌ Error di riskFilter:", error);
    req.filter = {};
    next(error);
  }
};

module.exports = riskFilter;
