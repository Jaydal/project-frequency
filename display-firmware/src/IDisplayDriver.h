#pragma once
#include <Arduino.h>

struct LineRule {
  String type;      // "time_remaining"
  String op;        // "<", ">", "<=", ">=", "=="
  long value;       // Seconds threshold
  uint16_t color;
  String effect;
  bool activeColor;
  bool activeEffect;
  bool activeAlign;
  String align;
};

struct ZoneLineRender {
  String text;
  uint8_t r;
  uint8_t g;
  uint8_t b;
  String effect;
  String align;
  float scrollSpeed;
  uint8_t marginTop;
  uint8_t marginBottom;
  bool hasBgColor = false;
  uint8_t bgR = 0;
  uint8_t bgG = 0;
  uint8_t bgB = 0;
  String font;
  bool bold = false;
  uint8_t scaleX = 0;
  uint8_t scaleY = 0;
  uint8_t spacing = 1;
  LineRule rules[3];
  uint8_t ruleCount = 0;
};

struct BorderRange {
  uint8_t start;
  uint8_t end;
};

struct ZoneRenderInfo {
  uint8_t panelStart;
  uint8_t panelEnd;
  uint8_t lineCount;
  ZoneLineRender lines[2];
  uint8_t borderCount;
  BorderRange borderRanges[4];
  uint8_t scaleX;
  uint8_t scaleY;
  String valign;
};

class IDisplayDriver {
public:
  virtual void begin() = 0;
  virtual void clear() = 0;
  virtual void showRow(uint8_t row, const char* text) = 0;
  virtual void update() = 0;
  virtual void setBrightness(uint8_t b) {}
  virtual void setRotation(uint8_t r) {}
  virtual void setColorRGB(uint8_t r, uint8_t g, uint8_t b) {}
  virtual void setScrollSpeed(uint16_t msPerPixel) {}
  virtual void setAnimationMode(const char* mode) {}
  virtual void setTimer(unsigned long remainingMs, unsigned long totalMs, unsigned long baseMs) {}
  virtual void clearTimer() {}
  virtual void setZones(const ZoneRenderInfo* zones, uint8_t count) {}
  virtual void runDiagnosticSequence() {}
  virtual void playBootAnimation(unsigned long durationMs) {}
  virtual void setOtaActive(bool active) {}
  virtual void setConnecting(bool active) {}
  virtual void setPollCallback(void (*)()) {}
  virtual bool isAlive() { return false; }
  virtual ~IDisplayDriver() = default;
};
