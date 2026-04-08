#!/usr/bin/env python3
"""
CPR Training System - Serial to WebSocket Bridge
🔌 เชื่อมต่อ ESP32 (Serial Port) กับเว็บไซต์ (WebSocket)

วิธีใช้:
1. ติดตั้ง dependencies: pip install pyserial websockets
2. รัน: python serial_bridge.py
3. เปิดเว็บไซต์และเริ่มทดสอบ

อัตโนมัติ:
- หา COM Port ของ ESP32 อัตโนมัติ
- Reconnect เมื่อ ESP32 หลุด
- รองรับหลาย clients พร้อมกัน
"""

import asyncio
import serial
import serial.tools.list_ports
import json
import websockets
import sys
from datetime import datetime

# ==================== Configuration ====================
WEBSOCKET_PORT = 8765
BAUD_RATE = 115200
ESP32_VID_PID = [(0x10C4, 0xEA60), (0x1A86, 0x7523), (0x0403, 0x6001)]  # Common ESP32 USB chips

# ==================== Global Variables ====================
connected_clients = set()
serial_port = None
esp32_connected = False

# ==================== Color Codes for Console ====================
class Colors:
    RESET = '\033[0m'
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'

def log(message, color=Colors.RESET):
    """พิมพ์ log พร้อมสี"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"{color}[{timestamp}] {message}{Colors.RESET}")

# ==================== หา ESP32 Port อัตโนมัติ ====================
def find_esp32_port():
    """ค้นหา COM Port ของ ESP32 อัตโนมัติ"""
    ports = serial.tools.list_ports.comports()
    
    # ลองหา ESP32 จาก VID:PID
    for port in ports:
        for vid, pid in ESP32_VID_PID:
            if port.vid == vid and port.pid == pid:
                return port.device
    
    # ถ้าไม่เจอ แสดง port ทั้งหมดให้เลือก
    if ports:
        log("พบ Serial Ports:", Colors.YELLOW)
        for i, port in enumerate(ports):
            log(f"  [{i}] {port.device} - {port.description}", Colors.CYAN)
        
        try:
            choice = int(input("\nเลือก Port (ใส่หมายเลข): "))
            if 0 <= choice < len(ports):
                return ports[choice].device
        except:
            pass
    
    return None

# ==================== เชื่อมต่อ Serial Port ====================
async def connect_serial():
    """เชื่อมต่อกับ ESP32 ผ่าน Serial Port"""
    global serial_port, esp32_connected
    
    while True:
        try:
            if serial_port is None or not serial_port.is_open:
                log("🔍 กำลังหา ESP32...", Colors.YELLOW)
                port_name = find_esp32_port()
                
                if port_name:
                    log(f"🔌 กำลังเชื่อมต่อ ESP32 ที่ {port_name}...", Colors.CYAN)
                    serial_port = serial.Serial(port_name, BAUD_RATE, timeout=1)
                    await asyncio.sleep(2)  # รอ ESP32 รีเซ็ต
                    
                    log(f"✅ เชื่อมต่อ ESP32 สำเร็จ! ({port_name})", Colors.GREEN)
                    esp32_connected = True
                    
                    # ส่งคำสั่ง start
                    send_to_esp32({"type": "start"})
                else:
                    log("❌ ไม่พบ ESP32", Colors.RED)
                    log("   กรุณาตรวจสอบ:", Colors.YELLOW)
                    log("   1. ESP32 เสียบ USB แล้วหรือยัง?", Colors.YELLOW)
                    log("   2. ไดร์เวอร์ติดตั้งครบหรือยัง?", Colors.YELLOW)
                    await asyncio.sleep(5)
                    
        except serial.SerialException as e:
            log(f"❌ Serial Error: {e}", Colors.RED)
            esp32_connected = False
            if serial_port:
                serial_port.close()
                serial_port = None
            await asyncio.sleep(5)
        
        await asyncio.sleep(1)

# ==================== อ่านข้อมูลจาก ESP32 ====================
async def read_from_esp32():
    """อ่านข้อมูลจาก ESP32 และส่งต่อไปยัง WebSocket clients"""
    global esp32_connected
    
    while True:
        try:
            if serial_port and serial_port.is_open and serial_port.in_waiting > 0:
                line = serial_port.readline().decode('utf-8').strip()
                
                if line:
                    # ถ้าเป็น JSON ให้ส่งไปยัง clients
                    if line.startswith('{'):
                        try:
                            data = json.loads(line)
                            
                            # Log ข้อมูลที่ได้
                            if data.get('type') == 'data':
                                log(f"📊 การกดครั้งที่ {data.get('count')} | "
                                    f"แรง: {data.get('force'):.0f} N | "
                                    f"ลึก: {data.get('depth'):.1f} cm", 
                                    Colors.GREEN)
                            
                            # ส่งไปยัง clients ทั้งหมด
                            if connected_clients:
                                message = json.dumps(data)
                                websockets.broadcast(connected_clients, message)
                                
                        except json.JSONDecodeError:
                            pass  # ไม่ใช่ JSON ข้าม
                    else:
                        # แสดง log ธรรมดาจาก ESP32
                        if not line.startswith('=') and len(line) > 5:
                            log(f"ESP32: {line}", Colors.CYAN)
                            
        except serial.SerialException:
            esp32_connected = False
            log("❌ ESP32 ขาดการเชื่อมต่อ", Colors.RED)
            if serial_port:
                serial_port.close()
            await asyncio.sleep(1)
        except Exception as e:
            log(f"❌ Error reading: {e}", Colors.RED)
            
        await asyncio.sleep(0.01)  # 10ms

# ==================== ส่งข้อมูลไป ESP32 ====================
def send_to_esp32(data):
    """ส่งข้อมูลไปยัง ESP32 ผ่าน Serial"""
    try:
        if serial_port and serial_port.is_open:
            message = json.dumps(data) + '\n'
            serial_port.write(message.encode('utf-8'))
            log(f"📤 ส่งคำสั่งไป ESP32: {data.get('type')}", Colors.BLUE)
    except Exception as e:
        log(f"❌ Error sending to ESP32: {e}", Colors.RED)

# ==================== WebSocket Handler ====================
async def websocket_handler(websocket):
    """จัดการ WebSocket connections จากเว็บไซต์"""
    client_id = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
    
    try:
        # เพิ่ม client
        connected_clients.add(websocket)
        log(f"✅ Client เชื่อมต่อ: {client_id} (รวม {len(connected_clients)} clients)", Colors.GREEN)
        
        # ส่งสถานะเริ่มต้น
        status = {
            "type": "status",
            "connected": esp32_connected,
            "mode": "serial"
        }
        await websocket.send(json.dumps(status))
        
        # รับข้อมูลจาก client
        async for message in websocket:
            try:
                data = json.loads(message)
                log(f"📨 ได้รับจาก {client_id}: {data.get('type')}", Colors.BLUE)
                
                # ส่งต่อไปยัง ESP32
                send_to_esp32(data)
                
            except json.JSONDecodeError:
                log(f"⚠️ Invalid JSON from {client_id}", Colors.YELLOW)
                
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        # ลบ client
        connected_clients.discard(websocket)
        log(f"❌ Client ตัดการเชื่อมต่อ: {client_id} (เหลือ {len(connected_clients)} clients)", Colors.RED)

# ==================== Main ====================
async def main():
    """เริ่มทำงานทั้ง Serial และ WebSocket"""
    log("=================================", Colors.CYAN)
    log("🫀 CPR Training System", Colors.CYAN)
    log("🔌 Serial to WebSocket Bridge", Colors.CYAN)
    log("=================================\n", Colors.CYAN)
    
    # เริ่ม WebSocket Server
    log(f"🌐 เริ่ม WebSocket Server ที่ ws://localhost:{WEBSOCKET_PORT}", Colors.GREEN)
    websocket_server = await websockets.serve(websocket_handler, "localhost", WEBSOCKET_PORT)
    
    # เริ่ม Serial tasks
    serial_connect_task = asyncio.create_task(connect_serial())
    serial_read_task = asyncio.create_task(read_from_esp32())
    
    log("\n=================================", Colors.GREEN)
    log("✅ ระบบพร้อมทำงาน!", Colors.GREEN)
    log("=================================\n", Colors.GREEN)
    log("📋 ขั้นตอนถัดไป:", Colors.YELLOW)
    log("1. เปิดเว็บไซต์: http://localhost:8000", Colors.CYAN)
    log("2. คลิก 'เริ่มการทดสอบใหม่'", Colors.CYAN)
    log("3. กดปุ่ม BOOT บน ESP32 = ส่งข้อมูล!", Colors.CYAN)
    log("\nกด Ctrl+C เพื่อหยุด\n", Colors.YELLOW)
    
    try:
        await asyncio.gather(serial_connect_task, serial_read_task)
    except KeyboardInterrupt:
        log("\n👋 กำลังปิดระบบ...", Colors.YELLOW)
        if serial_port:
            serial_port.close()
        log("✅ ปิดระบบเรียบร้อย", Colors.GREEN)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
