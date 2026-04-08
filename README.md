# CPR Training System 🫀

ระบบฝึกปั้มหัวใจ CPR ด้วย IoT และการแสดงผลแบบ Real-time

## คุณสมบัติหลัก

### 📊 Dashboard
- แสดงสถิติการทดสอบทั้งหมด
- กราฟแนวโน้มคะแนนการทดสอบ
- สถิติผู้รอดและไม่รอด
- ระบบกรองและค้นหาข้อมูล
- ส่งออกข้อมูลเป็น CSV

### 🎯 ระบบการทดสอบ
- เลือกสถานการณ์: จมน้ำ, หมดสติ
- เลือกเวลาฝึก: 2 นาที หรือ 4 นาที
- คำแนะนำการประเมินสถานการณ์
- วิดีโอสาธิตสถานการณ์

### 💪 การฝึก CPR Real-time
- ตรวจวัดแรงกด (N)
- วัดจังหวะการกด (BPM)
- วัดความลึกการกด (cm)
- แสดงผลแบบ Real-time
- ระบบ Metronome ช่วยจังหวะ
- Keyboard shortcuts สำหรับการทดสอบ

### 📈 การประเมินผล
- คำนวณคะแนนอัตโนมัติ
- ประเมินความสม่ำเสมอ
- แสดงสถิติรายละเอียด
- บันทึกผลการทดสอบ

## โครงสร้างไฟล์

```
dashboard-IOT/
├── index.html          # หน้า Dashboard หลัก
├── scenario.html       # หน้าแสดงสถานการณ์และคำแนะนำ
├── training.html       # หน้าฝึก CPR
├── script.js          # JavaScript สำหรับ Dashboard
├── training.js        # JavaScript สำหรับการฝึก
├── style.css          # Stylesheet หลัก
└── assets/            # รูปภาพและวิดีโอ
    ├── drowning.mp4   # วิดีโอสถานการณ์จมน้ำ
    └── unconscious.mp4 # วิดีโอสถานการณ์หมดสติ
```

## วิธีการใช้งาน

1. เปิดไฟล์ `index.html` ในเบราว์เซอร์
2. คลิก "เริ่มการทดสอบใหม่"
3. กรอกข้อมูล:
   - ชื่อ-นามสกุลผู้ทดสอบ
   - เลือกสถานการณ์
   - เลือกเวลาฝึก (2 นาที หรือ 4 นาที)
4. ชมคำแนะนำและวิดีโอสถานการณ์
5. เริ่มฝึก CPR พร้อมการตรวจวัดแบบ Real-time
6. ดูผลการประเมินและสถิติ

## เทคโนโลยีที่ใช้

- **HTML5** - โครงสร้างหน้าเว็บ
- **CSS3** - การออกแบบและ Animation
- **JavaScript** - Logic และ Interactivity
- **Chart.js** - กราฟและการแสดงผลสถิติ
- **WebSocket** - การเชื่อมต่อแบบ Real-time กับ ESP32
- **ESP32 + Arduino** - Hardware สำหรับรับข้อมูลจริง

## 🔌 การเชื่อมต่อ ESP32

ระบบรองรับการเชื่อมต่อ ESP32 แบบ Real-time ผ่าน WebSocket แล้ว!

### วิธีเริ่มต้นแบบรวดเร็ว

1. **Upload โค้ดลง ESP32**: ดูคู่มือที่ [QUICKSTART.md](QUICKSTART.md)
2. **ตั้งค่า WiFi** ใน `esp32_websocket.ino`
3. **แก้ไข IP** ใน `training.js`
4. **รันเว็บบน Local Server**: `python -m http.server 8000`
5. **เริ่มทดสอบ!** 🎉

### คู่มือครบถ้วน
- 📖 [Quick Start Guide](QUICKSTART.md) - เริ่มต้นใช้งานภายใน 5 นาที
- 📚 [ESP32 Setup Guide](ESP32_SETUP.md) - คู่มือติดตั้งแบบละเอียด

## การพัฒนาในอนาคต

### 🎮 ระบบระดับความยาก (Beginner/Advanced Mode)
- **Beginner Mode**: โหมดสำหรับผู้เริ่มต้น
  - เวลาฝึก 2 นาที
  - คำแนะนำเพิ่มเติมระหว่างฝึก
  - เกณฑ์การผ่านที่ผ่อนปรน
  - แสดงคำใบ้และคำแนะนำแบบ Real-time
  
- **Advanced Mode**: โหมดสำหรับผู้มีประสบการณ์
  - เวลาฝึก 4 นาที
  - เกณฑ์การประเมินที่เข้มงวดขึ้น
  - สถานการณ์ที่ซับซ้อนมากขึ้น
  - การวัดผลที่ละเอียดขึ้น

### 🔌 การเชื่อมต่อ Hardware
- เชื่อมต่อกับ ESP32 ผ่าน WebSocket
- รับข้อมูลจาก Load Cell แบบ Real-time
- รับข้อมูลจาก Pressure Sensor
- Feedback แบบ Real-time จาก Hardware

### 📱 Responsive Design
- รองรับการแสดงผลบนมือถือ
- Tablet-friendly interface
- Touch-optimized controls

### 🌐 Backend Integration
- บันทึกข้อมูลลงฐานข้อมูล
- API สำหรับดึงข้อมูลสถิติ
- ระบบ Authentication
- Multi-user support

### 📊 Analytics และ Reporting
- รายงานสถิติแบบละเอียด
- Export รายงานเป็น PDF
- เปรียบเทียบผลการทดสอบ
- แนวโน้มการพัฒนาของผู้ทดสอบ

### 🎓 Learning Management
- ระบบจัดการหลักสูตร
- ติดตามความก้าวหน้า
- ใบประกาศนียบัตร
- วิดีโอสอนเพิ่มเติม

## ผู้พัฒนา

Developed with ❤️ for better CPR training

## ลิขสิทธิ์

© 2026 CPR Training System. All rights reserved.
