#pragma once
#if defined(USE_HUB75) && defined(HD_WF2)

#include "IDisplayDriver.h"
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

class Hub75Driver : public IDisplayDriver {
public:
  Hub75Driver();
  void begin() override;
  void clear() override;
  void showRow(uint8_t row, const char* text) override;
  void update() override;
  void setBrightness(uint8_t b) override;
  void setRotation(uint8_t r) override;
  void setColorRGB(uint8_t r, uint8_t g, uint8_t b) override;
  void setScrollSpeed(uint16_t msPerPixel) override;
  void setAnimationMode(const char* mode) override;
  void setTimer(unsigned long remainingMs, unsigned long totalMs, unsigned long baseMs) {
    _timerRemainingAtBaseMs = remainingMs;
    _timerTotalMs = totalMs;
    _timerBaseMs = baseMs;
    _timerActive = true;
  }
  void clearTimer() { _timerActive = false; _timerRemainingAtBaseMs = 0; }
  void setZones(const ZoneRenderInfo* zones, uint8_t count) override;
  void runDiagnosticSequence() override;
  void playBootAnimation(unsigned long durationMs) override;
  void playBootTextAnimation(unsigned long durationMs);
  void showBrandLogo(unsigned long durationMs);
  void setOtaActive(bool active) override { _otaActive = active; if (active && _matrix) { _matrix->clearScreen(); _matrix->flipDMABuffer(); } }
  void setPollCallback(void (*cb)()) override { _pollCb = cb; }
  void setConnecting(bool active) override { _connecting = active; if (active) _connectingStart = millis(); }
  bool isAlive() override { return _matrix != nullptr; }

private:
  MatrixPanel_I2S_DMA* _matrix;
  uint16_t _defaultColor;
  uint16_t _scrollTickMs;
  String _animMode;

  static const int MAX_ZONES = 3;
  static const int MAX_LINES_PER_ZONE = 2;
  static const int MAX_BORDER_RANGES = 4;

  struct ZoneState {
    uint8_t panelStart;
    uint8_t panelEnd;
    uint8_t lineCount;
    struct LineState {
      String text;
      uint16_t color;
      String effect;
      String align;
      int scrollX;
      unsigned long scrollLastTick;
      float scrollSpeed;
      uint8_t marginTop;
      uint8_t marginBottom;
      bool hasBgColor;
      uint8_t bgR;
      uint8_t bgG;
      uint8_t bgB;
      String font;
      bool bold;
      uint8_t scaleX;
      uint8_t scaleY;
      uint8_t spacing;
      LineRule rules[3];
      uint8_t ruleCount;
    } lines[MAX_LINES_PER_ZONE];
    bool hasData;
    uint8_t scaleX;
    uint8_t scaleY;
    String valign;
    uint8_t borderCount;
    BorderRange borderRanges[MAX_BORDER_RANGES];
  };

  ZoneState _zones[MAX_ZONES];
  int _zoneCount;

  // Fallback single-line state (when showRow is used directly)
  String _fallbackText;
  int _fallbackScrollX;
  unsigned long _fallbackScrollTick;



  // OTA safety — suppress DMA during firmware updates
  volatile bool _otaActive = false;

  // Rotation
  uint8_t _rotation = 0;

  // Timer countdown
  unsigned long _timerRemainingAtBaseMs = 0;
  unsigned long _timerTotalMs = 0;
  unsigned long _timerBaseMs = 0;
  unsigned long _lastTimerRedraw = 0;
  bool _timerActive = false;

  bool _connecting = false;
  unsigned long _connectingStart = 0;

  // Optional per-frame hook for blocking sequences (e.g. boot animation)
  // so the app can still poll inputs like the factory-reset button.
  void (*_pollCb)() = nullptr;

  String substituteTimer(const String& text) const;
  static bool zonesEqual(const ZoneState& dst, const ZoneRenderInfo& src, MatrixPanel_I2S_DMA* matrix);
  void redraw();
  void drawText5x7Scaled(const char* s, int x, int y, uint16_t color, int scaleX, int scaleY, int spacing, int clipXStart, int clipXEnd, uint8_t borderCount, const BorderRange* borderRanges, bool bold);
  int  textWidth5x7Scaled(const char* s, int scaleX, int spacing, bool bold);
  int textWidthDigitalScaled(const char* s, int scaleX, int spacing, bool bold);
  void drawTextDigitalScaled(const char* s, int x, int y, uint16_t color, int scaleX, int scaleY, int spacing, int clipXStart, int clipXEnd, uint8_t borderCount, const BorderRange* borderRanges, bool bold);
  void drawPixelMapped(int x, int y, uint16_t color);
};

#endif
