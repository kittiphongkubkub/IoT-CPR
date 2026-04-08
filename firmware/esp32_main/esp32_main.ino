#include "Wire.h"
#include <HX711.h>
#include <INA226_WE.h>
#include <MPU6050_light.h>
#include <U8g2lib.h>
#include <math.h>
#include <ArduinoJson.h>

// ===============================
// PIN & ADDRESS SETTINGS
// ===============================
#define HX_DOUT 18
#define HX_SCK 19
#define fsrPin 34
#define LED_PIN1 32
#define LED_PIN2 33
#define I2C_ADDRESS_INA 0x40

// ใช้สำหรับ OLED SH1106 128x64 I2C
U8G2_SH1106_128X64_NONAME_F_HW_I2C display(U8G2_R0, /* reset=*/U8X8_PIN_NONE);

HX711 scale;
MPU6050 mpu(Wire);
INA226_WE ina226 = INA226_WE(I2C_ADDRESS_INA);

int fsrValue;
int fsrPeak = 0;
int fsrFiltered = 0;
const float FSR_ALPHA = 0.5;

unsigned long mpuTimer = 0;

// ===============================
// CALIBRATION
// ===============================
const float COUNTS_PER_KG = 21900.0f;

// ===============================
// CPR SETTINGS
// ===============================
const float PRESS_START_KG = 2.0f;
const float GOOD_FORCE_MIN = 10.0f;
const float GOOD_FORCE_MAX = 20.0f;
const float RELEASE_OK_KG = 1.5f;

const float GOOD_BPM_MIN = 100.0f;
const float GOOD_BPM_MAX = 120.0f;

const int FSR_THRESHOLD = 50;

// ===============================
const float FILTER_ALPHA = 0.60f;
const float AUTOZERO_KG = 1.5f;
const float ZERO_DEADBAND_KG = 0.15f;

const unsigned long MIN_PRESS_INTERVAL_MS = 250;
const unsigned long LOOP_DELAY_MS = 10;

// ===============================
long offsetValue = 0;
float filteredKg = 0;
bool filterInit = false;

bool isPressing = false;
unsigned long pressCount = 0;
unsigned long lastPressStartMs = 0;
float currentBPM = 0;

float currentPeakKg = 0;
bool recoilGood = false;

// Battery (global — อัปเดตใน mpuTimer, ใช้ใน sendCompressionJson)
float g_batt_v   = 0;
float g_batt_pct = 0;

// ===== MPU DEPTH CALC =====
float velocity = 0;
float depth = 0;
float peakDepth = 0;

unsigned long lastMPUTime = 0;
// ===============================
bool waitReady(uint32_t timeout = 60) {
  uint32_t start = millis();
  while (!scale.is_ready()) {
    if (millis() - start > timeout)
      return false;
    delay(1);
  }
  return true;
}

long readRaw() {
  if (waitReady())
    return scale.read();
  return 0;
}

void tareScale() {
  Serial.println("Taring...");
  delay(1200);
  long sum = 0;
  int count = 0;
  for (int i = 0; i < 20; i++) {
    if (waitReady()) {
      sum += scale.read();
      count++;
    }
    delay(5);
  }
  offsetValue = sum / count;
  Serial.print("OFFSET=");
  Serial.println(offsetValue);
}

float netToKg(long net) { return fabs((float)net) / COUNTS_PER_KG; }

const char *forceStatus(float kg) {
  if (kg < PRESS_START_KG)
    return "IDLE";
  if (kg < GOOD_FORCE_MIN)
    return "TOO LIGHT";
  if (kg <= GOOD_FORCE_MAX)
    return "GOOD";
  return "TOO HARD";
}

const char *rateStatus(float bpm) {
  if (bpm <= 0)
    return "WAIT";
  if (bpm < GOOD_BPM_MIN)
    return "TOO SLOW";
  if (bpm > GOOD_BPM_MAX)
    return "TOO FAST";
  return "GOOD RATE";
}

const char *rateStatusFSR(float fsrPeak) {
  if (fsrPeak <= 0)
    return "BAD";
  if (fsrPeak < 400)
    return "GOOD";
  return "VERY GOOD";
}

// ===============================
// JSON OUTPUT FUNCTIONS
// ===============================

// ส่งข้อมูล live ทุก 100ms (สำหรับ live.html real-time cards)
void sendLiveJson(float forceLive, int fsrLive, float batt_v, float batt_pct) {
    StaticJsonDocument<200> doc;
    doc["type"]     = "live";
    doc["force"]    = round(forceLive * 10) / 10.0;
    doc["fsr"]      = fsrLive;
    doc["batt_v"]   = round(batt_v * 100) / 100.0;
    doc["batt_pct"] = (int)batt_pct;
    serializeJson(doc, Serial);
    Serial.println();
}

// ส่งข้อมูลทุกครั้งที่กดเสร็จ (สำหรับ live.html event + training.js)
void sendCompressionJson(unsigned long id, float peakKg, float bpm,
                         bool recoil, int fsr, float depth_cm,
                         const char* quality) {
    StaticJsonDocument<300> doc;
    doc["type"]       = "compression";
    doc["id"]         = id;
    doc["force"]      = round(peakKg  * 10) / 10.0;
    doc["depth"]      = round(depth_cm * 10) / 10.0;
    doc["bpm"]        = round(bpm     * 10) / 10.0;
    doc["recoil"]     = recoil;
    doc["fsr"]        = fsr;
    doc["quality"]    = quality;
    doc["batt_v"]     = round(g_batt_v   * 100) / 100.0;
    doc["batt_pct"]   = (int)g_batt_pct;
    serializeJson(doc, Serial);
    Serial.println();
}

// ===============================
void printCompression(unsigned long id, float peakKg, float bpm, bool recoil,
                      int fsrPeak, float depth_cm) {
  Serial.print("#");
  Serial.print(id);
  Serial.print(" Force: ");
  Serial.print(peakKg, 1);
  Serial.print(" kg");
  Serial.print("\t | ");
  Serial.print(forceStatus(peakKg));
  Serial.print("\t | BPM: ");
  Serial.print(bpm, 1);
  Serial.print("\t | ");
  Serial.print(rateStatus(bpm));
  Serial.print("\t | Recoil: ");
  Serial.print(recoil ? "GOOD" : "BAD");
  Serial.print("\t | FSR: ");
  Serial.print(fsrPeak);
  Serial.print("\t | ");
  Serial.print(rateStatusFSR(fsrPeak));
  Serial.print("\t | Depth: ");
  Serial.print(depth_cm, 1);
  Serial.print(" cm");
  if (depth_cm >= 5 && depth_cm <= 6) {
    Serial.println(" | GOOD");
  } else {
    Serial.println(" | BAD");
  }

  // JSON line (→ server.js → WebSocket → live.html / training.html)
  sendCompressionJson(id, peakKg, bpm, recoil, fsrPeak, depth_cm, forceStatus(peakKg));
}

// ===============================
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);

  display.begin(); // OLED
  pinMode(LED_PIN1, OUTPUT);
  pinMode(LED_PIN2, OUTPUT);

  scale.begin(HX_DOUT, HX_SCK);
  while (!scale.is_ready()) {
    Serial.print(".");
    delay(100);
  }
  Serial.println("HX711 ready");
  tareScale();

  byte status = mpu.begin();
  if (status != 0) {
    while (1) {
      Serial.println("MPU NOT CONNECTED!!");
      delay(1000);
    }
  }
  mpu.calcOffsets();

  if (!ina226.init()) {
    Serial.println("INA226 NOT CONNECTED!!");
  } else {
    ina226.waitUntilConversionCompleted();
  }

  lastMPUTime = millis();

  // Startup JSON
  StaticJsonDocument<128> doc;
  doc["type"]  = "status";
  doc["ready"] = true;
  doc["msg"]   = "ESP32 Ready";
  serializeJson(doc, Serial);
  Serial.println();
}

// ===============================
void loop() {
  mpu.update();

  // ===== CALCULATE DEPTH FROM MPU =====
  unsigned long nowTime = millis();
  float dt = (nowTime - lastMPUTime) / 1000.0; // sec
  lastMPUTime = nowTime;

  // อ่านค่า Z (ขึ้น-ลง)
  float accZ = mpu.getAccZ() - 1.0; // ลบ gravity
  float accZ_ms2 = accZ * 9.81;

  // กรอง noise
  if (abs(accZ_ms2) < 0.2)
    accZ_ms2 = 0;

  // อินทิเกรต
  velocity += accZ_ms2 * dt;
  depth += velocity * dt;

  // ไม่ให้ติดลบ
  if (depth < 0)
    depth = 0;

  // เก็บค่าลึกสุด
  if (depth > peakDepth) {
    peakDepth = depth;
  }

  /*
  Serial.println(depth * 100);
  depth = 0;
  */

  int rawFSR = analogRead(fsrPin);
  fsrFiltered = FSR_ALPHA * rawFSR + (1.0 - FSR_ALPHA) * fsrFiltered;
  fsrValue = fsrFiltered;

  long raw = readRaw();
  if (raw == 0)
    return;

  long net = raw - offsetValue;
  float kg = netToKg(net);

  if (kg < AUTOZERO_KG) {
    offsetValue = offsetValue * 0.998 + raw * 0.002;
  }

  if (!filterInit) {
    filteredKg = kg;
    filterInit = true;
  } else {
    filteredKg = FILTER_ALPHA * kg + (1.0 - FILTER_ALPHA) * filteredKg;
  }

  float displayKg = filteredKg;
  if (displayKg < ZERO_DEADBAND_KG)
    displayKg = 0;

  bool fsrPressed = fsrValue > FSR_THRESHOLD;
  bool nowPressing = (displayKg >= PRESS_START_KG) && fsrPressed;

  // ================= OLED & SERIAL PRINT (ทุก 100ms) =================
  if ((millis() - mpuTimer) > 100) {
    float vBatt = ina226.getBusVoltage_V();
    float curmA = ina226.getCurrent_mA();

    // คำนวณ % แบตเตอรี่คร่าวๆ (อ้างอิง 3.3V - 4.2V สำหรับ 1 Cell)
    // หากใช้แบต 2 ก้อน (7.4V) ให้เปลี่ยน 3.3 เป็น 6.6 และ 4.2 เป็น 8.4
    float battPercentage = ((vBatt - 6.6) / (8.4 - 6.6)) * 100.0;
    if (battPercentage > 100)
      battPercentage = 100;
    if (battPercentage < 0)
      battPercentage = 0;

    // --- แสดงผลบนหน้าจอ OLED ---
    display.clearBuffer();
    display.setFont(u8g2_font_ncenB08_tr);
    display.drawStr(15, 12, "CPR TRAINER STATUS");

    display.setCursor(0, 30);
    display.print("Batt: ");
    display.print(vBatt, 2);
    display.print("V (");
    display.print((int)battPercentage);
    display.print("%)");

    /*
    display.setCursor(0, 45);
    display.print("Current: "); display.print(curmA, 1); display.print(" mA");
    */

    display.setCursor(0, 62);
    display.print("FSR: ");
    display.print(fsrValue);

    /*
    display.print("  KG: "); display.print(displayKg, 1);
    */

    display.sendBuffer();

    g_batt_v = vBatt;
    g_batt_pct = battPercentage;
    sendLiveJson(displayKg, fsrValue, vBatt, battPercentage);

    // --- Serial Print ---
    /*
    Serial.print("V: "); Serial.print(vBatt);
    Serial.print("\tI: "); Serial.print(curmA);
    Serial.print("\tFSR: "); Serial.println(fsrValue);
    */

    mpuTimer = millis();
  }

  // ================= ORIGINAL LOGIC =================
  if (nowPressing && !isPressing) {
    unsigned long now = millis();
    if (lastPressStartMs > 0) {
      unsigned long dt = now - lastPressStartMs;
      if (dt >= MIN_PRESS_INTERVAL_MS)
        currentBPM = 60000.0 / dt;
    }
    lastPressStartMs = now;
    pressCount++;
    currentPeakKg = displayKg;

    digitalWrite(LED_PIN2, LOW);
    digitalWrite(LED_PIN1, HIGH);
  }

  if (nowPressing) {
    if (displayKg > currentPeakKg)
      currentPeakKg = displayKg;
    if (fsrValue > fsrPeak)
      fsrPeak = fsrValue;
  }

  if (!nowPressing && isPressing) {
    recoilGood = displayKg <= RELEASE_OK_KG;

    float depth_cm = peakDepth * 100.0; // DEPTH RESULT

    printCompression(pressCount, currentPeakKg, currentBPM, recoilGood, fsrPeak,
                     depth_cm);
    fsrPeak = 0;

    // reset depth
    velocity = 0;
    depth = 0;
    peakDepth = 0;

    digitalWrite(LED_PIN1, LOW);

    digitalWrite(LED_PIN2, HIGH);
    // delay(80);
  }

  isPressing = nowPressing;
  delay(LOOP_DELAY_MS);
}