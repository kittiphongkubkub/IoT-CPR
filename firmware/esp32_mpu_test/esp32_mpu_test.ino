#include "Wire.h"
#include <MPU6050_light.h>

MPU6050 mpu(Wire);

unsigned long timer = 0;

int fsrPin = 34;
int fsrValue;

void setup() {

  Serial.begin(115200);
  Wire.begin(21, 22);

  byte status = mpu.begin();
  Serial.println(status);

  while (status != 0) {
    Serial.println("MPU NOT CONNECTED");
    delay(1000);
  }

  delay(1000);
  mpu.calcOffsets();
}

void loop() {

  mpu.update();

  if ((millis() - timer) > 50) {

    fsrValue = analogRead(fsrPin);

    float az = mpu.getAccZ();

    Serial.print("{");
    Serial.print("\"fsr\":");
    Serial.print(fsrValue);
    Serial.print(",");

    Serial.print("\"az\":");
    Serial.print(az * 100);

    Serial.println("}");

    timer = millis();
  }
}
