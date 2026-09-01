/* eslint-disable @typescript-eslint/no-require-imports */
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

// exports.getRiskLevelLabel = (score) => {
//   if (!score) return "-";
//   if (score <= 4) return "LOW";
//   if (score <= 12) return "MEDIUM";
//   return "HIGH";
// };

// Helper 1: Konversi Skor ke 4 Tingkatan Level Risiko (Bahasa Indonesia)
exports.getRiskLevelLabel = (score) => {
  const numScore = Number(score) || 0;
  if (numScore >= 20) return "Ekstrim";
  if (numScore >= 12) return "Tinggi";
  if (numScore >= 6) return "Sedang";
  if (numScore > 0) return "Rendah";
  return "-";
};

// Helper 2: Konversi Status Action Plan ke Bahasa Indonesia
exports.getActionStatusLabel = (status) => {
  if (!status) return "Belum Ditentukan";
  const st = String(status).toUpperCase();
  if (st === "CLOSED" || st === "DONE" || st === "SELESAI") return "Selesai";
  if (st === "ON PROGRESS" || st === "PROGRESS" || st === "PROSES")
    return "Dalam Proses";
  if (st === "OPEN" || st === "BELUM") return "Belum Dimulai";
  return status; // fallback ke string asli jika ada status kustom
};

// Helper konversi angka bulan ke nama bulan Indonesia
exports.getNamaBulan = (bulanAngka) => {
  const bulan = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  return bulan[parseInt(bulanAngka) - 1] || "-";
};

exports.generateCategoryChartImage = async (kategoriData) => {
  const width = 600; // Lebar gambar chart (piksel)
  const height = 400; // Tinggi gambar chart (piksel)

  // Ekstrak label dan data angka dari hasil query database
  const labels = kategoriData.map((row) => row.kategori);
  const counts = kategoriData.map((row) => Number(row.jumlah));

  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const configuration = {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Jumlah Kasus per Kategori",
          data: counts,
          backgroundColor: "rgba(46, 117, 182, 0.7)",
          borderColor: "rgba(46, 117, 182, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: {
          display: true,
          position: "top",
        },
        title: {
          display: true,
          text: "Grafik Rekapitulasi Kategori Risiko",
          font: { size: 14, weight: "bold" },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
          },
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45,
          },
        },
      },
    },
  };

  return await chartJSNodeCanvas.renderToBuffer(configuration);
};

exports.generatePDFChartImage = async (kategoriData) => {
  const width = 500; // Disesuaikan dengan lebar margin A4 PDF
  const height = 280;

  const labels = kategoriData.map((row) => row.kategori);
  const counts = kategoriData.map((row) => Number(row.jumlah));

  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const configuration = {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Jumlah Kasus per Kategori",
          data: counts,
          backgroundColor: "rgba(31, 78, 120, 0.7)", // Tema warna Biru Executive
          borderColor: "rgba(31, 78, 120, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: false }, // Dimatikan karena sudah ada judul dataset
        title: {
          display: true,
          text: "GRAFIK REKAPITULASI KATEGORI RISIKO",
          font: { size: 12, weight: "bold" },
        },
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { ticks: { maxRotation: 30, minRotation: 30, font: { size: 9 } } },
      },
    },
  };

  return await chartJSNodeCanvas.renderToBuffer(configuration);
};
