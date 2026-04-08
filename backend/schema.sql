-- CPR Training System - PostgreSQL Schema
-- รัน: psql -U postgres -d cpr_training -f schema.sql

-- สร้าง Table หลักสำหรับเก็บผลการฝึก CPR
CREATE TABLE IF NOT EXISTS training_sessions (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,              -- ชื่อผู้ทดสอบ
    scenario     VARCHAR(50)  DEFAULT 'ทั่วไป',       -- จมน้ำ / หมดสติ
    difficulty   VARCHAR(20)  DEFAULT 'beginner',     -- beginner / advanced
    duration     INTEGER      DEFAULT 0,              -- เวลาที่ใช้ (วินาที)
    avg_force    NUMERIC(7,1) DEFAULT 0,              -- แรงกดเฉลี่ย (N)
    avg_bpm      INTEGER      DEFAULT 0,              -- จังหวะเฉลี่ย (BPM)
    avg_depth    NUMERIC(4,1) DEFAULT 0,              -- ความลึกเฉลี่ย (cm)
    compression_count INTEGER DEFAULT 0,             -- จำนวนครั้งที่กดทั้งหมด
    consistency  INTEGER      DEFAULT 0,              -- ความสม่ำเสมอ (0-100%)
    score        INTEGER      DEFAULT 0,              -- คะแนนรวม (0-100)
    status       VARCHAR(10)  DEFAULT 'ไม่รอด',       -- รอด / ไม่รอด
    created_at   TIMESTAMPTZ  DEFAULT NOW()           -- วันเวลาที่ทดสอบ
);

-- Index เพื่อความเร็วในการค้นหา
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON training_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_name       ON training_sessions(name);
CREATE INDEX IF NOT EXISTS idx_sessions_status     ON training_sessions(status);

-- ใส่ข้อมูลตัวอย่างเริ่มต้น (optional)
INSERT INTO training_sessions (name, scenario, difficulty, duration, avg_force, avg_bpm, avg_depth, compression_count, consistency, score, status, created_at) VALUES
('สมชาย ใจดี',        'จมน้ำ',   'beginner', 120, 485, 108, 5.2, 216, 90, 92, 'รอด',    '2026-01-14 08:30:15+07'),
('สมหญิง มีสุข',      'หมดสติ',  'beginner', 120, 512, 115, 5.5, 230, 85, 88, 'รอด',    '2026-01-14 09:15:42+07'),
('วิชัย สุขสันต์',     'จมน้ำ',   'beginner', 105, 398,  95, 4.2, 166, 60, 58, 'ไม่รอด', '2026-01-14 10:05:28+07'),
('กนกวรรณ แสงจันทร์', 'หมดสติ',  'advanced', 120, 525, 112, 5.8, 224, 95, 95, 'รอด',    '2026-01-14 10:45:10+07'),
('ประยุทธ์ วงศ์ษา',   'จมน้ำ',   'beginner',  90, 445,  88, 4.5, 132, 55, 65, 'ไม่รอด', '2026-01-14 11:20:35+07'),
('อรวรรณ ทองดี',      'หมดสติ',  'beginner', 120, 498, 105, 5.3, 210, 88, 85, 'รอด',    '2026-01-14 12:10:50+07'),
('สุรชัย ปานกลาง',    'จมน้ำ',   'beginner', 110, 420,  98, 5.0, 180, 75, 72, 'รอด',    '2026-01-14 13:30:22+07'),
('นภัสวรรณ สมบูรณ์',  'หมดสติ',  'advanced', 120, 535, 118, 5.9, 236, 98, 97, 'รอด',    '2026-01-14 14:15:18+07'),
('จักรพงษ์ วัฒนา',    'จมน้ำ',   'beginner',  80, 385,  85, 3.8, 113, 52, 52, 'ไม่รอด', '2026-01-14 14:50:45+07'),
('ปิยะนุช ศรีสุข',     'หมดสติ',  'beginner', 120, 505, 110, 5.4, 220, 92, 90, 'รอด',    '2026-01-14 15:25:33+07');
