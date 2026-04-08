// backend/server.js
// CPR Training System - Express REST API + WebSocket (Serial & WiFi)

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
require('dotenv').config();

const pool = require('./db');
const app = express();
const PORT = process.env.PORT || 3000;

// ==================== WebSocket State ====================
const browserClients = new Set();   // browser tabs
let serialPort = null;
let serialConnected = false;
const SERIAL_PORT_CFG = process.env.SERIAL_PORT || 'AUTO';
const BAUD_RATE = parseInt(process.env.SERIAL_BAUD) || 115200;
// VID:PID ของ ESP32 USB chips ที่พบบ่อย
const ESP32_VID = ['10C4', '1A86', '0403'];

// ==================== Middleware ====================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// ==================== GET /api/sessions ====================
// ดึงข้อมูลทดสอบทั้งหมด
app.get('/api/sessions', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                id,
                name,
                TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI:SS') AS datetime,
                scenario,
                difficulty,
                duration,
                CONCAT(FLOOR(duration / 60), ':', LPAD(CAST(MOD(duration, 60) AS TEXT), 2, '0')) AS duration_display,
                avg_force,
                avg_bpm,
                avg_depth,
                compression_count,
                consistency,
                score,
                status,
                created_at
             FROM training_sessions
             ORDER BY created_at DESC`
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('❌ GET /api/sessions Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== GET /api/stats ====================
// สถิติรวม
app.get('/api/stats', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                COUNT(*)                                        AS total,
                COUNT(*) FILTER (WHERE status = 'รอด')          AS pass_count,
                COUNT(*) FILTER (WHERE status = 'ไม่รอด')       AS fail_count,
                ROUND(AVG(score), 1)                            AS avg_score,
                ROUND(AVG(avg_bpm), 0)                          AS avg_bpm,
                ROUND(AVG(avg_depth), 2)                        AS avg_depth
             FROM training_sessions`
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('❌ GET /api/stats Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== POST /api/sessions ====================
// บันทึกผลการทดสอบใหม่
app.post('/api/sessions', async (req, res) => {
    const {
        name,
        scenario,
        difficulty,
        duration,
        avg_force,
        avg_bpm,
        avg_depth,
        compression_count,
        consistency,
        score,
        status
    } = req.body;

    // Validate required fields
    if (!name || name.trim() === '') {
        return res.status(400).json({ success: false, error: 'กรุณาระบุชื่อผู้ทดสอบ' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO training_sessions
                (name, scenario, difficulty, duration, avg_force, avg_bpm, avg_depth,
                 compression_count, consistency, score, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [
                name.trim(),
                scenario || 'ทั่วไป',
                difficulty || 'beginner',
                duration || 0,
                avg_force || 0,
                avg_bpm || 0,
                avg_depth || 0,
                compression_count || 0,
                consistency || 0,
                score || 0,
                status || 'ไม่รอด'
            ]
        );

        console.log(`✅ บันทึกผล: ${name} → คะแนน ${score} (${status})`);
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('❌ POST /api/sessions Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== DELETE /api/sessions/:id ====================
// ลบผลการทดสอบ
app.delete('/api/sessions/:id', async (req, res) => {
    const { id } = req.params;

    if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'ID ไม่ถูกต้อง' });
    }

    try {
        const result = await pool.query(
            'DELETE FROM training_sessions WHERE id = $1 RETURNING id, name',
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลที่ต้องการลบ' });
        }

        console.log(`🗑️ ลบผล ID ${id}: ${result.rows[0].name}`);
        res.json({ success: true, deleted: result.rows[0] });
    } catch (err) {
        console.error('❌ DELETE /api/sessions Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==================== Health Check ====================
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            success: true,
            status: 'OK',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ success: false, status: 'ERROR', database: 'disconnected' });
    }
});

// ==================== WebSocket Status ====================
app.get('/api/ws-status', (req, res) => {
    res.json({
        success: true,
        websocket: 'running',
        serial: {
            connected: serialConnected,
            port: serialPort ? serialPort.path : null
        },
        browser_clients: browserClients.size
    });
});

// ==================== 404 ====================
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ success: false, error: `ไม่พบ endpoint: ${req.path}` });
    } else {
        res.redirect('/');
    }
});


// ==================== HTTP + WebSocket Server ====================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Broadcast JSON ไปยัง browser clients ทั้งหมด
function broadcastToBrowsers(data) {
    const msg = JSON.stringify(data);
    for (const ws of browserClients) {
        if (ws.readyState === ws.OPEN) ws.send(msg);
    }
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;

    // ส่งสถานะเริ่มต้นให้ browser
    browserClients.add(ws);
    console.log(`🌐 Browser เชื่อมต่อ: ${ip} (รวม ${browserClients.size})`);

    ws.send(JSON.stringify({
        type: 'status',
        connected: serialConnected,
        mode: serialConnected ? 'serial' : 'simulation'
    }));

    // รับคำสั่งจาก browser → ส่งต่อไป Serial
    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            console.log(`📨 Browser → ESP32: ${data.type}`);
            if (serialPort && serialPort.isOpen) {
                serialPort.write(JSON.stringify(data) + '\n');
            }
        } catch { /* ignore */ }
    });

    ws.on('close', () => {
        browserClients.delete(ws);
        console.log(`❌ Browser ตัดการเชื่อมต่อ (เหลือ ${browserClients.size})`);
    });
});

// ==================== Serial Port Auto-connect ====================
async function findESP32Port() {
    const ports = await SerialPort.list();
    if (SERIAL_PORT_CFG !== 'AUTO') return SERIAL_PORT_CFG;
    for (const p of ports) {
        const vid = (p.vendorId || '').toUpperCase();
        if (ESP32_VID.some(v => vid.includes(v))) return p.path;
    }
    return null;
}

async function connectSerial() {
    try {
        const portPath = await findESP32Port();
        if (!portPath) {
            console.log('⚠️  ไม่พบ ESP32 — รอ Serial connection (ระบบจะทำงาน simulation mode)');
            return;
        }

        console.log(`🔌 พบ ESP32 ที่ ${portPath} — กำลังเชื่อมต่อ...`);
        serialPort = new SerialPort({ path: portPath, baudRate: BAUD_RATE });
        const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

        serialPort.on('open', () => {
            serialConnected = true;
            console.log(`✅ Serial เชื่อมต่อสำเร็จ! (${portPath}, ${BAUD_RATE} baud)`);
            broadcastToBrowsers({ type: 'status', connected: true, mode: 'serial', port: portPath });
            serialPort.write(JSON.stringify({ type: 'start' }) + '\n');
        });

        parser.on('data', (line) => {
            line = line.trim();
            if (!line.startsWith('{')) return;
            try {
                const data = JSON.parse(line);
                if (data.type === 'compression') {
                    console.log(`💓 Compression #${data.id}: ${data.force?.toFixed(1)}kg | BPM:${data.bpm?.toFixed(0)} | Depth:${data.depth?.toFixed(1)}cm | ${data.quality} | Batt:${data.batt_pct?.toFixed(0)}%`);
                } else if (data.type === 'live') {
                    // live update — broadcast silently (high frequency)
                } else if (data.type === 'data') {
                    console.log(`📊 ESP32: แรง=${data.force?.toFixed(1)}kg ลึก=${data.depth?.toFixed(1)}cm`);
                } else if (data.type === 'status') {
                    console.log(`📡 ESP32 status: ${data.msg || JSON.stringify(data)}`);
                }
                broadcastToBrowsers(data);
            } catch { /* not JSON */ }
        });

        serialPort.on('close', () => {
            serialConnected = false;
            console.log('📡 Serial ขาดการเชื่อมต่อ — รอ reconnect 5 วินาที...');
            broadcastToBrowsers({ type: 'status', connected: false, mode: 'disconnected' });
            setTimeout(connectSerial, 5000);
        });

        serialPort.on('error', (err) => {
            console.error('❌ Serial Error:', err.message);
            serialConnected = false;
            setTimeout(connectSerial, 5000);
        });

    } catch (err) {
        console.error('❌ Serial connect failed:', err.message);
        setTimeout(connectSerial, 5000);
    }
}

// ==================== Start Server ====================
server.listen(PORT, () => {
    console.log('\n=================================');
    console.log('🫀 CPR Training System - Backend');
    console.log('=================================');
    console.log(`🌐 Server:    http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log(`📋 API:       http://localhost:${PORT}/api/sessions`);
    console.log(`💓 Health:    http://localhost:${PORT}/api/health`);
    console.log(`📡 WS Status: http://localhost:${PORT}/api/ws-status`);
    console.log('=================================\n');
    // เริ่มหา ESP32 Serial
    connectSerial();
});
