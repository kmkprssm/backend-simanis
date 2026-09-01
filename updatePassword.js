const bcrypt = require('bcryptjs');
const { pool } = require('./config/db');

const updatePassword = async () => {
  try {
    const email = 'user@gmail.com'; // Email yang mau diupdate
    const newPassword = '123456'; // Password baru
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    const result = await pool.query(
      'UPDATE public."User" SET password = $1 WHERE email = $2 RETURNING email, role',
      [hashedPassword, email]
    );
    
    if (result.rows.length > 0) {
      console.log('✅ Password updated successfully!');
      console.log('📧 Email:', result.rows[0].email);
      console.log('🔑 New Password:', newPassword);
      console.log('👤 Role:', result.rows[0].role);
    } else {
      console.log('❌ User not found with email:', email);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

updatePassword();