# SIMANIS - Backend ManRisk

Backend API untuk aplikasi **ManRisk (Manajemen Risiko)**.

Backend ini dibangun menggunakan **Node.js** dan **Express.js**, serta menggunakan **PostgreSQL** sebagai database.

---

## 📋 Teknologi

- Node.js
- Express.js
- PostgreSQL
- npm
- JWT / Authentication
- PM2 _(untuk production server)_

---

# 📁 Struktur Project

```text
backend/
├── config/              # Konfigurasi aplikasi
├── controllers/         # Controller/API handler
├── helpers/             # Helper functions
├── libs/                # Library/helper tambahan
├── middlewares/         # Express middleware
├── models/              # Model/database access
├── node_modules/        # Dependency (tidak di-push ke Git)
├── routes/              # API routes
├── services/            # Business logic/service
├── uploads/             # File upload
├── .env                 # Environment configuration (tidak di-push)
├── .gitignore
├── package.json
├── package-lock.json
├── readme.md
├── server.js            # Entry point backend
├── updatePassword.js    # Utility untuk update password
└── manrisk.sql          # Database schema/data awal
```

---

# 🔧 Requirements

Sebelum melakukan instalasi, pastikan server/komputer sudah memiliki:

- Node.js
- npm
- PostgreSQL
- Git

Untuk mengecek instalasi:

```bash
node -v
npm -v
git --version
psql --version
```

Disarankan menggunakan versi Node.js LTS.

---

# 🚀 Instalasi

## 1. Clone Repository

Clone repository dari GitHub:

```bash
git clone https://github.com/USERNAME/REPOSITORY.git
```

Masuk ke folder backend:

```bash
cd REPOSITORY
```

Contoh:

```bash
cd simanis-backend
```

---

# 2. Install Dependency

Jalankan:

```bash
npm install
```

Perintah tersebut akan membaca `package.json` dan `package-lock.json`, kemudian meng-install seluruh dependency ke folder:

```text
node_modules/
```

Folder `node_modules` tidak perlu di-upload atau di-push ke GitHub.

Jika ingin melakukan instalasi yang benar-benar mengikuti `package-lock.json`, dapat menggunakan:

```bash
npm ci
```

Untuk server production, `npm ci` lebih direkomendasikan apabila `package-lock.json` tersedia.

---

# 🗄️ Database PostgreSQL

Backend ManRisk menggunakan PostgreSQL.

Pastikan PostgreSQL sudah ter-install dan service PostgreSQL sedang berjalan.

## 3. Membuat Database

Masuk ke PostgreSQL:

```bash
psql -U postgres
```

Kemudian buat database:

```sql
CREATE DATABASE manrisk;
```

Keluar dari PostgreSQL:

```sql
\q
```

---

# 4. Import Database `manrisk.sql`

File:

```text
manrisk.sql
```

merupakan database awal untuk aplikasi ManRisk.

Ada beberapa cara untuk melakukan import.

## Cara 1 - Menggunakan psql

Jalankan dari terminal:

```bash
psql -U postgres -d manrisk -f manrisk.sql
```

Jika PostgreSQL menggunakan port tertentu:

```bash
psql -U postgres -p 5432 -d manrisk -f manrisk.sql
```

Jika diminta password, masukkan password user PostgreSQL.

---

## Cara 2 - Menggunakan PostgreSQL melalui `createdb`

Jika database belum dibuat:

```bash
createdb -U postgres manrisk
```

Kemudian import:

```bash
psql -U postgres -d manrisk -f manrisk.sql
```

---

## Cara 3 - Menggunakan pgAdmin

Jika menggunakan pgAdmin:

1. Buka **pgAdmin**
2. Connect ke PostgreSQL Server
3. Buat database baru dengan nama:

```text
manrisk
```

4. Klik database `manrisk`
5. Pilih **Query Tool**
6. Buka file:

```text
manrisk.sql
```

7. Jalankan query menggunakan tombol **Execute**

Setelah proses selesai, tabel dan struktur database akan tersedia di database `manrisk`.

---

# ⚙️ Environment Configuration

## 5. Membuat File `.env`

File `.env` digunakan untuk menyimpan konfigurasi aplikasi seperti:

- Database host
- Database port
- Database username
- Database password
- Database name
- JWT secret
- Port backend
- Konfigurasi API lainnya

File `.env` **tidak boleh di-push ke GitHub** karena dapat berisi credential dan informasi rahasia.

Buat file:

```text
.env
```

Contoh:

```env
NODE_ENV=development

PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=manrisk
DB_USER=postgres
DB_PASSWORD=PASSWORD_DATABASE

JWT_SECRET=GANTI_DENGAN_SECRET_YANG_AMAN
```

> Sesuaikan nama variable dengan konfigurasi yang digunakan pada source code backend.

---

# ▶️ Menjalankan Backend

## Development

Untuk menjalankan backend secara langsung:

```bash
node server.js
```

Jika `package.json` memiliki script `start`, dapat menggunakan:

```bash
npm start
```

Jika menggunakan script `dev`:

```bash
npm run dev
```

Setelah berhasil dijalankan, backend biasanya dapat diakses melalui:

```text
http://localhost:5001
```

Port mengikuti konfigurasi pada `.env`.

---

# 🔍 Mengecek API

Setelah server berjalan, API dapat diuji menggunakan:

- Browser
- Postman
- Insomnia
- REST Client
- Frontend ManRisk

Contoh:

```text
http://localhost:5001/api
```

Sesuaikan URL dengan route yang tersedia pada folder:

```text
routes/
```

---

# 🔐 Authentication

Jika backend menggunakan JWT, pastikan `JWT_SECRET` sudah dikonfigurasi pada `.env`.

Contoh:

```env
JWT_SECRET=secret_yang_sangat_aman
```

Jangan menggunakan secret yang sama untuk environment development dan production.

---

# 🏭 Menjalankan Backend di Production

Untuk server production, disarankan menggunakan **PM2**.

Install PM2 secara global:

```bash
npm install -g pm2
```

Cek:

```bash
pm2 -v
```

---

## Menjalankan Backend dengan PM2

Dari folder project:

```bash
pm2 start server.js --name simanis-backend
```

Cek proses:

```bash
pm2 status
```

Melihat log:

```bash
pm2 logs simanis-backend
```

Restart:

```bash
pm2 restart simanis-backend
```

Stop:

```bash
pm2 stop simanis-backend
```

Hapus process:

```bash
pm2 delete simanis-backend
```

---

# 🔄 Menjalankan Setelah Server Restart

Agar PM2 otomatis menjalankan aplikasi ketika server Linux restart:

```bash
pm2 startup
```

Ikuti perintah yang diberikan oleh PM2.

Kemudian simpan daftar process:

```bash
pm2 save
```

Cek kembali:

```bash
pm2 status
```

---

# 📦 Update Backend dari GitHub

Jika terdapat perubahan source code di GitHub:

```bash
cd /path/to/simanis-backend
```

Kemudian:

```bash
git pull origin main
```

Install dependency jika terdapat perubahan pada `package.json`:

```bash
npm install
```

Untuk deployment production dengan `package-lock.json`:

```bash
npm ci
```

Setelah itu restart PM2:

```bash
pm2 restart simanis-backend
```

Periksa log:

```bash
pm2 logs simanis-backend
```

---

# 🔒 Keamanan

Jangan pernah meng-upload file berikut ke repository public:

```text
.env
.env.production
.env.development
```

Jangan menyimpan informasi berikut secara hardcode di source code:

- Password database
- JWT secret
- API key
- Token
- Password user
- Credential server
- Credential layanan pihak ketiga

Gunakan environment variable melalui `.env`.

---

# 📤 Folder Upload

Folder:

```text
uploads/
```

digunakan untuk menyimpan file yang di-upload oleh aplikasi.

Folder ini tidak disimpan di GitHub.

Agar folder tetap tersedia setelah clone repository, dapat dibuat file:

```text
uploads/.gitkeep
```

Kemudian folder tetap dibuat:

```bash
mkdir -p uploads
```

---

# 🛠️ Troubleshooting

## Error: Cannot find module

Jika muncul:

```text
Error: Cannot find module 'xxxxx'
```

jalankan:

```bash
npm install
```

Kemudian jalankan kembali:

```bash
node server.js
```

---

## Error: Database connection failed

Periksa konfigurasi `.env`:

```env
DB_HOST=
DB_PORT=
DB_NAME=
DB_USER=
DB_PASSWORD=
```

Kemudian pastikan PostgreSQL berjalan.

Linux:

```bash
sudo systemctl status postgresql
```

---

## Error: Port already in use

Jika muncul error seperti:

```text
EADDRINUSE
```

berarti port yang digunakan backend sedang dipakai oleh process lain.

Cek menggunakan:

```bash
sudo lsof -i :3000
```

Ganti `3000` dengan port backend yang digunakan.

Jika menggunakan PM2:

```bash
pm2 status
```

---

## Mengecek Log PM2

Gunakan:

```bash
pm2 logs simanis-backend
```

Atau:

```bash
pm2 logs simanis-backend --lines 100
```

---

# 📌 Deployment Checklist

Sebelum menjalankan backend di server production, pastikan:

- [ ] Node.js sudah terinstall
- [ ] npm sudah tersedia
- [ ] PostgreSQL sudah terinstall
- [ ] Database `manrisk` sudah dibuat
- [ ] `manrisk.sql` sudah di-import
- [ ] Repository sudah di-clone
- [ ] `npm ci` / `npm install` sudah dijalankan
- [ ] File `.env` sudah dibuat
- [ ] Konfigurasi database sudah benar
- [ ] Port backend sudah tersedia
- [ ] Backend berhasil dijalankan dengan `node server.js`
- [ ] API dapat diakses
- [ ] PM2 sudah terinstall
- [ ] Backend sudah dijalankan menggunakan PM2
- [ ] `pm2 save` sudah dilakukan
- [ ] PM2 startup sudah dikonfigurasi
- [ ] Firewall/server sudah mengizinkan port yang diperlukan
- [ ] Nginx/reverse proxy sudah dikonfigurasi jika digunakan

---

# 👨‍💻 Development

Untuk pengembangan lokal:

```bash
git clone https://github.com/USERNAME/REPOSITORY.git
cd REPOSITORY
npm install
```

Buat `.env`, kemudian konfigurasi database.

Import database:

```bash
psql -U postgres -d manrisk -f manrisk.sql
```

Jalankan backend:

```bash
node server.js
```

atau:

```bash
npm run dev
```

---

# 📄 License

Internal / Private Project.

Repository ini digunakan untuk kebutuhan pengembangan sistem ManRisk dan tidak untuk didistribusikan tanpa izin.
