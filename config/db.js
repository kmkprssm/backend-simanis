const { Pool } = require('pg');
require('dotenv').config();

let pool;

const connectDB = async () => {
  try {
    console.log('📦 Connecting to database with URI:', process.env.POSTGRES_URI);
    
    // Buat konfigurasi pool dengan timeout yang lebih besar
    const poolConfig = {
      connectionString: process.env.POSTGRES_URI,
      connectionTimeoutMillis: 10000, // 10 detik (naikkan dari 2000)
      idleTimeoutMillis: 30000,
      max: 20,
      // Tambahkan ini untuk mengatasi error timeout
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };

    console.log('📊 Pool config:', { 
      host: poolConfig.connectionString.split('@')[1]?.split(':')[0] || 'localhost',
      timeout: poolConfig.connectionTimeoutMillis 
    });

    pool = new Pool(poolConfig);

    // Test koneksi
    const client = await pool.connect();
    console.log('✅ PostgreSQL Connected Successfully!');
    console.log(`📛 Database: ${client.database}`);
    console.log(`🌐 Host: ${client.host}`);
    console.log(`📊 Pool size: ${pool.totalCount} of ${pool.max}`);
    
    client.release();

    // Handle error pool
    pool.on('error', (err) => {
      console.error('❌ Unexpected error on idle client:', err.message);
    });

    return pool;
  } catch (error) {
    console.error('❌ PostgreSQL Connection Error:', error.message);
    console.error('Error code:', error.code);
    console.error('Error detail:', error);
    
    // Jangan exit process, biarkan server tetap jalan tapi tanpa DB
    // process.exit(1)
    throw error;
  }
};

// Fungsi untuk mendapatkan pool dengan pengecekan
const getPool = () => {
  if (!pool) {
    throw new Error('Database not initialized. Call connectDB first.');
  }
  return pool;
};

// Fungsi untuk disconnect
const disconnectDB = async () => {
  try {
    if (pool) {
      await pool.end();
      console.log('✅ Database connection closed');
    }
  } catch (error) {
    console.error('❌ Error closing database:', error.message);
  }
};

module.exports = {
  connectDB,
  getPool,
  disconnectDB
};