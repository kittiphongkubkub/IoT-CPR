# 🚀 Quick Start — CPR Training System

## สิ่งที่ต้องติดตั้งก่อน

| โปรแกรม | Version | ดาวน์โหลด |
|---------|---------|-----------|
| Node.js | 18+ | https://nodejs.org |
| PostgreSQL | 17 | ติดตั้งแล้ว |

---

## Step 1 — สร้าง Database (ครั้งแรกเท่านั้น)

เปิด **PowerShell** แล้วรัน:

```powershell
$env:PGPASSWORD='123456'
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE cpr_training;"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d cpr_training -f "backend\schema.sql"
```

> ✅ จะได้ข้อมูลตัวอย่าง 10 records ในระบบทันที

---

## Step 2 — ติดตั้ง Dependencies (ครั้งแรกเท่านั้น)

```powershell
cd backend
npm install
```

---

## Step 3 — ตั้งค่า `.env`

ตรวจสอบให้ไฟล์ `backend\.env` มีค่าดังนี้:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cpr_training
DB_USER=postgres
DB_PASSWORD=123456
PORT=3000

# ESP32 Serial (AUTO = ตรวจจับ port อัตโนมัติ)
SERIAL_PORT=AUTO
SERIAL_BAUD=115200
```

---

## Step 4 — เริ่ม Server

```powershell
cd backend
node server.js
```

เห็น output แบบนี้ = พร้อมใช้งาน ✅

```
=================================
🫀 CPR Training System - Backend
=================================
🌐 Server:    http://localhost:3000
� WebSocket: ws://localhost:3000
�📋 API:       http://localhost:3000/api/sessions
💓 Health:    http://localhost:3000/api/health
📡 WS Status: http://localhost:3000/api/ws-status
=================================
```

> 📡 Server จะค้นหา ESP32 ผ่าน Serial อัตโนมัติ  
> ถ้าไม่พบ ESP32 → ระบบทำงานใน **simulation mode** (ไม่ต้องเสียบบอร์ด)

---

## Step 5 — เปิดเว็บ

```
http://localhost:3000
```

---

## ⚡ ใช้งานทุกวัน (Steps 4–5 เท่านั้น)

```powershell
cd backend
node server.js
# เปิดเบราว์เซอร์ → http://localhost:3000
```

> **หยุด server:** กด `Ctrl + C`

---

## 🗂️ โครงสร้างโปรเจค

```
IoT-CPR/
├── frontend/        ← เว็บแอปพลิเคชัน (HTML/CSS/JS)
├── backend/         ← Node.js API + WebSocket + PostgreSQL
│   ├── server.js    ← Express + WebSocket + Serial handler
│   ├── db.js        ← PostgreSQL connection pool
│   ├── schema.sql   ← Database schema
│   └── .env         ← Environment variables (ห้าม commit!)
├── assets/          ← ไฟล์วิดีโอ
└── tools/           ← Python serial bridge (legacy, ไม่จำเป็นแล้ว)
```

---

## 🔌 ESP32 Serial (ถ้ามีบอร์ด)

Server เชื่อมต่อ ESP32 ผ่าน USB Serial **อัตโนมัติ** โดยไม่ต้องรันโปรแกรมเพิ่ม

- ต่อสาย USB → Server ตรวจจับ COM port เอง
- ข้อมูลจาก ESP32 ส่งผ่าน WebSocket ไปยังเบราว์เซอร์ทันที
- ดูสถานะการเชื่อมต่อ: `http://localhost:3000/api/ws-status`

---

## 🔧 แก้ปัญหาด่วน

| ปัญหา | วิธีแก้ |
|-------|---------|
| `EADDRINUSE: port 3000` | Port 3000 ถูกใช้อยู่ → รัน `Stop-Process -Name "node" -Force` |
| `ไม่สามารถเชื่อมต่อ PostgreSQL` | ตรวจสอบ `.env` และว่า PostgreSQL service รันอยู่ |
| `Cannot find module` | รัน `npm install` ใน `backend/` |
| ESP32 ไม่ตอบสนอง | ตรวจสอบ `SERIAL_PORT=AUTO` ใน `.env` หรือระบุ COM port ตรงๆ เช่น `SERIAL_PORT=COM3` |
