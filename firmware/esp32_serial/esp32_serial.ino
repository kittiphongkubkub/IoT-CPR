// ============================================================
// CPR Training System — ESP32 Firmware
// ============================================================
// Hardware:
//   FSR 406      → Analog A0 (GPIO 36)  — ตรวจตำแหน่งมือ
//   HX711        → DOUT=32, SCK=33      — Load Cell 4 ตัว (full-bridge)
//   MPU6050      → SDA=21, SCL=22       — ความลึก + BPM (I2C)
//   OLED SSD1306 → SDA=21, SCL=22       — Display (I2C)
//   LED Bar      → GPIO 12–19 (8 LEDs)  — ไฟแสดงคุณภาพ
// ============================================================

#include <Wire.h>
#include <HX711.h>
#include <MPU6050_light.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>

// ==================== PIN CONFIG ====================
#define FSR_PIN         36      // Analog input (VP)

// HX711 (Load Cell 4 ตัว full-bridge)
#define HX_DOUT         32
#define HX_SCK          33

// LED Bar — 8 LEDs
const int LED_PINS[] = {12, 13, 14, 15, 16, 17, 18, 19};
#define LED_COUNT       8

// OLED
#define OLED_WIDTH      128
#define OLED_HEIGHT     64
#define OLED_ADDR       0x3C

// ==================== CONSTANTS ====================
#define FSR_THRESHOLD       300     // ADC value (0-4095) เกินนี้ = มือวางอยู่
#define FORCE_GOOD_MIN      40.0f   // แรงกดดี: ≥ 40 N
#define FORCE_GOOD_MAX      60.0f   // แรงกดดี: ≤ 60 N (AHA guideline)
#define DEPTH_GOOD_MIN      5.0f    // ความลึกดี: ≥ 5.0 cm
#define DEPTH_GOOD_MAX      6.0f    // ความลึกดี: ≤ 6.0 cm
#define BPM_GOOD_MIN        100     // BPM ดี: 100–120 (AHA)
#define BPM_GOOD_MAX        120

// Scale factor — ปรับหลัง calibrate กับ load cell จริง
// HX711 full-bridge 4 ตัว: raw / SCALE_FACTOR = kg
#define SCALE_FACTOR    420.0f

// MPU6050 AccZ peak detection
#define PEAK_THRESHOLD_MS2  3.5f    // m/s² เกิน baseline นี้ = เริ่มกด
#define BASELINE_SAMPLES    50      // samples สำหรับ baseline

// ==================== OBJECTS ====================
HX711 scale;
MPU6050 mpu(Wire);
Adafruit_SSD1306 oled(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);

// ==================== STATE ====================
struct CprData {
    float forceTotal;       // แรงกดรวม (N)
    float depth;            // ความลึก (cm) ประมาณ
    int   bpm;              // ครั้ง/นาที
    bool  positionOk;       // มือวางถูกตำแหน่ง
    String quality;         // "good" / "too_light" / "too_hard" / "too_fast" / "too_slow"
};

// MPU peak detection state
float   accZBaseline = 0;
bool    inCompression = false;
float   peakAccZ = 0;
unsigned long lastPeakTime = 0;
unsigned long compressionTimes[8];   // เก็บ timestamp 8 ครั้งล่าสุด
int     compressionHead = 0;
int     compressionCount = 0;

// Send interval
unsigned long lastSendTime = 0;
#define SEND_INTERVAL_MS    100     // ส่งทุก 100ms (10 Hz)

// ==================== SETUP ====================
void setup() {
    Serial.begin(115200);
    Wire.begin(21, 22);

    // LED Bar
    for (int i = 0; i < LED_COUNT; i++) {
        pinMode(LED_PINS[i], OUTPUT);
        digitalWrite(LED_PINS[i], LOW);
    }

    // HX711 — Load Cell 4 ตัว full-bridge
    scale.begin(HX_DOUT, HX_SCK);
    scale.set_scale(SCALE_FACTOR);
    scale.tare();

    // MPU6050
    byte mpuStatus = mpu.begin();
    mpu.calcOffsets(true, true);    // auto calibrate gyro + accel
    calibrateBaseline();

    // OLED
    if (oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
        showOled("CPR System", "Starting...", "", "");
    }

    // Startup JSON
    StaticJsonDocument<128> doc;
    doc["type"]    = "status";
    doc["ready"]   = true;
    doc["msg"]     = "ESP32 Ready";
    serializeJson(doc, Serial);
    Serial.println();
}

// Calibrate AccZ baseline (ค่าเฉลี่ยตอนอยู่นิ่ง)
void calibrateBaseline() {
    float sum = 0;
    for (int i = 0; i < BASELINE_SAMPLES; i++) {
        mpu.update();
        sum += mpu.getAccZ();
        delay(10);
    }
    accZBaseline = sum / BASELINE_SAMPLES;
}

// ==================== MAIN LOOP ====================
void loop() {
    mpu.update();
    updatePeakDetection();

    if (millis() - lastSendTime >= SEND_INTERVAL_MS) {
        lastSendTime = millis();

        CprData data = readAllSensors();
        updateLedBar(data);
        updateOled(data);
        sendJson(data);
    }
}

// ==================== READ SENSORS ====================
CprData readAllSensors() {
    CprData d;

    // --- FSR 406 ---
    int fsrRaw = analogRead(FSR_PIN);
    d.positionOk = (fsrRaw >= FSR_THRESHOLD);

    // --- HX711 Load Cell (full-bridge 4 ตัว) ---
    float kg = scale.is_ready() ? scale.get_units(1) : 0.0f;
    if (kg < 0) kg = 0;

    // แปลง kg → N (×9.81)
    d.forceTotal = kg * 9.81f;

    // --- MPU6050 Depth (estimate จาก peak magnitude) ---
    d.depth = max(0.0f, (peakAccZ - accZBaseline) * 1.2f);
    d.depth = constrain(d.depth, 0.0f, 10.0f);

    // --- BPM ---
    d.bpm = calcBpm();

    // --- Quality Assessment ---
    d.quality = assessQuality(d);

    return d;
}

// ==================== PEAK DETECTION (MPU AccZ) ====================
void updatePeakDetection() {
    float accZ = mpu.getAccZ();
    float delta = accZ - accZBaseline;

    if (!inCompression && delta > PEAK_THRESHOLD_MS2) {
        // เริ่มการกด
        inCompression = true;
        peakAccZ = accZ;
    } else if (inCompression) {
        if (accZ > peakAccZ) peakAccZ = accZ;   // track peak

        if (delta < PEAK_THRESHOLD_MS2 * 0.3f) {
            // ปล่อยมือ — บันทึก compression
            unsigned long now = millis();
            compressionTimes[compressionHead % 8] = now;
            compressionHead++;
            compressionCount++;
            lastPeakTime = now;
            inCompression = false;
        }
    }
}

int calcBpm() {
    if (compressionCount < 2) return 0;

    // ใช้ 8 intervals ล่าสุด
    int n = min(compressionCount, 8);
    if (n < 2) return 0;

    unsigned long times[8];
    for (int i = 0; i < n; i++) {
        times[i] = compressionTimes[(compressionHead - n + i) % 8];
    }

    long totalInterval = 0;
    int intervals = 0;
    for (int i = 1; i < n; i++) {
        long diff = (long)(times[i] - times[i-1]);
        if (diff > 0 && diff < 3000) {
            totalInterval += diff;
            intervals++;
        }
    }

    if (intervals == 0) return 0;
    float avgInterval = (float)totalInterval / intervals;
    int bpm = (int)(60000.0f / avgInterval);
    return constrain(bpm, 0, 200);
}

// ==================== QUALITY ====================
String assessQuality(const CprData& d) {
    if (!d.positionOk)                        return "wrong_position";
    if (d.forceTotal < FORCE_GOOD_MIN)        return "too_light";
    if (d.forceTotal > FORCE_GOOD_MAX)        return "too_hard";
    if (d.bpm > 0 && d.bpm < BPM_GOOD_MIN)   return "too_slow";
    if (d.bpm > 0 && d.bpm > BPM_GOOD_MAX)   return "too_fast";
    return "good";
}

// ==================== LED BAR ====================
void updateLedBar(const CprData& d) {
    // จำนวน LED สว่าง = proportional กับแรงกด 0–80N → 0–8 LED
    int litCount = (int)map(constrain(d.forceTotal, 0, 80), 0, 80, 0, LED_COUNT);

    for (int i = 0; i < LED_COUNT; i++) {
        digitalWrite(LED_PINS[i], (i < litCount) ? HIGH : LOW);
    }
}

// ==================== OLED ====================
void showOled(String line1, String line2, String line3, String line4) {
    oled.clearDisplay();
    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);
    oled.setCursor(0,  0); oled.println(line1);
    oled.setCursor(0, 16); oled.println(line2);
    oled.setCursor(0, 32); oled.println(line3);
    oled.setCursor(0, 48); oled.println(line4);
    oled.display();
}

void updateOled(const CprData& d) {
    String l1 = d.positionOk ? "POS: OK" : "POS: WRONG!";
    String l2 = "F:" + String(d.forceTotal, 0) + "N  " + String(d.bpm) + "BPM";
    String l3 = "Depth: " + String(d.depth, 1) + " cm";
    String l4 = d.quality;
    showOled(l1, l2, l3, l4);
}

// ==================== SERIAL JSON OUTPUT ====================
void sendJson(const CprData& d) {
    StaticJsonDocument<200> doc;
    doc["type"]        = "data";
    doc["force"]       = round(d.forceTotal * 10) / 10.0;
    doc["depth"]       = round(d.depth      * 10) / 10.0;
    doc["bpm"]         = d.bpm;
    doc["position_ok"] = d.positionOk;
    doc["quality"]     = d.quality;

    serializeJson(doc, Serial);
    Serial.println();
}
