require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
// const { helmetConfig, apiLimiter } = require('./middlewares/securityMiddleware')
const { connectDB } = require("./config/db");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

/* ===============================
   1. HELMET
================================ */
// app.use(helmetConfig)

/* ===============================
   2. CORS - DIPERBAIKI UNTUK PRODUCTION
================================ */
const corsOptions = {
  origin: function (origin, callback) {
    // Izinkan request tanpa origin (Postman, curl, dll)
    if (!origin) return callback(null, true);

    // Daftar origin yang diizinkan
    const allowedOrigins = [
      "https://apprssm.rssoedono.jatimprov.go.id",
      "http://localhost:3000",
      "http://localhost:5000",
      "http://192.168.0.120",
      "http://192.168.0.120:3000",
      "http://192.168.0.160",
      "http://192.168.0.160:3000",
      process.env.FRONTEND_URL,
      "null",
      "file://",
    ].filter(Boolean); // Hapus nilai undefined

    // Untuk development, izinkan semua origin local
    if (process.env.NODE_ENV !== "production") {
      if (origin.startsWith("http://localhost:") || origin === "null") {
        return callback(null, true);
      }
    }

    // Cek apakah origin ada di allowedOrigins
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log("❌ CORS blocked origin:", origin);
      console.log("✅ Allowed origins:", allowedOrigins);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ===============================
   3. COOKIE PARSER
================================ */
app.use(cookieParser());

/* ===============================
   4. BODY PARSER
================================ */
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

/* ===============================
   5. STATIC FILES
================================ */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ===============================
   6. DATABASE
================================ */
console.log("📦 Connecting to database...");

connectDB()
  .then(() => {
    console.log("✅ Database initialization complete");
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err.message);
    console.log("⚠️ Server will continue but database features may not work");
  });

/* ===============================
   7. RATE LIMITING
================================ */
// app.use('/api/', apiLimiter)

/* ===============================
   8. ROUTES
================================ */
const authRoutes = require("./routes/authRoutes");
const konteksRoutes = require("./routes/konteksRoutes");
const identifikasiRoutes = require("./routes/identifikasiRoutes");
const kategoriResikoRoutes = require("./routes/kategoriResikoRoutes");
const penilaianRoutes = require("./routes/penilaianRoutes");
const evaluasiRoutes = require("./routes/evaluasiRoutes");
const celahPengendalianRoutes = require("./routes/celahPengendalianRoutes");
const celahRoutes = require("./routes/celahRoutes");
const pemantauanResikoRoutes = require("./routes/pemantauanResiko");
const kontrolRoutes = require("./routes/kontrolRoutes");
const actionRoutes = require("./routes/actionRoutes");
const riskRoutes = require("./routes/riskRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const reportRoutes = require("./routes/reportRoutes");
const userRoutes = require("./routes/userRoutes");
const profileRisikoRoutes = require("./routes/profileRisikoRoutes");
const pencatatanKejadianRisikoRoutes = require("./routes/pencatatanKejadianRisikoRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/konteks", konteksRoutes);
app.use("/api/identifikasi", identifikasiRoutes);
app.use("/api/kategori-resiko", kategoriResikoRoutes);
app.use("/api/penilaian", penilaianRoutes);
app.use("/api/evaluasi", evaluasiRoutes);
app.use("/api/celah-pengendalian", celahPengendalianRoutes);
app.use("/api/celah", celahRoutes);
app.use("/api/pemantauan-resiko", pemantauanResikoRoutes);
app.use("/api/kontrol", kontrolRoutes);
app.use("/api/action", actionRoutes);
app.use("/api/risks", riskRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/profile-risiko", profileRisikoRoutes);
app.use("/api/kejadian-risiko", pencatatanKejadianRisikoRoutes);

/* ===============================
   9. HEALTH CHECK ENDPOINT (TAMBAHKAN)
================================ */
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

/* ===============================
   10. 404 HANDLER
================================ */
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route tidak ditemukan",
  });
});

/* ===============================
   11. ERROR HANDLER
================================ */
app.use(errorHandler);

/* ===============================
   12. START SERVER
================================ */
const PORT = process.env.PORT || 5001;
app.listen(PORT, "0.0.0.0", () => {
  // Bind ke semua network interface
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV || "development"}`);
  // console.log(`🔒 Security: Helmet enabled, Rate limiting active`)
  console.log(`🍪 Cookies: HTTP-only cookies enabled`);
  console.log(`🌐 CORS: Allowing origins:`);
  console.log(`   - http://localhost:3000`);
  console.log(`   - http://192.168.0.120`);
  console.log(`   - ${process.env.FRONTEND_URL || "not set"}`);
});
