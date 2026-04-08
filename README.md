# CPR Training System 🫀

ระบบฝึกปั้มหัวใจ CPR ด้วย IoT แบบครบวงจร แสดงผลแบบ Real-time พร้อมระบบประเมินผลผ่าน Web Dashboard 

## 🌟 คุณสมบัติหลัก

### 📈 1. Live Monitor
- **Real-time Diagnostic:** ตรวจโครงสร้างและกระแสข้อมูลดิบจาก Hardware ทุกๆ 100ms
- แสดงค่า **แรงกด (kg)**, **ความลึก (cm)**, และความแม่นยำด้าน **ตำแหน่ง (FSR)**
- ดูกระแสไฟและเปอร์เซ็นต์แบตเตอรี่ (INA226) เพื่อตรวจสอบสถานะอุปกรณ์
- แสดงกราฟ Real-time ควบคู่กับ Raw JSON Log

### 🎯 2. Training Dashboard
- โหมดฝึกซ้อมพร้อมการตั้งเป้าหมาย (Gamification)
- รองรับการตั้งค่าสถานการณ์ (จมน้ำ/หมดสติ) และระดับความยาก
- ประเมินคะแนนการทำ CPR ทันทีหลังจบเซสชัน พร้อมคำนวณ:
  - จังหวะการกด (BPM)
  - ความสม่ำเสมอ (Consistency)
  - แรงกด (กำลังดี / มากไป / น้อยไป)
  - การคืนตัวของหน้าอก (Recoil)

### 📊 3. Analytics & Overview Dashboard
- หน้าจอสรุปสถิติผู้เข้าทดสอบทั้งหมดแบบตาราง
- คำนวณเปอร์เซ็นต์ผู้รอดชีวิต (Passed Rate) และผู้เสียชีวิตอัตโนมัติ
- กราฟแนวโน้มคะแนนการทำ CPR

---

## 📂 โครงสร้างโปรเจกต์ (Project Structure)

โปรเจกต์นี้แบ่งแกนการทำงานเป็น 3 ส่วนหลัก (Architecture):

```text
IoT-CPR/
├── firmware/       # Code สำหรับเซ็นเซอร์และ ESP32
│   └── esp32_main/ # (C++) โค้ดหลักในการอ่านค่า ถ่วงน้ำหนัก และแปลงส่งออกเปน JSON
├── backend/        # ระบบเซิร์ฟเวอร์
│   ├── server.js   # (Node.js) ดึงข้อมูลจาก Serial Port และยิงขึ้นวง WebSocket
│   └── schema.sql  # โครงสร้างฐานข้อมูล PostgreSQL
└── frontend/       # หน้าเว็บสำหรับผู้ใช้งาน (UI/UX)
    ├── index.html  # หน้า Analytics และประวัติย้อนหลัง
    ├── live.html   # หน้า Live Monitor สังเกตเซ็นเซอร์
    ├── training.*  # หน้าระบบสอบและจำลอง CPR
    └── style.css   # ระบบ Design System (Glassmorphism / Modern UI)
```

---

## 🛠️ เทคโนโลยีที่ใช้งาน (Tech Stack)

### 📡 อุปกรณ์ Hardware
- **ไมโครคอนโทรลเลอร์:** ESP32 (รันผ่าน Arduino Framework)
- **วัดแรงกด:** HX711 Load Cell Amplifier
- **วัดความลึกและรอบ:** MPU-6050 (Accelerometer / Gyroscope)
- **วัดตำแหน่งมือ:** FSR 402 (Force Sensitive Resistor)
- **วัดพลังงาน:** INA226 (วัดกระแส/แรงดันแบตเตอรี่)
- **การนำเสนอ:** จอ OLED สีเดียว, LED ส่องสถานะ

### 💻 Software & Backend
- **Server Environment:** Node.js (Express)
- **Communication:** SerialPort สำหรับรับข้อมูล ESP32 และ `ws` (WebSocket) เพื่อส่งให้เว็บทันที
- **Database:** PostgreSQL (บันทึกข้อมูลประวัติการสอบ)
- **Frontend App:** Vanilla HTML/CSS/JS รูปแบบ Single-Page Application (SPA)
- **กราฟและการพลอต:** Chart.js

---

## 🚀 วิธีการติดตั้งและการรันระบบ (Getting Started)

การรันระบบนี้จำเป็นต้องดำเนินการเป็น 3 ขั้นตอน (Database -> Backend -> Hardware)

### 1. การเตรียม Database (PostgreSQL)
1. ติดตั้ง PostgreSQL ในเครื่อง
2. เปิด pgAdmin (หรือ Command Line) สร้างฐานข้อมูลชื่อ `cpr_training`
3. รันโค้ด SQL จากไฟล์ `backend/schema.sql` เพื่อสร้างตาราง

### 2. การเตรียมเซิร์ฟเวอร์ Backend
1. เข้าไปที่โฟลเดอร์รันคำสั่ง `cd backend`
2. สร้างไฟล์ `.env` พร้อมใส่ค่าพอร์ตเซนเซอร์และรหัสผ่าน DB (ดูรูปแบบจากโค้ด)
3. รันคำสั่งนี้เพื่อดาวน์โหลดไลบรารี:
   ```bash
   npm install
   ```
4. เปิดเซิร์ฟเวอร์:
   ```bash
   node server.js
   ```

### 3. การใช้งาน Hardware & หน้าเว็บ
1. เปิดโปรแกรม **Arduino IDE** นำไฟล์ `firmware/esp32_main/esp32_main.ino` ไปอัปโหลดลงบอร์ด ESP32
2. อย่าลืม **ปิดหน้าหน้าต่าง Serial Monitor** บนหน้าจอ Arduino เสียก่อนที่เซิร์ฟเวอร์จะเชื่อมต่อฮาร์ดแวร์ได้
3. หน้าเว็บเบราว์เซอร์ เข้าถึงได้ผ่านการพิมพ์ URL: **http://localhost:3000** 

---

## 👨‍💻 ผู้พัฒนา

Developed for an Advanced IoT integration project integrating precision measurements and complex algorithmic medical guidelines into an accessible modern platform. 

© 2026 CPR Training System. All rights reserved.
