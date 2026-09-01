/* eslint-disable @typescript-eslint/no-require-imports */
const { getPool } = require("../config/db");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { formatDate } = require("../libs/util");
const {
  getRiskProfileReportData,
  generateIdentifikasiExcel,
  generateAnalisisExcel,
  generateEvaluasiExcel,
  generateIdentifikasiPDF,
  generateAnalisisPDF,
  generateEvaluasiPDF,
  getReportData,
  generatePerlakuanExcel,
  generatePerlakuanPDF,
  getPerlakuanReportData,
  generateResiduExcel,
  generateResiduPDF,
  getResiduReportData,
  generateProfileExcel,
  getProfileReportData,
  generateProfilePDF,
  getKejadianReportData,
  generateKejadianRisikoExcel,
} = require("../services/report.service");
const {
  generateCategoryChartImage,
  generatePDFChartImage,
  getNamaBulan,
} = require("../helpers/risk-helper");

exports.getRiskReport = async (req, res) => {
  try {
    const filter = req.filter;
    const { download, type } = req.query;

    if (!download) {
      if (type === "perlakuan")
        return res.json(await getPerlakuanReportData(filter));
      if (type === "residu") return res.json(await getResiduReportData(filter));
      if (type === "profile")
        return res.json(await exports.getProfileReportData(filter));
      return res.json(await getRiskProfileReportData(filter));
    }

    if (download === "excel") {
      if (type === "identifikasi")
        return generateIdentifikasiExcel(
          res,
          await getRiskProfileReportData(filter),
        );
      if (type === "analisis")
        return generateAnalisisExcel(
          res,
          await getRiskProfileReportData(filter),
        );
      if (type === "evaluasi")
        return generateEvaluasiExcel(
          res,
          await getRiskProfileReportData(filter),
        );
      if (type === "perlakuan")
        return generatePerlakuanExcel(
          res,
          await getPerlakuanReportData(filter),
        );
      if (type === "residu")
        return generateResiduExcel(res, await getResiduReportData(filter));
      if (type === "profile")
        return generateProfileExcel(res, await getProfileReportData(filter));
      return res
        .status(400)
        .json({ message: "Tipe laporan Excel tidak dikenali." });
    }

    if (download === "pdf") {
      if (type === "identifikasi")
        return generateIdentifikasiPDF(
          res,
          await getRiskProfileReportData(filter),
        );
      if (type === "analisis")
        return generateAnalisisPDF(res, await getRiskProfileReportData(filter));
      if (type === "evaluasi")
        return generateEvaluasiPDF(res, await getRiskProfileReportData(filter));
      if (type === "perlakuan")
        return generatePerlakuanPDF(res, await getPerlakuanReportData(filter));
      if (type === "residu")
        return generateResiduPDF(req, res, await getResiduReportData(filter));
      if (type === "profile")
        return generateProfilePDF(req, res, await getProfileReportData(filter));
      return res
        .status(400)
        .json({ message: "Tipe laporan PDF tidak dikenali." });
    }

    return res.status(400).json({ message: "Format download tidak didukung." });
  } catch (error) {
    console.error("❌ Error in getRiskReport:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

exports.getReportData = async (req, res) => {
  try {
    const user = req.user;
    const filter = req.filter;

    console.log("👤 User report:", user?.email, "Role:", user?.role);

    const data = await getReportData(user, filter);
    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("❌ Error fetching report data:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.generateExcel = async (req, res) => {
  try {
    const user = req.user;
    const filter = req.filter;
    const pool = getPool(); // Untuk fetch rekap kategori

    console.log("📊 Generating Excel report for user:", user?.email);

    // Fetch data utama laporan
    const data = await getReportData(user, filter);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Sistem Manajemen Risiko";
    workbook.created = new Date();

    // ==========================================
    // SHEET 1: DASHBOARD & REKAP KATEGORI
    // ==========================================
    const summarySheet = workbook.addWorksheet("Dashboard");

    // Judul Utama
    summarySheet.mergeCells("A1:E1");
    summarySheet.getCell("A1").value =
      "LAPORAN EXECUTIVE SUMMARY MANAJEMEN RISIKO";
    summarySheet.getCell("A1").font = {
      size: 14,
      bold: true,
      color: { argb: "FFFFFF" },
    };
    summarySheet.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "1F4E78" },
    };
    summarySheet.getCell("A1").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    summarySheet.getRow(1).height = 35;

    // Statistik Global
    const totalRisiko = data.length;
    const risikoAktif = data.filter((d) => d.status_risiko === "Open").length;
    const risikoTertutup = data.filter(
      (d) => d.status_risiko === "Closed",
    ).length;

    let totalProgress = 0;
    const aktifData = data.filter((d) => d.status_risiko === "Open");
    aktifData.forEach((d) => {
      totalProgress += Number(d.progress_persen) || 0;
    });
    const rataProgress = risikoAktif > 0 ? totalProgress / risikoAktif : 0;

    // Tulis Ringkasan ke Excel
    summarySheet.getCell("A3").value = "IKHTISAR STATISTIK";
    summarySheet.getCell("A3").font = { bold: true, size: 11 };

    const stats = [
      ["Total Risiko", totalRisiko],
      ["Risiko Aktif", risikoAktif],
      ["Risiko Tertutup", risikoTertutup],
      ["Rata-rata Progress Mitigasi", `${rataProgress.toFixed(1)}%`],
    ];

    stats.forEach(([label, value], index) => {
      const rowNum = index + 4;
      summarySheet.getCell(`A${rowNum}`).value = label;
      summarySheet.getCell(`B${rowNum}`).value = value;
      summarySheet.getCell(`A${rowNum}`).font = { bold: true };
    });

    // 🎯 SEKSI TAMBAHAN: REKAP KATEGORI RISIKO
    summarySheet.getCell("A10").value = "REKAPITULASI PER KATEGORI RISIKO";
    summarySheet.getCell("A10").font = { bold: true, size: 11 };

    // 1. Isi Nilai Header Tabel Kategori
    summarySheet.getCell("A11").value = "Kategori Risiko";
    summarySheet.getCell("B11").value = "Jumlah Risiko";

    // 2. Definisikan Style Warna & Font untuk Header
    const headerFont = { bold: true, size: 10 };
    const headerFill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "D9E1F2" }, // Warna abu-abu kebiruan sesuai template Anda
    };
    const headerAlignment = { horizontal: "center", vertical: "middle" };

    // 3. 🎯 SUNTIKAN PERBAIKAN: Warnai hanya kolom A11 dan B11 saja!
    const targetCells = ["A11", "B11"];
    targetCells.forEach((cellRef) => {
      const cell = summarySheet.getCell(cellRef);
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.alignment = headerAlignment;

      // Opsional: Tambahkan border tipis agar tabel rekap terlihat rapi
      cell.border = {
        top: { style: "thin", color: { argb: "A6ACAF" } },
        left: { style: "thin", color: { argb: "A6ACAF" } },
        bottom: { style: "thin", color: { argb: "A6ACAF" } },
        right: { style: "thin", color: { argb: "A6ACAF" } },
      };
    });

    // Set tinggi baris header agar teks tidak terlalu padat
    summarySheet.getRow(11).height = 22;

    // ==========================================
    // REKAP KATEGORI RISIKO (ADAPTIF ROLE USER vs ADMIN)
    // ==========================================
    let kategoriParams = [];
    let kategoriConditions = [];

    // 1. Amankan kondisi status dasar (Wajib pakai tanda kurung agar tidak bocor)
    kategoriConditions.push(`(ir.status != 'Deleted' OR ir.status IS NULL)`);

    // 2. Suntikkan filter kepemilikan jika login sebagai role USER
    if (filter?.created_by_uuid) {
      kategoriParams.push(filter.created_by_uuid);
      kategoriConditions.push(`ir.created_by_uuid = $${kategoriParams.length}`);
    }

    // Bangun klausa ON join secara dinamis agar LEFT JOIN kr ke ir terfilter sejak awal
    const joinConditions =
      kategoriConditions.length > 0
        ? ` AND ${kategoriConditions.join(" AND ")}`
        : "";

    const kategoriCountQuery = `
      SELECT kr.name as kategori, COUNT(ir.id) as jumlah
      FROM kategori_resiko kr
      LEFT JOIN identifikasi_resiko ir ON ir.kategori_id = kr.id ${joinConditions}
      GROUP BY kr.name
      ORDER BY jumlah DESC
    `;

    console.log(
      `📊 Menyusun rekap chart kategori dinamis. Params:`,
      kategoriParams,
    );
    const kategoriResult = await pool.query(kategoriCountQuery, kategoriParams);

    let startRowKategori = 12;
    kategoriResult.rows.forEach((kat) => {
      summarySheet.getCell(`A${startRowKategori}`).value = kat.kategori;
      summarySheet.getCell(`B${startRowKategori}`).value = Number(kat.jumlah);
      summarySheet.getCell(`B${startRowKategori}`).alignment = {
        horizontal: "right",
      };
      startRowKategori++;
    });

    // Merapikan kolom dashboard sheet
    summarySheet.getColumn("A").width = 30;
    summarySheet.getColumn("B").width = 20;

    if (kategoriResult.rows.length > 0) {
      // a. Generate buffer gambar dari helper Chart.js
      const chartBuffer = await generateCategoryChartImage(kategoriResult.rows);

      // b. Daftarkan gambar ke dalam workbook ExcelJS
      const chartImageId = workbook.addImage({
        buffer: chartBuffer,
        extension: "png",
      });

      // c. Tentukan posisi peletakan chart (Misal di baris sel D3 di samping tabel statistik)
      summarySheet.addImage(chartImageId, {
        tl: { col: 3, row: 2 }, // D3 (kolom indeks ke-3, baris indeks ke-2 karena dimulai dari 0)
        ext: { width: 550, height: 350 }, // Ukuran tampilan chart di dalam dokumen Excel
      });
    }

    // ==========================================
    // SHEET 2: DETAIL RISIKO (KOLOM BARU)
    // ==========================================
    const detailSheet = workbook.addWorksheet("Detail Risiko");

    // Pembaruan susunan kolom header detail laporan
    const detailHeaders = [
      "No",
      "Nama Risiko",
      "Kategori",
      "Pemilik Risiko", // <-- Kolom Baru
      "Status",
      "Level Risiko", // <-- Kolom Baru
      "Skor",
      "Strategi Perlakuan", // <-- Kolom Baru
      "Prioritas", // <-- Kode P1/P2 sudah berubah jadi teks teks
      "Progress (%)",
      "Rata Efektivitas Kontrol (%)", // <-- Kolom Baru
      "Skor Residu", // <-- Kolom Baru
      "Update Terakhir",
    ];

    detailSheet.addRow(detailHeaders);

    // Styling Header Detail Sheet
    const headerRow = detailSheet.getRow(1);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" }, size: 10 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "2E75B6" },
      };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    });

    // Isi data ke sheet Detail
    data.forEach((item, index) => {
      const rowData = [
        index + 1,
        item.nama_resiko,
        item.kategori || "-",
        item.pemilik_risiko || "Belum ada pemilik", // Pemilik Risiko
        item.status_risiko === "Open" ? "Aktif" : "Ditutup",
        item.level_risiko_inherent || "Rendah", // Level Risiko
        Number(item.inherent_score) || 0,
        item.strategi_perlakuan || "Belum Dievaluasi", // Strategi Perlakuan
        item.prioritas_text, // Prioritas Teks (Mendesak, Penting, dll)
        Number(item.progress_persen) / 100, // Progress diubah ke desimal (akan diformat % di Excel)
        Number(item.avg_effectiveness) / 100, // Efektivitas Kontrol
        item.residual_score !== null ? Number(item.residual_score) : "-", // Skor Residu
        formatDate(item.last_update)
          ? formatDate(new Date(item.last_update))
          : "-",
      ];

      const insertedRow = detailSheet.addRow(rowData);

      // Formatting cell khusus angka dan persentase agar bisa diolah rumus di excel
      insertedRow.getCell(10).numFmt = "0%";
      insertedRow.getCell(11).numFmt = "0%";
      insertedRow.getCell(7).numFmt = "#,##0";
      if (item.residual_score !== null) {
        insertedRow.getCell(12).numFmt = "#,##0.0";
      }
      if (item.last_update) {
        insertedRow.getCell(13).numFmt = "dd/mm/yyyy";
      }
    });

    // Auto fit column widths
    detailSheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(maxLength + 3, 40);
    });

    // Set response headers dan stream file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="laporan-risiko-${new Date().toISOString().split("T")[0]}.xlsx"`,
    );

    await workbook.xlsx.write(res);
    res.end();
    console.log("✅ Berhasil mengirimkan file excel laporan terbaru.");
  } catch (error) {
    console.error("❌ Error generating Excel:", error);
    res.status(500).json({
      success: false,
      message: "Gagal generate laporan Excel",
      error: error.message,
    });
  }
};

exports.generatePDF = async (req, res) => {
  try {
    const user = req.user;
    const filter = req.filter;
    const pool = getPool();

    console.log(
      "📄 Generating Fixed Hybrid Table PDF report for user:",
      user?.email,
    );

    // Fetch data laporan utama dari database
    const data = await getReportData(user, filter);

    // 1. Inisialisasi awal dokumen (A4 Portrait untuk Dashboard / Cover depan)
    const doc = new PDFDocument({
      margin: 30,
      size: "A4",
      bufferPages: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="laporan-risiko-${new Date().toISOString().split("T")[0]}.pdf"`,
    );

    doc.pipe(res);

    const portraitWidth = doc.page.width - 60; // 535 pt usable width

    // ==========================================
    // BAGIAN 1: HEADER BANNER (PORTRAIT - HALAMAN 1)
    // ==========================================
    doc.rect(30, 30, portraitWidth, 45).fill("#1F4E78");
    doc
      .fillColor("#FFFFFF")
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("LAPORAN EKSEKUTIF MANAJEMEN RISIKO ORGANISASI", 30, 46, {
        align: "center",
        width: portraitWidth,
      });

    doc
      .fillColor("#4A5568")
      .fontSize(9)
      .font("Helvetica")
      .text(
        `Dicetak Pada: ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`,
        30,
        85,
        { align: "right", width: portraitWidth },
      );

    // ==========================================
    // BAGIAN 2: RINGKASAN STATISTIK GLOBAL (PORTRAIT - HALAMAN 1)
    // ==========================================
    const totalRisiko = data.length;
    const risikoAktif = data.filter((d) => d.status_risiko === "Open").length;
    const risikoTertutup = data.filter(
      (d) => d.status_risiko === "Closed",
    ).length;

    let totalProgress = 0;
    const aktifData = data.filter((d) => d.status_risiko === "Open");
    aktifData.forEach((d) => {
      totalProgress += Number(d.progress_persen) || 0;
    });
    const rataProgress = risikoAktif > 0 ? totalProgress / risikoAktif : 0;

    doc.y = 110;
    doc
      .fillColor("#1F4E78")
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("I. IKHTISAR STATISTIK RISIKO", 30);
    doc
      .moveTo(30, doc.y + 2)
      .lineTo(180, doc.y + 2)
      .stroke("#1F4E78");

    doc.moveDown(0.8);
    const statsY = doc.y;
    doc.fillColor("#333333").fontSize(9).font("Helvetica");
    doc.text(`• Total Kasus Risiko: ${totalRisiko} Kasus`, 40, statsY);
    doc.text(`• Risiko Status Aktif: ${risikoAktif} Kasus`, 40, statsY + 14);
    doc.text(`• Risiko Status Tertutup: ${risikoTertutup} Kasus`, 280, statsY);
    doc.text(
      `• Rata progress Mitigasi: ${rataProgress.toFixed(1)}%`,
      280,
      statsY + 14,
    );

    // ==========================================
    // BAGIAN 3: VISUALISASI CHART (PORTRAIT - HALAMAN 1)
    // ==========================================
    // ==========================================
    // REKAP KATEGORI RISIKO (ADAPTIF ROLE USER vs ADMIN)
    // ==========================================
    let kategoriParams = [];
    let kategoriConditions = [];

    // 1. Amankan kondisi status dasar (Wajib pakai tanda kurung agar tidak bocor)
    kategoriConditions.push(`(ir.status != 'Deleted' OR ir.status IS NULL)`);

    // 2. Suntikkan filter kepemilikan jika login sebagai role USER
    if (filter?.created_by_uuid) {
      kategoriParams.push(filter.created_by_uuid);
      kategoriConditions.push(`ir.created_by_uuid = $${kategoriParams.length}`);
    }

    // Bangun klausa ON join secara dinamis agar LEFT JOIN kr ke ir terfilter sejak awal
    const joinConditions =
      kategoriConditions.length > 0
        ? ` AND ${kategoriConditions.join(" AND ")}`
        : "";

    const kategoriCountQuery = `
      SELECT kr.name as kategori, COUNT(ir.id) as jumlah
      FROM kategori_resiko kr
      LEFT JOIN identifikasi_resiko ir ON ir.kategori_id = kr.id ${joinConditions}
      GROUP BY kr.name
      ORDER BY jumlah DESC
    `;

    console.log(
      `📊 Menyusun rekap chart kategori dinamis. Params:`,
      kategoriParams,
    );
    const kategoriResult = await pool.query(kategoriCountQuery, kategoriParams);

    if (kategoriResult.rows.length > 0) {
      doc.y = statsY + 45;
      doc
        .fillColor("#1F4E78")
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("II. REKAPITULASI KATEGORI RISIKO", 30);
      doc
        .moveTo(30, doc.y + 2)
        .lineTo(210, doc.y + 2)
        .stroke("#1F4E78");
      doc.moveDown(0.8);

      try {
        const chartBuffer = await generatePDFChartImage(kategoriResult.rows);
        doc.image(chartBuffer, 47, doc.y, { width: 500, height: 240 });
      } catch (chartErr) {
        console.error("⚠️ Gagal merender ChartJS:", chartErr.message);
      }
    }

    // ==========================================
    // BAGIAN 4: MATRIKS RISIKO AKTIF (LANDSCAPE - HALAMAN 2++)
    // ==========================================
    // 🎯 FIX BERKALA: Pindah layout ke Landscape secara bersih terisolasi
    doc.addPage({ size: "A4", layout: "landscape", margin: 30 });

    const landscapeWidth = doc.page.width - 60; // 782 pt usable width

    doc
      .fillColor("#1F4E78")
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("III. MATRIKS MONITORING RISIKO AKTIF", 30, 30);
    doc
      .moveTo(30, doc.y + 2)
      .lineTo(230, doc.y + 2)
      .stroke("#1F4E78");
    doc.moveDown(0.8);

    // Definisi 10 Kolom Mandiri Sejajar (Total Lebar pas 782 pt)
    const colWidths = {
      no: 22,
      nama: 155, // Dikurangi dari 170
      kategori: 80, // Dikurangi dari 90
      owner: 120, // DITAMBAH dari 85 agar muat tulisan Unit/Instalasi panjang
      level: 55,
      skor: 35, // Dikurangi dari 40
      strategi: 70, // Dikurangi dari 75
      prioritas: 70, // Dikurangi dari 75
      progress: 55,
      residu: 45,
    };

    const colPositions = {
      no: 30,
      nama: 30 + colWidths.no,
      kategori: 30 + colWidths.no + colWidths.nama,
      owner: 30 + colWidths.no + colWidths.nama + colWidths.kategori,
      level:
        30 +
        colWidths.no +
        colWidths.nama +
        colWidths.kategori +
        colWidths.owner,
      skor:
        30 +
        colWidths.no +
        colWidths.nama +
        colWidths.kategori +
        colWidths.owner +
        colWidths.level,
      strategi:
        30 +
        colWidths.no +
        colWidths.nama +
        colWidths.kategori +
        colWidths.owner +
        colWidths.level +
        colWidths.skor,
      prioritas:
        30 +
        colWidths.no +
        colWidths.nama +
        colWidths.kategori +
        colWidths.owner +
        colWidths.level +
        colWidths.skor +
        colWidths.strategi,
      progress:
        30 +
        colWidths.no +
        colWidths.nama +
        colWidths.kategori +
        colWidths.owner +
        colWidths.level +
        colWidths.skor +
        colWidths.strategi +
        colWidths.prioritas,
      residu:
        30 +
        colWidths.no +
        colWidths.nama +
        colWidths.kategori +
        colWidths.owner +
        colWidths.level +
        colWidths.skor +
        colWidths.strategi +
        colWidths.prioritas +
        colWidths.progress,
    };

    const drawActiveHeader = (yPos) => {
      doc.rect(30, yPos, landscapeWidth, 25).fill("#2E75B6");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);

      doc.text("No", colPositions.no, yPos + 8, {
        width: colWidths.no,
        align: "center",
      });
      doc.text("Risiko", colPositions.nama + 5, yPos + 8, {
        width: colWidths.nama - 5,
      });
      doc.text("Kategori", colPositions.kategori + 5, yPos + 8, {
        width: colWidths.kategori - 5,
      });
      doc.text("Pemilik Risiko", colPositions.owner + 5, yPos + 8, {
        width: colWidths.owner - 5,
      });
      doc.text("Level Risiko", colPositions.level, yPos + 8, {
        width: colWidths.level,
        align: "center",
      });
      doc.text("Skor", colPositions.skor, yPos + 8, {
        width: colWidths.skor,
        align: "center",
      });
      doc.text("Strategi", colPositions.strategi + 5, yPos + 8, {
        width: colWidths.strategi - 5,
      });
      doc.text("Prioritas", colPositions.prioritas + 5, yPos + 8, {
        width: colWidths.prioritas - 5,
      });
      doc.text("Progress / Eff", colPositions.progress, yPos + 8, {
        width: colWidths.progress,
        align: "center",
      });
      doc.text("Residu", colPositions.residu, yPos + 8, {
        width: colWidths.residu,
        align: "center",
      });

      return yPos + 25;
    };

    let currentY = doc.y;
    const tableDataStartY = currentY; // Simpan posisi awal untuk border luar pembungkus nanti
    currentY = drawActiveHeader(currentY);

    if (aktifData.length === 0) {
      doc.rect(30, currentY, landscapeWidth, 25).stroke("#E2E8F0");
      doc
        .fillColor("#666666")
        .font("Helvetica-Oblique")
        .fontSize(8.5)
        .text("Tidak ada data kasus risiko aktif.", 30, currentY + 8, {
          align: "center",
          width: landscapeWidth,
        });
      currentY += 25;
    } else {
      aktifData.forEach((item, index) => {
        // 🎯 FIX TINGGI BARIS DINAMIS: Ukur tinggi string nama_resiko DAN pemilik_risiko
        const namaHeight = doc.heightOfString(item.nama_resiko, {
          width: colWidths.nama - 10,
          fontSize: 8,
        });
        const ownerHeight = doc.heightOfString(
          item.pemilik_risiko || "Unassigned",
          {
            width: colWidths.owner - 10,
            fontSize: 8,
          },
        );

        // Ambil nilai tertinggi dari kedua kolom tersebut untuk mencegah overflow vertikal
        const rowHeight = Math.max(30, namaHeight + 14, ownerHeight + 14);

        // Proteksi Batas Bawah Landscape (595pt tinggi total - 45pt safety area)
        if (currentY + rowHeight > doc.page.height - 45) {
          // Gambar penutup border vertikal untuk lembar halaman yang akan ditinggalkan sebelum addPage
          doc
            .moveTo(30, tableDataStartY)
            .lineTo(30, currentY)
            .stroke("#E2E8F0");
          doc
            .moveTo(30 + landscapeWidth, tableDataStartY)
            .lineTo(30 + landscapeWidth, currentY)
            .stroke("#E2E8F0");

          doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
          currentY = drawActiveHeader(30);
        }

        if (index % 2 === 1) {
          doc.rect(30, currentY, landscapeWidth, rowHeight).fill("#F8FAFC");
        }

        doc
          .moveTo(30, currentY + rowHeight)
          .lineTo(30 + landscapeWidth, currentY + rowHeight)
          .stroke("#E2E8F0");

        // Render Data Row
        doc.fillColor("#1A202C").font("Helvetica").fontSize(8);
        doc.text(`${index + 1}`, colPositions.no, currentY + 7, {
          width: colWidths.no,
          align: "center",
        });
        doc
          .font("Helvetica-Bold")
          .text(item.nama_resiko, colPositions.nama + 5, currentY + 7, {
            width: colWidths.nama - 10,
          });

        doc.font("Helvetica").fillColor("#4A5568");
        doc.text(
          item.kategori || "-",
          colPositions.kategori + 5,
          currentY + 7,
          {
            width: colWidths.kategori - 5,
          },
        );
        doc.text(
          item.pemilik_risiko || "Unassigned",
          colPositions.owner + 5,
          currentY + 7,
          {
            width: colWidths.owner - 10,
          },
        );

        doc.fillColor("#1A202C");
        doc.text(
          item.level_risiko_inherent || "Rendah",
          colPositions.level,
          currentY + 7,
          {
            width: colWidths.level,
            align: "center",
          },
        );
        doc.text(
          `${item.inherent_score || 0}`,
          colPositions.skor,
          currentY + 7,
          {
            width: colWidths.skor,
            align: "center",
          },
        );

        doc.fillColor("#4A5568");
        doc.text(
          item.strategi_perlakuan || "Belum Evaluasi",
          colPositions.strategi + 5,
          currentY + 7,
          { width: colWidths.strategi - 5 },
        );
        doc.text(
          item.prioritas_text,
          colPositions.prioritas + 5,
          currentY + 7,
          {
            width: colWidths.prioritas - 5,
          },
        );

        doc.fillColor("#1A202C");
        doc.text(
          `${item.progress_persen || 0}% / ${Number(item.avg_effectiveness).toFixed(0)}%`,
          colPositions.progress,
          currentY + 7,
          { width: colWidths.progress, align: "center" },
        );

        doc.font("Helvetica-Bold").fillColor("#1F4E78");
        doc.text(
          `${item.residual_score !== null ? item.residual_score : "-"}`,
          colPositions.residu,
          currentY + 7,
          { width: colWidths.residu, align: "center" },
        );

        currentY += rowHeight;
      });
    }

    // Gambar penutup border vertikal untuk tabel aktif halaman terakhir
    doc.moveTo(30, tableDataStartY).lineTo(30, currentY).stroke("#E2E8F0");
    doc
      .moveTo(30 + landscapeWidth, tableDataStartY)
      .lineTo(30 + landscapeWidth, currentY)
      .stroke("#E2E8F0");

    // ==========================================
    // BAGIAN 5: TABEL ARSIP RISIKO TERTUTUP (LANDSCAPE - HALAMAN BARU)
    // ==========================================
    const closedData = data.filter((d) => d.status_risiko === "Closed");

    if (closedData.length > 0) {
      // 🎯 FIX KUNCI: Paksa tabel tertutup selalu bersih dimulai dari halaman landscape baru
      // Ini 100% memotong bug penumpukan kalkulasi sisa baris dari tabel aktif di atasnya
      doc.addPage({ size: "A4", layout: "landscape", margin: 30 });

      let closedY = 30; // Reset koordinat Y murni dari atas lembar baru

      doc
        .fillColor("#1F4E78")
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("IV. RIWAYAT ARSIP RISIKO TERTUTUP (RESOLVED)", 30, closedY);
      doc
        .moveTo(30, doc.y + 2)
        .lineTo(260, doc.y + 2)
        .stroke("#1F4E78");
      doc.moveDown(0.8);

      closedY = doc.y;
      const closedTableStartY = closedY; // Simpan anchor border vertikal tertutup

      const closedWidths = {
        no: 25,
        nama: 230,
        kat: 120,
        tgl: 85,
        alasan: 322,
      };
      const closedPositions = {
        no: 30,
        nama: 30 + closedWidths.no,
        kat: 30 + closedWidths.no + closedWidths.nama,
        tgl: 30 + closedWidths.no + closedWidths.nama + closedWidths.kat,
        alasan:
          30 +
          closedWidths.no +
          closedWidths.nama +
          closedWidths.kat +
          closedWidths.tgl,
      };

      const drawClosedHeader = (yPos) => {
        doc.rect(30, yPos, landscapeWidth, 22).fill("#475569");
        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
        doc.text("No", closedPositions.no, yPos + 7, {
          width: closedWidths.no,
          align: "center",
        });
        doc.text("Risiko", closedPositions.nama + 5, yPos + 7, {
          width: closedWidths.nama - 5,
        });
        doc.text("Kategori Risiko", closedPositions.kat + 5, yPos + 7, {
          width: closedWidths.kat - 5,
        });
        doc.text("Tanggal Selesai", closedPositions.tgl, yPos + 7, {
          width: closedWidths.tgl,
          align: "center",
        });
        doc.text(
          "Alasan / Justifikasi Penutupan Manajemen",
          closedPositions.alasan + 5,
          yPos + 7,
          {
            width: closedWidths.alasan - 5,
          },
        );
        return yPos + 22;
      };

      closedY = drawClosedHeader(closedY);

      closedData.forEach((item, index) => {
        const titleHeight = doc.heightOfString(item.nama_resiko, {
          width: closedWidths.nama - 10,
          fontSize: 8,
        });
        const reasonHeight = doc.heightOfString(item.close_reason || "", {
          width: closedWidths.alasan - 10,
          fontSize: 8,
        });
        const closedRowHeight = Math.max(
          30,
          titleHeight + 12,
          reasonHeight + 14,
        );

        if (closedY + closedRowHeight > doc.page.height - 45) {
          // Tutup garis vertikal halaman lama sebelum beralih page
          doc
            .moveTo(30, closedTableStartY)
            .lineTo(30, closedY)
            .stroke("#E2E8F0");
          doc
            .moveTo(30 + landscapeWidth, closedTableStartY)
            .lineTo(30 + landscapeWidth, closedY)
            .stroke("#E2E8F0");

          doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
          closedY = drawClosedHeader(30);
        }

        if (index % 2 === 1) {
          doc
            .rect(30, closedY, landscapeWidth, closedRowHeight)
            .fill("#F8FAFC");
        }
        doc
          .moveTo(30, closedY + closedRowHeight)
          .lineTo(30 + landscapeWidth, closedY + closedRowHeight)
          .stroke("#E2E8F0");

        doc.fillColor("#1A202C").font("Helvetica").fontSize(8);
        doc.text(`${index + 1}`, closedPositions.no, closedY + 6, {
          width: closedWidths.no,
          align: "center",
        });
        doc
          .font("Helvetica-Bold")
          .text(item.nama_resiko, closedPositions.nama + 5, closedY + 6, {
            width: closedWidths.nama - 10,
          });
        doc
          .font("Helvetica")
          .fillColor("#4A5568")
          .text(item.kategori || "-", closedPositions.kat + 5, closedY + 6, {
            width: closedWidths.kat - 5,
          });
        doc.text(formatDate(item.closed_at), closedPositions.tgl, closedY + 6, {
          width: closedWidths.tgl,
          align: "center",
        });

        doc
          .font("Helvetica-Oblique")
          .fillColor("#334155")
          .text(
            item.close_reason
              ? `"${item.close_reason}"`
              : '"Mitigasi rampung diimplementasikan secara penuh."',
            closedPositions.alasan + 5,
            closedY + 6,
            { width: closedWidths.alasan - 10 },
          );

        closedY += closedRowHeight;
      });

      // Tutup border vertikal luar akhir tabel tertutup
      doc.moveTo(30, closedTableStartY).lineTo(30, closedY).stroke("#E2E8F0");
      doc
        .moveTo(30 + landscapeWidth, closedTableStartY)
        .lineTo(30 + landscapeWidth, closedY)
        .stroke("#E2E8F0");
    }

    // ==========================================
    // BAGIAN 6: FOOTER DIGITAL DENGAN PENOMORAN HALAMAN
    // ==========================================
    // const pages = doc.bufferedPageRange();
    // for (let i = 0; i < pages.count; i++) {
    //   doc.switchToPage(i);

    //   const activePageWidth = doc.page.width;
    //   const activePageHeight = doc.page.height;

    //   // Garis horizontal pembatas footer
    //   doc
    //     .moveTo(30, activePageHeight - 35)
    //     .lineTo(activePageWidth - 30, activePageHeight - 35)
    //     .stroke("#F1F5F9");

    //   doc
    //     .fontSize(7.5)
    //     .fillColor("#94A3B8")
    //     .font("Helvetica")
    //     .text(
    //       "Sistem Manajemen Risiko Terintegrasi",
    //       30,
    //       activePageHeight - 26,
    //       { align: "left" },
    //     )
    //     .text(
    //       `Halaman ${i + 1} dari ${pages.count}`,
    //       30,
    //       activePageHeight - 26,
    //       {
    //         align: "right",
    //         width: activePageWidth - 60,
    //       },
    //     );
    // }

    doc.end();
    console.log("✅ Sukses memproses file PDF murni bebas bug halaman kosong.");
  } catch (error) {
    console.error("❌ Error generating PDF:", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Gagal memuat laporan PDF",
        error: error.message,
      });
    }
  }
};

exports.generateKejadianExcel = async (req, res) => {
  try {
    const filter = req.filter;
    const tahun = parseInt(req.query.tahun) || new Date().getFullYear();
    const bulan = parseInt(req.query.bulan) || new Date().getMonth() + 1;

    const {
      logMaster,
      totalKejadian,
      daftarKejadian,
      daftarNihil,
      daftarBelumDicatat,
    } = await getKejadianReportData(tahun, bulan, filter);
    const namaBulanStr = getNamaBulan(bulan).toUpperCase();

    return generateKejadianRisikoExcel(
      res,
      logMaster,
      totalKejadian,
      daftarKejadian,
      daftarNihil,
      daftarBelumDicatat,
      namaBulanStr,
      bulan,
      tahun,
    );
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.generateKejadianPDF = async (req, res) => {
  try {
    const filter = req.filter;
    const tahun = parseInt(req.query.tahun) || new Date().getFullYear();
    const bulan = parseInt(req.query.bulan) || new Date().getMonth() + 1;

    const {
      logMaster,
      totalKejadian,
      daftarKejadian,
      daftarNihil,
      daftarBelumDicatat,
    } = await getKejadianReportData(tahun, bulan, filter);
    const namaBulanStr = getNamaBulan(bulan).toUpperCase();

    const doc = new PDFDocument({
      margin: 30,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="laporan-kejadian-risiko-${tahun}-${bulan}.pdf"`,
    );
    doc.pipe(res);

    const fullWidth = doc.page.width - 60; // 782 pt

    // Header KOP Resmi
    doc.rect(30, 30, fullWidth, 40).fill("#9C0006");
    doc
      .fillColor("#FFFFFF")
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(
        `LAPORAN REKAPITULASI KEJADIAN RISIKO BULANAN (${namaBulanStr} ${tahun})`,
        30,
        44,
        {
          align: "center",
          width: fullWidth,
        },
      );

    doc.fillColor("#334155").fontSize(9).font("Helvetica");
    doc.text(`Periode Pemantauan : ${getNamaBulan(bulan)} ${tahun}`, 35, 85);
    doc.text(`Status Verifikasi   : ${logMaster.status_laporan}`, 35, 98);
    doc.text(
      `Dicetak Tanggal    : ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`,
      35,
      111,
    );

    doc.text(`Total Insiden Aktual : ${totalKejadian} Kejadian`, 30, 111, {
      align: "right",
      width: fullWidth,
    });

    let currentY = 135;

    // 🎯 GRID LEBAR KOLOM TABEL A (KEJADIAN AKTUAL) - Total Pas 782 pt
    const colW = {
      no: 25,
      tgl: 65,
      status: 65,
      sebab: 200,
      dampak: 200,
      tindakan: 227,
    };
    const colX = {
      no: 30,
      tgl: 30 + colW.no,
      status: 30 + colW.no + colW.tgl,
      sebab: 30 + colW.no + colW.tgl + colW.status,
      dampak: 30 + colW.no + colW.tgl + colW.status + colW.sebab,
      tindakan:
        30 + colW.no + colW.tgl + colW.status + colW.sebab + colW.dampak,
    };

    const drawHeaderKejadian = (yPos) => {
      doc.rect(30, yPos, fullWidth, 20).fill("#475569");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7.5);
      doc.text("No", colX.no, yPos + 6, { width: colW.no, align: "center" });
      doc.text("Tgl Kejadian", colX.tgl, yPos + 6, {
        width: colW.tgl,
        align: "center",
      });
      doc.text("Status Isi", colX.status, yPos + 6, {
        width: colW.status,
        align: "center",
      });
      doc.text("Sebab Saat Ini", colX.sebab + 3, yPos + 6, {
        width: colW.sebab - 3,
      });
      doc.text("Dampak Riil Terjadi", colX.dampak + 3, yPos + 6, {
        width: colW.dampak - 3,
      });
      doc.text("Tindakan Lanjutan", colX.tindakan + 3, yPos + 6, {
        width: colW.tindakan - 3,
      });
      return yPos + 20;
    };

    // =========================================================================
    // TABEL A: DAFTAR INSIDEN / KEJADIAN AKTUAL
    // =========================================================================
    doc
      .fillColor("#1F4E78")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("A. DAFTAR INSIDEN / KEJADIAN AKTUAL", 30, currentY);
    currentY += 16;

    let table1StartY = currentY;
    currentY = drawHeaderKejadian(currentY);

    if (daftarKejadian.length === 0) {
      doc.rect(30, currentY, fullWidth, 20).stroke("#E2E8F0");
      doc
        .fillColor("#7F8C8D")
        .font("Helvetica-Oblique")
        .fontSize(7.5)
        .text(
          "Nihil. Tidak ada temuan insiden aktual pada bulan ini.",
          30,
          currentY + 6,
          { align: "center", width: fullWidth },
        );
      currentY += 20;
    } else {
      daftarKejadian.forEach((group, gIdx) => {
        if (currentY + 20 > doc.page.height - 40) {
          doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
          currentY = drawHeaderKejadian(30);
        }
        doc.rect(30, currentY, fullWidth, 16).fill("#F1F5F9");
        doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(7.5);
        doc.text(
          `[RISIKO #${gIdx + 1}] ${group.nama_resiko} | Pemilik: ${group.pemilik_risiko}`,
          35,
          currentY + 4,
          { width: fullWidth - 10, ellipsis: true },
        );
        currentY += 16;

        group.insiden.forEach((insiden, iIdx) => {
          const sebabH = doc.heightOfString(insiden.sebab_saat_ini, {
            width: colW.sebab - 6,
            fontSize: 7,
          });
          const dampakH = doc.heightOfString(insiden.dampak_riil, {
            width: colW.dampak - 6,
            fontSize: 7,
          });
          const tindakH = doc.heightOfString(insiden.tindakan_lanjutan, {
            width: colW.tindakan - 6,
            fontSize: 7,
          });

          const rowHeight = Math.max(18, sebabH + 6, dampakH + 6, tindakH + 6);

          if (currentY + rowHeight > doc.page.height - 40) {
            doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
            currentY = drawHeaderKejadian(30);
          }

          if (iIdx % 2 === 1)
            doc.rect(30, currentY, fullWidth, rowHeight).fill("#F8FAFC");
          doc
            .moveTo(30, currentY + rowHeight)
            .lineTo(30 + fullWidth, currentY + rowHeight)
            .stroke("#E2E8F0");

          doc.fillColor("#334155").font("Helvetica").fontSize(7);
          doc.text(`${gIdx + 1}.${iIdx + 1}`, colX.no, currentY + 4, {
            width: colW.no,
            align: "center",
          });
          doc.text(
            insiden.tanggal_kejadian
              ? formatDate(insiden.tanggal_kejadian)
              : "-",
            colX.tgl,
            currentY + 4,
            { width: colW.tgl, align: "center" },
          );
          doc
            .font("Helvetica-Bold")
            .fillColor("#B91C1C")
            .text("Terjadi", colX.status, currentY + 4, {
              width: colW.status,
              align: "center",
            });

          doc.font("Helvetica").fillColor("#334155");
          doc.text(insiden.sebab_saat_ini, colX.sebab + 3, currentY + 4, {
            width: colW.sebab - 6,
          });
          doc.text(insiden.dampak_riil, colX.dampak + 3, currentY + 4, {
            width: colW.dampak - 6,
          });
          doc.text(insiden.tindakan_lanjutan, colX.tindakan + 3, currentY + 4, {
            width: colW.tindakan - 6,
          });

          currentY += rowHeight;
        });
      });
    }
    doc.moveTo(30, table1StartY).lineTo(30, currentY).stroke("#E2E8F0");
    doc
      .moveTo(30 + fullWidth, table1StartY)
      .lineTo(30 + fullWidth, currentY)
      .stroke("#E2E8F0");

    // =========================================================================
    // TABEL B: DAFTAR KONFIRMASI NIHIL KEJADIAN
    // =========================================================================
    currentY += 15;
    if (currentY + 50 > doc.page.height - 40) {
      doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
      currentY = 30;
    }

    doc
      .fillColor("#15803D")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("B. DAFTAR RISIKO DENGAN KONFIRMASI NIHIL KEJADIAN", 30, currentY);
    currentY += 16;

    const colNihilW = {
      no: 25,
      nama: 220,
      kategori: 100,
      pemilik: 110,
      tgl: 55,
      status: 60,
      ket: 212,
    };
    const colNihilX = {
      no: 30,
      nama: 30 + colNihilW.no,
      kategori: 30 + colNihilW.no + colNihilW.nama,
      pemilik: 30 + colNihilW.no + colNihilW.nama + colNihilW.kategori,
      tgl:
        30 +
        colNihilW.no +
        colNihilW.nama +
        colNihilW.kategori +
        colNihilW.pemilik,
      status:
        30 +
        colNihilW.no +
        colNihilW.nama +
        colNihilW.kategori +
        colNihilW.pemilik +
        colNihilW.tgl,
      ket:
        30 +
        colNihilW.no +
        colNihilW.nama +
        colNihilW.kategori +
        colNihilW.pemilik +
        colNihilW.tgl +
        colNihilW.status,
    };

    const drawHeaderNihil = (yPos) => {
      doc.rect(30, yPos, fullWidth, 20).fill("#334155");
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7.5);
      doc.text("No", colNihilX.no, yPos + 6, {
        width: colNihilW.no,
        align: "center",
      });
      doc.text("Nama Risiko Utama", colNihilX.nama + 3, yPos + 6, {
        width: colNihilW.nama - 3,
      });
      doc.text("Kategori", colNihilX.kategori + 3, yPos + 6, {
        width: colNihilW.kategori - 3,
      });
      doc.text("Unit Kerja / Pemilik", colNihilX.pemilik + 3, yPos + 6, {
        width: colNihilW.pemilik - 3,
      });
      doc.text("Tgl Kejadian", colNihilX.tgl, yPos + 6, {
        width: colNihilW.tgl,
        align: "center",
      });
      doc.text("Status", colNihilX.status, yPos + 6, {
        width: colNihilW.status,
        align: "center",
      });
      doc.text(
        "Keterangan / Evaluasi Kendali Nihil",
        colNihilX.ket + 3,
        yPos + 6,
        { width: colNihilW.ket - 3 },
      );
      return yPos + 20;
    };

    let table2StartY = currentY;
    currentY = drawHeaderNihil(currentY);

    if (daftarNihil.length === 0) {
      doc.rect(30, currentY, fullWidth, 20).stroke("#E2E8F0");
      doc
        .fillColor("#7F8C8D")
        .font("Helvetica-Oblique")
        .fontSize(7.5)
        .text(
          "Tidak ada risiko yang di-konfirmasi NIHIL pada bulan ini.",
          30,
          currentY + 6,
          { align: "center", width: fullWidth },
        );
      currentY += 20;
    } else {
      daftarNihil.forEach((nihil, nIdx) => {
        const namaH = doc.heightOfString(nihil.nama_resiko, {
          width: colNihilW.nama - 6,
          fontSize: 7,
        });
        const ketH = doc.heightOfString(nihil.keterangan_nihil, {
          width: colNihilW.ket - 6,
          fontSize: 7,
        });
        const rowHeight = Math.max(18, namaH + 6, ketH + 6);

        if (currentY + rowHeight > doc.page.height - 40) {
          doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
          currentY = drawHeaderNihil(30);
        }

        if (nIdx % 2 === 1)
          doc.rect(30, currentY, fullWidth, rowHeight).fill("#F8FAFC");
        doc
          .moveTo(30, currentY + rowHeight)
          .lineTo(30 + fullWidth, currentY + rowHeight)
          .stroke("#E2E8F0");

        doc.fillColor("#334155").font("Helvetica").fontSize(7);
        doc.text(`${nIdx + 1}`, colNihilX.no, currentY + 4, {
          width: colNihilW.no,
          align: "center",
        });
        doc
          .font("Helvetica-Bold")
          .text(nihil.nama_resiko, colNihilX.nama + 3, currentY + 4, {
            width: colNihilW.nama - 6,
          });
        doc
          .font("Helvetica")
          .text(nihil.kategori_name, colNihilX.kategori + 3, currentY + 4, {
            width: colNihilW.kategori - 6,
          });
        doc.text(nihil.pemilik_risiko, colNihilX.pemilik + 3, currentY + 4, {
          width: colNihilW.pemilik - 6,
        });
        doc.text("-", colNihilX.tgl, currentY + 4, {
          width: colNihilW.tgl,
          align: "center",
        });
        doc
          .font("Helvetica-Bold")
          .fillColor("#15803D")
          .text("NIHIL", colNihilX.status, currentY + 4, {
            width: colNihilW.status,
            align: "center",
          });

        doc
          .font("Helvetica-Oblique")
          .fillColor("#15803D")
          .text(nihil.keterangan_nihil, colNihilX.ket + 3, currentY + 4, {
            width: colNihilW.ket - 6,
          });

        currentY += rowHeight;
      });
    }
    doc.moveTo(30, table2StartY).lineTo(30, currentY).stroke("#E2E8F0");
    doc
      .moveTo(30 + fullWidth, table2StartY)
      .lineTo(30 + fullWidth, currentY)
      .stroke("#E2E8F0");

    // =========================================================================
    // TABEL C: DAFTAR RISIKO UNIT YANG BELUM MELAKUKAN PENCATATAN (ABSENSI)
    // =========================================================================
    currentY += 15;
    if (currentY + 50 > doc.page.height - 40) {
      doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
      currentY = 30;
    }

    doc
      .fillColor("#B91C1C")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(
        "C. DAFTAR RISIKO UNIT YANG BELUM MELAKUKAN PENCATATAN",
        30,
        currentY,
      );
    currentY += 16;

    let table3StartY = currentY;
    currentY = drawHeaderNihil(currentY);

    if (daftarBelumDicatat.length === 0) {
      doc.rect(30, currentY, fullWidth, 20).stroke("#E2E8F0");
      doc
        .fillColor("#7F8C8D")
        .font("Helvetica-Oblique")
        .fontSize(7.5)
        .text(
          "Seluruh unit kerja telah tuntas melakukan konfirmasi pencatatan bulan ini.",
          30,
          currentY + 6,
          { align: "center", width: fullWidth },
        );
      currentY += 20;
    } else {
      daftarBelumDicatat.forEach((belum, bIdx) => {
        const namaH = doc.heightOfString(belum.nama_resiko, {
          width: colNihilW.nama - 6,
          fontSize: 7,
        });
        const rowHeight = Math.max(18, namaH + 6);

        if (currentY + rowHeight > doc.page.height - 40) {
          doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
          currentY = drawHeaderNihil(30);
        }

        if (bIdx % 2 === 1)
          doc.rect(30, currentY, fullWidth, rowHeight).fill("#F8FAFC");
        doc
          .moveTo(30, currentY + rowHeight)
          .lineTo(30 + fullWidth, currentY + rowHeight)
          .stroke("#E2E8F0");

        doc.fillColor("#334155").font("Helvetica").fontSize(7);
        doc.text(`${bIdx + 1}`, colNihilX.no, currentY + 4, {
          width: colNihilW.no,
          align: "center",
        });
        doc
          .font("Helvetica-Bold")
          .text(belum.nama_resiko, colNihilX.nama + 3, currentY + 4, {
            width: colNihilW.nama - 6,
          });
        doc
          .font("Helvetica")
          .text(belum.kategori_name, colNihilX.kategori + 3, currentY + 4, {
            width: colNihilW.kategori - 6,
          });
        doc.text(belum.pemilik_risiko, colNihilX.pemilik + 3, currentY + 4, {
          width: colNihilW.pemilik - 6,
        });
        doc.text("-", colNihilX.tgl, currentY + 4, {
          width: colNihilW.tgl,
          align: "center",
        });
        doc
          .font("Helvetica-Bold")
          .fillColor("#B91C1C")
          .text("Belum Isi", colNihilX.status, currentY + 4, {
            width: colNihilW.status,
            align: "center",
          });

        doc
          .font("Helvetica-Oblique")
          .fillColor("#B91C1C")
          .text(
            "Unit belum melakukan konfirmasi pencatatan/NIHIL bulan ini.",
            colNihilX.ket + 3,
            currentY + 4,
            { width: colNihilW.ket - 6 },
          );

        currentY += rowHeight;
      });
    }
    doc.moveTo(30, table3StartY).lineTo(30, currentY).stroke("#E2E8F0");
    doc
      .moveTo(30 + fullWidth, table3StartY)
      .lineTo(30 + fullWidth, currentY)
      .stroke("#E2E8F0");

    // Penomoran Halaman Otomatis
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fillColor("#64748B").fontSize(7.5).font("Helvetica");
      doc.text(
        `Halaman ${i + 1} dari ${pages.count}`,
        30,
        doc.page.height - 25,
        {
          align: "right",
          width: doc.page.width - 60,
        },
      );
    }

    doc.end();
  } catch (error) {
    console.error("❌ PDF Generation Error:", error);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ success: false, message: "Gagal memproses file dokumen PDF" });
    }
  }
};
