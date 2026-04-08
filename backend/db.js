// backend/db.js
// PostgreSQL Connection Pool

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'cpr_training',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
});

// ทดสอบการเชื่อมต่อตอนเริ่ม
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ ไม่สามารถเชื่อมต่อ PostgreSQL:', err.message);
        console.error('   ตรวจสอบ .env ว่า DB_HOST, DB_USER, DB_PASSWORD, DB_NAME ถูกต้อง');
    } else {
        release();
        console.log('✅ เชื่อมต่อ PostgreSQL สำเร็จ!');
        console.log(`   Database: ${process.env.DB_NAME || 'cpr_training'} @ ${process.env.DB_HOST || 'localhost'}`);
    }
});

module.exports = pool;
