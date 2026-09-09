#if defined(USE_HUB75) && defined(HD_WF2)
#include "Hub75Driver.h"

static constexpr HUB75_I2S_CFG::i2s_pins WF2_PINS = {
  .r1 =  2, .g1 =  6, .b1 = 10,
  .r2 =  3, .g2 =  7, .b2 = 11,
  .a  = 39, .b  = 38, .c  = 37, .d  = 36, .e  = 21,
  .lat = 33, .oe  = 35, .clk = 34
};

#define WF2_PANEL_W  32
#define WF2_PANEL_H  16
#define WF2_CHAIN    3
#define WF2_RES_X    (WF2_PANEL_W * WF2_CHAIN)
#define WF2_RES_Y    WF2_PANEL_H

#define SCROLL_WRAP_PAD 24

static const uint8_t FONT5x7[][7] = {
  {0b01110,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001},
  {0b11110,0b10001,0b10001,0b11110,0b10001,0b10001,0b11110},
  {0b01110,0b10001,0b10000,0b10000,0b10000,0b10001,0b01110},
  {0b11110,0b10001,0b10001,0b10001,0b10001,0b10001,0b11110},
  {0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b11111},
  {0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b10000},
  {0b01110,0b10001,0b10000,0b10111,0b10001,0b10001,0b01110},
  {0b10001,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001},
  {0b01110,0b00100,0b00100,0b00100,0b00100,0b00100,0b01110},
  {0b00111,0b00010,0b00010,0b00010,0b00010,0b10010,0b01100},
  {0b10001,0b10010,0b10100,0b11000,0b10100,0b10010,0b10001},
  {0b10000,0b10000,0b10000,0b10000,0b10000,0b10000,0b11111},
  {0b10001,0b11011,0b10101,0b10101,0b10001,0b10001,0b10001},
  {0b10001,0b10001,0b11001,0b10101,0b10011,0b10001,0b10001},
  {0b01110,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110},
  {0b11110,0b10001,0b10001,0b11110,0b10000,0b10000,0b10000},
  {0b01110,0b10001,0b10000,0b10000,0b10000,0b10001,0b01110},
  {0b11110,0b10001,0b10001,0b11110,0b10100,0b10010,0b10001},
  {0b01110,0b10001,0b10000,0b01110,0b00001,0b10001,0b01110},
  {0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100},
  {0b10001,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110},
  {0b10001,0b10001,0b10001,0b10001,0b10001,0b01010,0b00100},
  {0b10001,0b10001,0b10001,0b10101,0b10101,0b11011,0b10001},
  {0b10001,0b10001,0b01010,0b00100,0b01010,0b10001,0b10001},
  {0b10001,0b10001,0b01010,0b00100,0b00100,0b00100,0b00100},
  {0b11111,0b00001,0b00010,0b00100,0b01000,0b10000,0b11111},
  {0b01110,0b10001,0b10011,0b10101,0b11001,0b10001,0b01110},
  {0b00100,0b01100,0b00100,0b00100,0b00100,0b00100,0b01110},
  {0b01110,0b10001,0b00001,0b00010,0b00100,0b01000,0b11111},
  {0b01110,0b10001,0b00001,0b00110,0b00001,0b10001,0b01110},
  {0b00010,0b00110,0b01010,0b10010,0b11111,0b00010,0b00010},
  {0b11111,0b10000,0b11110,0b00001,0b00001,0b10001,0b01110},
  {0b01110,0b10000,0b10000,0b11110,0b10001,0b10001,0b01110},
  {0b11111,0b00001,0b00010,0b00100,0b01000,0b01000,0b01000},
  {0b01110,0b10001,0b10001,0b01110,0b10001,0b10001,0b01110},
  {0b01110,0b10001,0b10001,0b01111,0b00001,0b00001,0b01110},
  {0b00000,0b00000,0b00000,0b00000,0b00000,0b00000,0b00000},
  {0b00000,0b00000,0b00000,0b11111,0b00000,0b00000,0b00000},
  {0b00000,0b00000,0b00000,0b00000,0b00000,0b00000,0b00100},
  {0b00000,0b00100,0b00000,0b00000,0b00000,0b00100,0b00000},
  {0b00001,0b00010,0b00010,0b00100,0b01000,0b01000,0b10000},
  {0b00000,0b00000,0b00000,0b00000,0b00000,0b00000,0b00000},
};

#define CHAR_W    5
#define CHAR_H    7
#define SPACING   1
#define CELL_W    (CHAR_W + SPACING)
#define FONT_SIZE (sizeof(FONT5x7) / sizeof(FONT5x7[0]))

static const uint8_t FONT_DIGITAL_5x7[][7] = {
  {0x1F, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1F}, // 0
  {0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01}, // 1
  {0x1F, 0x01, 0x01, 0x1F, 0x10, 0x10, 0x1F}, // 2
  {0x1F, 0x01, 0x01, 0x1F, 0x01, 0x01, 0x1F}, // 3
  {0x11, 0x11, 0x11, 0x1F, 0x01, 0x01, 0x01}, // 4
  {0x1F, 0x10, 0x10, 0x1F, 0x01, 0x01, 0x1F}, // 5
  {0x1F, 0x10, 0x10, 0x1F, 0x11, 0x11, 0x1F}, // 6
  {0x1F, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01}, // 7
  {0x1F, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x1F}, // 8
  {0x1F, 0x11, 0x11, 0x1F, 0x01, 0x01, 0x1F}, // 9
  {0x00, 0x18, 0x18, 0x00, 0x18, 0x18, 0x00}, // : (3-wide: dots in cols 0-1, col 2 empty for gap)
  {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}, // (space)
  {0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00}, // -
};

static int glyphDigitalIndex(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c == ':') return 10;
  if (c == ' ') return 11;
  if (c == '-') return 12;
  return 11; // map unknown to space
}

static int glyphIndex(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a';
  if (c >= '0' && c <= '9') return 26 + (c - '0');
  if (c == ' ')  return 36;
  if (c == '-')  return 37;
  if (c == '.')  return 38;
  if (c == ':')  return 39;
  if (c == '/')  return 40;
  if (c == (char)0xA0) return 41;
  return -1;
}

static bool isBorderRow(int y, uint8_t borderCount, const BorderRange* borderRanges) {
  if (borderCount > 4) borderCount = 4;
  for (uint8_t i = 0; i < borderCount; i++) {
    if (y >= borderRanges[i].start && y <= borderRanges[i].end) return true;
  }
  return false;
}

Hub75Driver::Hub75Driver()
  : _matrix(nullptr), _defaultColor(0xF800), _scrollTickMs(45), _animMode("scroll"),
    _zoneCount(0), _fallbackScrollX(0), _fallbackScrollTick(0)
{
  for (int i = 0; i < MAX_ZONES; i++) {
    _zones[i].hasData = false;
    _zones[i].scaleX = 0;
    _zones[i].scaleY = 0;
    _zones[i].valign = "";
    _zones[i].borderCount = 0;
  }
}

void Hub75Driver::begin() {
  HUB75_I2S_CFG cfg(WF2_PANEL_W, WF2_PANEL_H, WF2_CHAIN, WF2_PINS);
  cfg.i2sspeed       = HUB75_I2S_CFG::HZ_10M;
  cfg.latch_blanking = 4;
  cfg.double_buff    = true;
  _matrix = new MatrixPanel_I2S_DMA(cfg);

  for (int attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      delay(300);
      delete _matrix;
      _matrix = new MatrixPanel_I2S_DMA(cfg);
    }
    bool ok = _matrix->begin();
    log_i("[HUB75/WF2] begin attempt %d: %s  geometry=%dx%d chain=%d",
                  attempt + 1, ok ? "OK" : "FAILED", WF2_PANEL_W, WF2_PANEL_H, WF2_CHAIN);
    if (ok) {
      _matrix->setBrightness8(153);
      uint16_t green = _matrix->color565(0, 255, 0);
      _matrix->fillScreen(green);
      _matrix->flipDMABuffer();
      delay(500);
      redraw();
      return;
    }
  }

  log_e("[HUB75/WF2] FATAL: Matrix init failed after 3 attempts");
  delete _matrix;
  _matrix = nullptr;
}

void Hub75Driver::clear() {
  _zoneCount = 0;
  for (int i = 0; i < MAX_ZONES; i++) _zones[i].hasData = false;
  _fallbackText = "";
  _fallbackScrollX = 0;
  if (_matrix) {
    _matrix->clearScreen();
    _matrix->flipDMABuffer();
  }
}

void Hub75Driver::showRow(uint8_t row, const char* text) {
  if (row != 0 || !_matrix) return;

  // Build a temporary single zone from the text
  _fallbackText = text;
  int w = textWidth5x7Scaled(text, 2, 1, false);
  _fallbackScrollX = (w > WF2_RES_X) ? WF2_RES_X : 0;
  _fallbackScrollTick = millis();

  // Show as single zone covering all panels
  ZoneState& z = _zones[0];
  z.panelStart = 0;
  z.panelEnd = 2;
  z.lineCount = 1;
  z.hasData = true;
  z.borderCount = 0;
  z.scaleX = 0;
  z.scaleY = 0;
  z.valign = "middle";
  z.lines[0].text = text;
  z.lines[0].color = _defaultColor;
  z.lines[0].effect = (_animMode == "scroll") ? "SCROLL" : _animMode;
  z.lines[0].align = "center";
  z.lines[0].bold = false;
  z.lines[0].scrollX = (w > WF2_RES_X) ? WF2_RES_X : 0;
  z.lines[0].scrollLastTick = millis();
  z.lines[0].scrollSpeed = 1;
  z.lines[0].marginTop = 0;
  z.lines[0].marginBottom = 2;
  _zoneCount = 1;

  redraw();
}

void Hub75Driver::setBrightness(uint8_t b) {
  if (_matrix) _matrix->setBrightness8(b);
}

void Hub75Driver::setRotation(uint8_t r) {
  _rotation = r;
  if (_matrix) _matrix->setRotation(r);
}

void Hub75Driver::setColorRGB(uint8_t r, uint8_t g, uint8_t b) {
  if (_matrix) {
    _defaultColor = _matrix->color565(r, g, b);
  }
}

void Hub75Driver::setScrollSpeed(uint16_t msPerPixel) {
  _scrollTickMs = msPerPixel;
}

void Hub75Driver::setAnimationMode(const char* mode) {
  _animMode = String(mode);
}

bool Hub75Driver::zonesEqual(const ZoneState& dst, const ZoneRenderInfo& src, MatrixPanel_I2S_DMA* matrix) {
  if (dst.panelStart != src.panelStart || dst.panelEnd != src.panelEnd) return false;
  if (dst.lineCount != src.lineCount) return false;
  if (dst.borderCount != src.borderCount) return false;
  for (uint8_t bi = 0; bi < src.borderCount && bi < 4; bi++) {
    if (dst.borderRanges[bi].start != src.borderRanges[bi].start ||
        dst.borderRanges[bi].end != src.borderRanges[bi].end) return false;
  }
  if (dst.scaleX != src.scaleX || dst.scaleY != src.scaleY) return false;
  if (dst.valign != src.valign) return false;
  for (int li = 0; li < src.lineCount && li < 2; li++) {
    const auto& a = dst.lines[li];
    const auto& b = src.lines[li];
    uint16_t color = matrix ? matrix->color565(b.r, b.g, b.b) : 0;
    if (a.color != color) return false;
    if (a.text != b.text || a.effect != b.effect || a.align != b.align) return false;
    if (a.scrollSpeed != b.scrollSpeed) return false;
    if (a.marginTop != b.marginTop || a.marginBottom != b.marginBottom) return false;
    if (a.hasBgColor != b.hasBgColor || a.bgR != b.bgR || a.bgG != b.bgG || a.bgB != b.bgB) return false;
    if (a.font != b.font || a.bold != b.bold) return false;
    if (a.scaleX != b.scaleX || a.scaleY != b.scaleY || a.spacing != b.spacing) return false;
    if (a.ruleCount != b.ruleCount) return false;
  }
  return true;
}

void Hub75Driver::setZones(const ZoneRenderInfo* zones, uint8_t count) {
  if (count > MAX_ZONES) count = MAX_ZONES;

  // Identical snapshots (e.g. periodic retained publishes) need no work:
  // skip the String copies and keep existing scroll positions.
  if (count == _zoneCount) {
    bool same = true;
    for (int zi = 0; zi < count && same; zi++) {
      if (!_zones[zi].hasData || !zonesEqual(_zones[zi], zones[zi], _matrix)) same = false;
    }
    if (same) return;
  }

  _zoneCount = count;

  for (int zi = 0; zi < count; zi++) {
    ZoneState& dst = _zones[zi];
    const ZoneRenderInfo& src = zones[zi];
    dst.panelStart = src.panelStart;
    dst.panelEnd = src.panelEnd;
    dst.lineCount = src.lineCount;
    dst.hasData = true;
    dst.borderCount = src.borderCount;
    for (uint8_t bi = 0; bi < src.borderCount && bi < MAX_BORDER_RANGES; bi++) {
      dst.borderRanges[bi] = src.borderRanges[bi];
    }
    dst.scaleX = src.scaleX;
    dst.scaleY = src.scaleY;
    dst.valign = src.valign;

    for (int li = 0; li < src.lineCount && li < MAX_LINES_PER_ZONE; li++) {
      dst.lines[li].text = src.lines[li].text;
      dst.lines[li].color = _matrix ? _matrix->color565(src.lines[li].r, src.lines[li].g, src.lines[li].b) : 0xF800;
      dst.lines[li].effect = src.lines[li].effect;
      dst.lines[li].align = src.lines[li].align;
      dst.lines[li].scrollSpeed = src.lines[li].scrollSpeed;
      dst.lines[li].marginTop = src.lines[li].marginTop;
      dst.lines[li].marginBottom = src.lines[li].marginBottom;
      dst.lines[li].hasBgColor = src.lines[li].hasBgColor;
      dst.lines[li].bgR = src.lines[li].bgR;
      dst.lines[li].bgG = src.lines[li].bgG;
      dst.lines[li].bgB = src.lines[li].bgB;
      dst.lines[li].font = src.lines[li].font;
      dst.lines[li].bold = src.lines[li].bold;
      dst.lines[li].scaleX = src.lines[li].scaleX;
      dst.lines[li].scaleY = src.lines[li].scaleY;
      dst.lines[li].spacing = src.lines[li].spacing;
      dst.lines[li].ruleCount = src.lines[li].ruleCount;
      for (int r = 0; r < src.lines[li].ruleCount; r++) {
        dst.lines[li].rules[r] = src.lines[li].rules[r];
      }

      // Substitute timer/elapsed vars so width is based on actual rendered text, not template
      int zoneW = (src.panelEnd - src.panelStart + 1) * WF2_PANEL_W;
      String measText = substituteTimer(src.lines[li].text);

      int s;
      if (dst.lines[li].scaleX > 0) {
        s = dst.lines[li].scaleX;
      } else if (dst.lines[li].scaleY > 0) {
        s = dst.lines[li].scaleY;
      } else if (dst.scaleX > 0) {
        s = dst.scaleX;
      } else if (dst.scaleY > 0) {
        s = dst.scaleY;
      } else if (src.lineCount == 2) {
        int tw2x = (src.lines[li].font == "digital") ? textWidthDigitalScaled(measText.c_str(), 2, src.lines[li].spacing, src.lines[li].bold) : textWidth5x7Scaled(measText.c_str(), 2, src.lines[li].spacing, src.lines[li].bold);
        s = (tw2x <= zoneW) ? 2 : 1;
      } else {
        s = 2;
      }
      int tw = (src.lines[li].font == "digital") ? textWidthDigitalScaled(measText.c_str(), s, src.lines[li].spacing, src.lines[li].bold) : textWidth5x7Scaled(measText.c_str(), s, src.lines[li].spacing, src.lines[li].bold);
      dst.lines[li].scrollX = (tw > zoneW && src.lines[li].effect == "SCROLL") ? zoneW : 0;
      dst.lines[li].scrollLastTick = millis();
    }
  }

  redraw();
}

void Hub75Driver::runDiagnosticSequence() {
  if (!_matrix) return;
  uint16_t red = _matrix->color565(255, 0, 0);
  uint16_t green = _matrix->color565(0, 255, 0);
  uint16_t blue = _matrix->color565(0, 0, 255);
  uint16_t white = _matrix->color565(255, 255, 255);
  _matrix->fillScreen(red);   delay(800);
  _matrix->fillScreen(green); delay(800);
  _matrix->fillScreen(blue);  delay(800);
  _matrix->fillScreen(white); delay(800);
  _matrix->clearScreen();
  for (int x = 0; x < WF2_RES_X; x++) {
    drawPixelMapped(x, 0, white);
    drawPixelMapped(x, WF2_RES_Y - 1, white);
  }
  for (int y = 0; y < WF2_RES_Y; y++) {
    drawPixelMapped(0, y, white);
    drawPixelMapped(WF2_RES_X - 1, y, white);
  }
  for (int i = 0; i < WF2_RES_Y; i++) {
    drawPixelMapped(i, i, red);
    drawPixelMapped(WF2_RES_X - 1 - i, i, blue);
  }
  delay(1500);
  redraw();
}

void Hub75Driver::update() {
  if (!_matrix || _otaActive) return;

  if (_connecting) {
    unsigned long elapsed = millis() - _connectingStart;
    float pulse = (sin(elapsed * 0.008f) + 1.0f) * 0.5f;
    uint8_t brightness = (uint8_t)(pulse * 255);
    uint16_t color = _matrix->color565(brightness, brightness, brightness);
    _matrix->clearScreen();
    _matrix->fillCircle(48, 8, 4, color);
    _matrix->flipDMABuffer();
    return;
  }


  bool needsRedraw = false;
  unsigned long now = millis();

  // Per-zone per-line scroll update
  for (int zi = 0; zi < _zoneCount; zi++) {
    ZoneState& z = _zones[zi];
    if (!z.hasData) continue;
    int zoneW = (z.panelEnd - z.panelStart + 1) * WF2_PANEL_W;

    for (int li = 0; li < z.lineCount; li++) {
      auto& line = z.lines[li];
      if (line.text.length() == 0) continue;
      int scale = line.scaleX > 0 ? line.scaleX : 
                  (line.scaleY > 0 ? line.scaleY :
                  (z.scaleX > 0 ? z.scaleX : 
                  (z.scaleY > 0 ? z.scaleY : 
                  ((z.lineCount == 2) ? 1 : 2))));

      // C2 fix: evaluate rules to decide effective scroll — using bool flags
      // to avoid heap-fragmenting String allocations in this high-frequency loop.
      bool effectiveScroll = (line.effect == "SCROLL");
      if (_timerActive && line.ruleCount > 0) {
        long remainingMs = (long)_timerRemainingAtBaseMs - (long)(now - _timerBaseMs);
        if (remainingMs < 0) remainingMs = 0;
        long remainingSec = remainingMs / 1000;
        for (int r = 0; r < line.ruleCount; r++) {
          bool match = false;
          if (line.rules[r].type == "time_remaining") {
            if (line.rules[r].op == "<" && remainingSec < line.rules[r].value) match = true;
            if (line.rules[r].op == ">" && remainingSec > line.rules[r].value) match = true;
            if (line.rules[r].op == "<=" && remainingSec <= line.rules[r].value) match = true;
            if (line.rules[r].op == ">=" && remainingSec >= line.rules[r].value) match = true;
            if (line.rules[r].op == "==" && remainingSec == line.rules[r].value) match = true;
          }
          if (line.rules[r].type == "time_remaining_min") {
            long remainingMin = remainingSec / 60;
            if (line.rules[r].op == "<" && remainingMin < line.rules[r].value) match = true;
            if (line.rules[r].op == ">" && remainingMin > line.rules[r].value) match = true;
            if (line.rules[r].op == "<=" && remainingMin <= line.rules[r].value) match = true;
            if (line.rules[r].op == ">=" && remainingMin >= line.rules[r].value) match = true;
            if (line.rules[r].op == "==" && remainingMin == line.rules[r].value) match = true;
          }
          if (line.rules[r].type == "time_remaining_pct" && _timerTotalMs > 0) {
            float pct = (float)remainingMs / (float)_timerTotalMs * 100.0f;
            if (line.rules[r].op == "<" && pct < line.rules[r].value) match = true;
            if (line.rules[r].op == ">" && pct > line.rules[r].value) match = true;
            if (line.rules[r].op == "<=" && pct <= line.rules[r].value) match = true;
            if (line.rules[r].op == ">=" && pct >= line.rules[r].value) match = true;
            if (line.rules[r].op == "==" && pct == line.rules[r].value) match = true;
          }
          if (match && line.rules[r].activeEffect) {
            // A rule overrides the effect — check if it changes scroll behaviour
            effectiveScroll = (line.rules[r].effect == "SCROLL");
          }
        }
      }

      if (effectiveScroll) {
        String displayText = substituteTimer(line.text);
        int tw = (line.font == "digital") ? textWidthDigitalScaled(displayText.c_str(), scale, line.spacing, line.bold) : textWidth5x7Scaled(displayText.c_str(), scale, line.spacing, line.bold);
        if (tw <= zoneW) continue;
        float speed = line.scrollSpeed > 0.0f ? line.scrollSpeed : 1.0f;
        if (now - line.scrollLastTick >= (unsigned long)(_scrollTickMs / speed)) {
          line.scrollLastTick = now;
          line.scrollX -= 1;
          if (line.scrollX + tw <= 0) line.scrollX = zoneW + SCROLL_WRAP_PAD;
          needsRedraw = true;
        }
        // When rule suppresses scroll: leave scrollX unchanged so it resumes
        // from the same position when the condition clears.
      }
    }
  }

  // Timer update — also needed when rules are active (for blink timing)
  if (_timerActive && now - _lastTimerRedraw >= 500) {
    _lastTimerRedraw = now;
    needsRedraw = true;
  }

  if (needsRedraw) redraw();
}

String Hub75Driver::substituteTimer(const String& text) const {
  // M1 fix: use _timerActive flag so remainingMs=0 still formats as "0:00"
  // With no active timer there is nothing to substitute, so strip the
  // tokens instead of rendering them literally.
  if (!_timerActive) {
    String result = text;
    result.replace("{timer}", "");
    result.replace("{elapsed}", "");
    return result;
  }
  unsigned long now = millis();
  long remainingMs = (long)_timerRemainingAtBaseMs - (long)(now - _timerBaseMs);
  if (remainingMs < 0) remainingMs = 0;
  String result = text;
  if (result.indexOf("{timer}") >= 0) {
    int totalSec = (int)(remainingMs / 1000);
    int min = totalSec / 60;
    int sec = totalSec % 60;
    char buf[8];
    snprintf(buf, sizeof(buf), "%d:%02d", min, sec);
    result.replace("{timer}", buf);
  }
  if (result.indexOf("{elapsed}") >= 0) {
    long elapsedMs = (long)_timerTotalMs - remainingMs;
    if (elapsedMs < 0) elapsedMs = 0;
    int totalSec = (int)(elapsedMs / 1000);
    int min = totalSec / 60;
    int sec = totalSec % 60;
    char buf[8];
    snprintf(buf, sizeof(buf), "%d:%02d", min, sec);
    result.replace("{elapsed}", buf);
  }
  return result;
}

void Hub75Driver::redraw() {
  if (!_matrix || _otaActive) return;



  _matrix->clearScreen();

  for (int zi = 0; zi < _zoneCount; zi++) {
    ZoneState& z = _zones[zi];
    if (!z.hasData) continue;

    int zoneX = z.panelStart * WF2_PANEL_W;
    int zoneW = (z.panelEnd - z.panelStart + 1) * WF2_PANEL_W;
    int zoneXEnd = zoneX + zoneW;

    // Compute available vertical range (excluding border rows)
    int availTop = 0;
    int availBottom = WF2_RES_Y - 1;
    if (z.borderCount > 0) {
      for (int y = 0; y < WF2_RES_Y; y++) {
        if (!isBorderRow(y, z.borderCount, z.borderRanges)) { availTop = y; break; }
      }
      for (int y = WF2_RES_Y - 1; y >= 0; y--) {
        if (!isBorderRow(y, z.borderCount, z.borderRanges)) { availBottom = y; break; }
      }
    }
    int availH = availBottom - availTop + 1;

    // Compute scale per line
    int scaleXs[MAX_LINES_PER_ZONE];
    int scaleYs[MAX_LINES_PER_ZONE];
    int totalTextH = 0;
    for (int li = 0; li < z.lineCount; li++) {
      auto& ln = z.lines[li];
      if (z.scaleX > 0 && z.scaleY > 0) {
        scaleXs[li] = z.scaleX;
        scaleYs[li] = z.scaleY;
      } else if (z.scaleX > 0) {
        scaleXs[li] = z.scaleX;
        scaleYs[li] = z.scaleX;
      } else if (z.scaleY > 0) {
        scaleXs[li] = z.scaleY;
        scaleYs[li] = z.scaleY;
      } else if (z.lineCount == 2) {
        scaleXs[li] = 1;
        scaleYs[li] = 1;
      } else if (ln.effect == "SCROLL") {
        scaleXs[li] = 2;
        scaleYs[li] = 2;
      } else {
        // Substitute timer variables before measuring width so {timer} scales correctly
        String measText = substituteTimer(ln.text);
        int tw2x = (ln.font == "digital") ? textWidthDigitalScaled(measText.c_str(), 2, ln.spacing, ln.bold) : textWidth5x7Scaled(measText.c_str(), 2, ln.spacing, ln.bold);
        scaleXs[li] = (tw2x <= zoneW) ? 2 : 1;
        scaleYs[li] = scaleXs[li];
      }
      // Override with line-level scale if present
      if (ln.scaleX > 0) scaleXs[li] = ln.scaleX;
      if (ln.scaleY > 0) scaleYs[li] = ln.scaleY;
      
      // Fallback: if one axis is scaled but not the other, keep them proportional
      if (ln.scaleY == 0 && ln.scaleX > 0) scaleYs[li] = ln.scaleX;
      if (ln.scaleX == 0 && ln.scaleY > 0) scaleXs[li] = ln.scaleY;
      
      int mt = (ln.marginTop > 0 || li > 0) ? (int)ln.marginTop : 0;
      int mb = (li < z.lineCount - 1) ? (int)ln.marginBottom : 0;
      totalTextH += mt + CHAR_H * scaleYs[li] + mb;
    }

    // Compute Y offset for each line based on valign
    int lineY[MAX_LINES_PER_ZONE];
    int yo;
    if (availH <= totalTextH) {
      yo = availTop;
    } else if (z.valign == "top") {
      yo = availTop;
    } else if (z.valign == "bottom") {
      yo = availBottom - totalTextH + 1;
    } else {
      yo = availTop + (availH - totalTextH) / 2;
    }
    for (int li = 0; li < z.lineCount; li++) {
      auto& ln = z.lines[li];
      int mt = (ln.marginTop > 0 || li > 0) ? (int)ln.marginTop : 0;
      yo += mt;
      lineY[li] = yo;
      yo += CHAR_H * scaleYs[li] + ((li < z.lineCount - 1) ? (int)ln.marginBottom : 0);
    }

    for (int li = 0; li < z.lineCount; li++) {
      auto& line = z.lines[li];
      String display = substituteTimer(line.text);
      
      uint16_t finalColor = line.color;
      String finalEffect = line.effect;
      String finalAlign = line.align;
      if (finalAlign.length() == 0) finalAlign = "center";
      
      if (_timerActive && line.ruleCount > 0) {
        unsigned long now2 = millis();
        long remainingMs = (long)_timerRemainingAtBaseMs - (long)(now2 - _timerBaseMs);
        if (remainingMs < 0) remainingMs = 0;
        long remainingSec = remainingMs / 1000;
        
        for (int r = 0; r < line.ruleCount; r++) {
          bool match = false;
          if (line.rules[r].type == "time_remaining") {
            if (line.rules[r].op == "<" && remainingSec < line.rules[r].value) match = true;
            if (line.rules[r].op == ">" && remainingSec > line.rules[r].value) match = true;
            if (line.rules[r].op == "<=" && remainingSec <= line.rules[r].value) match = true;
            if (line.rules[r].op == ">=" && remainingSec >= line.rules[r].value) match = true;
            if (line.rules[r].op == "==" && remainingSec == line.rules[r].value) match = true;
          }
          if (line.rules[r].type == "time_remaining_min") {
            long remainingMin = remainingSec / 60;
            if (line.rules[r].op == "<" && remainingMin < line.rules[r].value) match = true;
            if (line.rules[r].op == ">" && remainingMin > line.rules[r].value) match = true;
            if (line.rules[r].op == "<=" && remainingMin <= line.rules[r].value) match = true;
            if (line.rules[r].op == ">=" && remainingMin >= line.rules[r].value) match = true;
            if (line.rules[r].op == "==" && remainingMin == line.rules[r].value) match = true;
          }
          if (line.rules[r].type == "time_remaining_pct" && _timerTotalMs > 0) {
            float pct = (float)remainingMs / (float)_timerTotalMs * 100.0f;
            if (line.rules[r].op == "<" && pct < line.rules[r].value) match = true;
            if (line.rules[r].op == ">" && pct > line.rules[r].value) match = true;
            if (line.rules[r].op == "<=" && pct <= line.rules[r].value) match = true;
            if (line.rules[r].op == ">=" && pct >= line.rules[r].value) match = true;
            if (line.rules[r].op == "==" && pct == line.rules[r].value) match = true;
          }
          
          if (match) {
            if (line.rules[r].activeColor) finalColor = line.rules[r].color;
            if (line.rules[r].activeEffect) finalEffect = line.rules[r].effect;
            if (line.rules[r].activeAlign) finalAlign = line.rules[r].align;
          }
        }
      }
      int scaleX = scaleXs[li];
      int scaleY = scaleYs[li];

      int x;
      String align = finalAlign;

      int textW = (line.font == "digital") ? textWidthDigitalScaled(display.c_str(), scaleX, line.spacing, line.bold) : textWidth5x7Scaled(display.c_str(), scaleX, line.spacing, line.bold);
      // C2 fix: use finalEffect (rule-overridden) for overflow/scroll decision
      bool overflows = (finalEffect == "SCROLL" && textW > zoneW);
      if (overflows) {
        x = zoneX + line.scrollX;
      } else if (align == "left") {
        x = zoneX;
      } else if (align == "right") {
        x = zoneX + zoneW - textW;
      } else {
        x = zoneX + (zoneW - textW) / 2;
      }

      if (line.hasBgColor) {
        uint16_t bgCol = _matrix->color565(line.bgR, line.bgG, line.bgB);
        int bgY = lineY[li];
        int bgH = CHAR_H * scaleY;
        // For scrolling text: fill full zone so trailing pixels are covered.
        // For static text: hug the text width/position so it acts as a highlight.
        int bgX, bgW;
        if (overflows) {
          bgX = zoneX;
          bgW = zoneW;
        } else if (align == "left") {
          bgX = zoneX; bgW = textW;
        } else if (align == "right") {
          bgX = zoneX + zoneW - textW; bgW = textW;
        } else {
          bgX = zoneX + (zoneW - textW) / 2; bgW = textW;
        }
        for (int dy = 0; dy < bgH; dy++) {
          for (int dx = 0; dx < bgW; dx++) {
            int px = bgX + dx;
            int py = bgY + dy;
            if (isBorderRow(py, z.borderCount, z.borderRanges)) continue;
            if (px >= zoneX && px < zoneXEnd && py >= 0 && py < WF2_RES_Y) {
              drawPixelMapped(px, py, bgCol);
            }
          }
        }
      }

      bool drawIt = true;
      if (finalEffect == "BLINK" && (millis() % 1000) < 500) drawIt = false;
      if (finalEffect == "BLINK_FAST" && (millis() % 500) < 250) drawIt = false;
      if (finalEffect == "BLINK_SLOW" && (millis() % 2000) < 1000) drawIt = false;

      if (drawIt) {
        if (line.font == "digital") {
          drawTextDigitalScaled(display.c_str(), x, lineY[li], finalColor, scaleX, scaleY, line.spacing, zoneX, zoneXEnd, z.borderCount, z.borderRanges, line.bold);
        } else {
          drawText5x7Scaled(display.c_str(), x, lineY[li], finalColor, scaleX, scaleY, line.spacing, zoneX, zoneXEnd, z.borderCount, z.borderRanges, line.bold);
        }
      }
    }
  }

  _matrix->flipDMABuffer();
}

static const uint8_t MICRO_A[5] = { 0x02, 0x05, 0x07, 0x05, 0x05 };
static const uint8_t MICRO_P[5] = { 0x06, 0x05, 0x06, 0x04, 0x04 };
static const uint8_t MICRO_M[5] = { 0x05, 0x07, 0x05, 0x05, 0x05 };

static inline const uint8_t* getMicroGlyph(char c) {
  if (c == 'A' || c == 'a') return MICRO_A;
  if (c == 'P' || c == 'p') return MICRO_P;
  if (c == 'M' || c == 'm') return MICRO_M;
  return nullptr;
}

int Hub75Driver::textWidth5x7Scaled(const char* s, int scaleX, int spacing, bool bold) {
  int w = 0;
  int curScaleX = scaleX;
  bool isSuper = false;
  for (const char* p = s; *p; p++) {
    if (*p == '\x01') { curScaleX = 1; isSuper = true; continue; }
    int cw = (isSuper && getMicroGlyph(*p)) ? 3 : ((*p == ' ' || *p == ':') ? 3 : CHAR_W);
    w += (cw + spacing) * curScaleX;
    if (bold && *p != ' ' && *p != ':' && curScaleX == scaleX) w += 1 * curScaleX;
  }
  if (w > 0) w -= spacing * curScaleX;
  return w;
}

void Hub75Driver::drawText5x7Scaled(const char* s, int x, int y, uint16_t color, int scaleX, int scaleY, int spacing, int clipXStart, int clipXEnd, uint8_t borderCount, const BorderRange* borderRanges, bool bold) {
  int cursor = x;
  int curScaleX = scaleX;
  int curScaleY = scaleY;
  bool isSuper = false;
  for (const char* p = s; *p; p++) {
    if (*p == '\x01') { curScaleX = 1; curScaleY = 1; isSuper = true; continue; }
    const uint8_t* micro = isSuper ? getMicroGlyph(*p) : nullptr;
    if (micro) {
      for (int row = 0; row < 5; row++) {
        uint8_t bits = micro[row];
        for (int col = 0; col < 3; col++) {
          if (bits & (1 << (2 - col))) {
            int px = cursor + col;
            int py = y + row;
            bool isBorder = false;
            for (uint8_t i = 0; i < borderCount; i++) {
              if (py >= borderRanges[i].start && py <= borderRanges[i].end) { isBorder = true; break; }
            }
            if (!isBorder && px >= clipXStart && px < clipXEnd && py >= 0 && py < WF2_RES_Y) {
              drawPixelMapped(px, py, color);
            }
          }
        }
      }
      cursor += (3 + spacing);
      continue;
    }
    int idx = glyphIndex(*p);
    if (idx >= 0 && idx < (int)FONT_SIZE) {
      const uint8_t* glyph = FONT5x7[idx];
      for (int row = 0; row < CHAR_H; row++) {
        uint8_t bits = glyph[row];
        for (int col = 0; col < CHAR_W; col++) {
          if (bits & (1 << (CHAR_W - 1 - col))) {
            for (int dy = 0; dy < curScaleY; dy++) {
              for (int dx = 0; dx < curScaleX; dx++) {
                int px = cursor + col * curScaleX + dx;
                int py = y + row * curScaleY + dy;
                
                bool isBorder = false;
                for (uint8_t i = 0; i < borderCount; i++) {
                  if (py >= borderRanges[i].start && py <= borderRanges[i].end) {
                    isBorder = true;
                    break;
                  }
                }
                
                if (isBorder) continue;
                if (px >= clipXStart && px < clipXEnd && py >= 0 && py < WF2_RES_Y) {
                  drawPixelMapped(px, py, color);
                }
                if (bold && curScaleX == scaleX) {
                  int pxBold = px + curScaleX;
                  if (pxBold >= clipXStart && pxBold < clipXEnd && py >= 0 && py < WF2_RES_Y) {
                    drawPixelMapped(pxBold, py, color);
                  }
                }
              }
            }
          }
        }
      }
    }
    int cw = (*p == ' ') ? 3 : (*p == ':') ? 3 : CHAR_W;
    cursor += (cw + spacing) * curScaleX;
    if (bold && *p != ' ' && *p != ':' && curScaleX == scaleX) cursor += 1 * curScaleX;
  }
}

int Hub75Driver::textWidthDigitalScaled(const char* s, int scaleX, int spacing, bool bold) {
  int w = 0;
  int curScaleX = scaleX;
  bool isSuper = false;
  for (const char* p = s; *p; p++) {
    if (*p == '\x01') { curScaleX = 1; isSuper = true; continue; }
    int cw = (isSuper && getMicroGlyph(*p)) ? 3 : ((*p == ' ' || *p == ':') ? 3 : CHAR_W);
    w += (cw + spacing) * curScaleX;
    if (bold && *p != ' ' && *p != ':' && curScaleX == scaleX) w += 1 * curScaleX;
  }
  if (w > 0) w -= spacing * curScaleX;
  return w;
}

void Hub75Driver::drawTextDigitalScaled(const char* s, int x, int y, uint16_t color, int scaleX, int scaleY, int spacing, int clipXStart, int clipXEnd, uint8_t borderCount, const BorderRange* borderRanges, bool bold) {
  int cursor = x;
  int curScaleX = scaleX;
  int curScaleY = scaleY;
  bool isSuper = false;
  for (const char* p = s; *p; p++) {
    if (*p == '\x01') { curScaleX = 1; curScaleY = 1; isSuper = true; continue; }
    const uint8_t* micro = isSuper ? getMicroGlyph(*p) : nullptr;
    if (micro) {
      for (int row = 0; row < 5; row++) {
        uint8_t bits = micro[row];
        for (int col = 0; col < 3; col++) {
          if (bits & (1 << (2 - col))) {
            int px = cursor + col;
            int py = y + row;
            bool isBorder = false;
            for (uint8_t i = 0; i < borderCount; i++) {
              if (py >= borderRanges[i].start && py <= borderRanges[i].end) { isBorder = true; break; }
            }
            if (!isBorder && px >= clipXStart && px < clipXEnd && py >= 0 && py < WF2_RES_Y) {
              drawPixelMapped(px, py, color);
            }
          }
        }
      }
      cursor += (3 + spacing);
      continue;
    }
    const uint8_t* glyph = nullptr;
    int idx = glyphDigitalIndex(*p);
    if (idx >= 0 && idx < 13) {
      glyph = FONT_DIGITAL_5x7[idx];
    } else {
      int f57Idx = glyphIndex(*p);
      if (f57Idx >= 0 && f57Idx < (int)FONT_SIZE) {
        glyph = FONT5x7[f57Idx];
      }
    }
    if (glyph) {
      for (int row = 0; row < CHAR_H; row++) {
        uint8_t bits = glyph[row];
        for (int col = 0; col < CHAR_W; col++) {
          if (bits & (1 << (CHAR_W - 1 - col))) {
            for (int dy = 0; dy < curScaleY; dy++) {
              for (int dx = 0; dx < curScaleX; dx++) {
                int px = cursor + col * curScaleX + dx;
                int py = y + row * curScaleY + dy;
                
                bool isBorder = false;
                for (uint8_t i = 0; i < borderCount; i++) {
                  if (py >= borderRanges[i].start && py <= borderRanges[i].end) {
                    isBorder = true;
                    break;
                  }
                }
                
                if (isBorder) continue;
                if (px >= clipXStart && px < clipXEnd && py >= 0 && py < WF2_RES_Y) {
                  drawPixelMapped(px, py, color);
                }
                if (bold && curScaleX == scaleX) {
                  int pxBold = px + curScaleX;
                  if (pxBold >= clipXStart && pxBold < clipXEnd && py >= 0 && py < WF2_RES_Y) {
                    drawPixelMapped(pxBold, py, color);
                  }
                }
              }
            }
          }
        }
      }
    }
    int cw = (*p == ' ') ? 3 : (*p == ':') ? 3 : CHAR_W;
    cursor += (cw + spacing) * curScaleX;
    if (bold && *p != ' ' && *p != ':' && curScaleX == scaleX) cursor += 1 * curScaleX;
  }
}

void Hub75Driver::drawPixelMapped(int x, int y, uint16_t color) {
  if (x < 0 || x >= WF2_RES_X || y < 0 || y >= WF2_RES_Y) return;
  _matrix->drawPixel(x, y, color);
}

void Hub75Driver::playBootAnimation(unsigned long durationMs) {
  if (!_matrix) return;
  
  unsigned long start = millis();
  unsigned long lastTime = start;
  
  // State variables
  float ballX = 48.0f;
  float ballY = 16.0f;
  float ballAngle = 0.0f;
  float ballVx = 0.0f;
  float ballVy = 0.0f;
  float ballScaleX = 1.0f;
  float ballScaleY = 1.0f;
  
  float padLeftX = -20.0f;
  float padRightX = 116.0f;
  
  int impactFlashFrames = 0;
  
  struct Particle {
    float x, y, vx, vy;
    uint16_t color;
    int life, maxLife;
    bool active;
  };
  Particle* particles = new Particle[150];
  for(int i = 0; i < 150; i++) particles[i].active = false;
  
  auto spawnParticle = [&](float x, float y, float vx, float vy, uint16_t color, int life) {
    for(int i = 0; i < 150; i++) {
      if(!particles[i].active) {
        particles[i] = {x, y, vx, vy, color, life, life, true};
        break;
      }
    }
  };
  
  struct TrailNode {
    float x, y;
  };
  TrailNode trail[10];
  int trailIdx = 0;
  for(int i = 0; i < 10; i++) trail[i] = {ballX, ballY};
  
  auto hsv2rgb = [&](float h, float s, float v) -> uint16_t {
    while(h < 0) h += 360.0f;
    while(h >= 360.0f) h -= 360.0f;
    int hi = (int)(h / 60.0f) % 6;
    float f = (h / 60.0f) - hi;
    float p = v * (1.0f - s);
    float q = v * (1.0f - f * s);
    float t = v * (1.0f - (1.0f - f) * s);
    float r = 0, g = 0, b = 0;
    switch(hi) {
      case 0: r=v; g=t; b=p; break;
      case 1: r=q; g=v; b=p; break;
      case 2: r=p; g=v; b=t; break;
      case 3: r=p; g=q; b=v; break;
      case 4: r=t; g=p; b=v; break;
      case 5: r=v; g=p; b=q; break;
    }
    return _matrix->color565((uint8_t)(r * 255), (uint8_t)(g * 255), (uint8_t)(b * 255));
  };

  uint16_t colorYellow = _matrix->color565(255, 255, 0);
  uint16_t colorOrange = _matrix->color565(255, 128, 0);
  uint16_t colorWhite = _matrix->color565(255, 255, 255);
  uint16_t colorBlack = _matrix->color565(0, 0, 0);
  uint16_t colorDark = _matrix->color565(50, 50, 50);
  
  auto drawPaddle = [&](float px, float py, float hue) {
    // Face (white inside)
    _matrix->fillRect((int)px - 2, (int)py - 6, 5, 10, colorWhite);
    // Handle
    _matrix->fillRect((int)px - 1, (int)py + 4, 3, 4, colorDark);
    // Face border
    uint16_t edgeCol = hsv2rgb(hue, 1.0f, 1.0f);
    _matrix->drawRect((int)px - 3, (int)py - 7, 7, 12, edgeCol);
  };

  while (millis() - start < durationMs) {
    if (_otaActive) break;
    unsigned long now = millis();
    unsigned long elapsed = now - start;
    float dt = (now - lastTime) / 1000.0f;
    if (dt > 0.1f) dt = 0.1f;
    lastTime = now;
    
    _matrix->clearScreen();

    float globalHue = fmod(elapsed * 0.2f, 360.0f);
    bool drawBall = false;

    // -- Phase 1: 0-1s --
    if (elapsed < 1000) {
      float progress = elapsed / 1000.0f;
      if (progress < 0.3f) {
        uint8_t c = (uint8_t)(sin(progress * PI / 0.3f) * 127 + 128);
        _matrix->drawPixel(48, 8, _matrix->color565(c, c, c));
      } else {
        float p2 = (progress - 0.3f) / 0.7f;
        for(int i = 0; i < 12; i++) {
          float a = p2 * TWO_PI * 2.0f + i * (TWO_PI / 12.0f);
          float d = 20.0f * (1.0f - p2);
          int px = 48 + cos(a) * d;
          int py = 8 + sin(a) * d;
          _matrix->drawPixel(px, py, hsv2rgb(fmod(i * 30.0f, 360.0f), 1.0f, 1.0f));
        }
        _matrix->fillCircle(48, 8, (int)(p2 * 5.0f), _matrix->color565(255, (int)(255 * p2), 0));
      }
      ballX = 48.0f;
      ballY = 8.0f;
    }
    // -- Phase 2: 1-3s --
    else if (elapsed < 3000) {
      ballAngle += 2.0f * dt;
      drawBall = true;
      for(int r = 8; r >= 6; r--) {
        uint16_t glow = hsv2rgb(globalHue, 1.0f, (9 - r) * 0.2f);
        _matrix->drawCircle(48, 8, r, glow);
      }
    }
    // -- Phase 3: 3-6s --
    else if (elapsed < 6000) {
      if (ballVx == 0.0f && ballVy == 0.0f) {
        ballVx = 80.0f;
        ballVy = -30.0f;
      }
      ballX += ballVx * dt;
      ballY += ballVy * dt;
      ballAngle += 10.0f * dt;
      
      ballScaleX += (1.0f - ballScaleX) * 10.0f * dt;
      ballScaleY += (1.0f - ballScaleY) * 10.0f * dt;

      bool bounced = false;
      if (ballX - 5.0f < 0) { ballX = 5.0f; ballVx = -ballVx; bounced = true; ballScaleX = 0.6f; ballScaleY = 1.4f; }
      if (ballX + 5.0f > 95) { ballX = 95 - 5.0f; ballVx = -ballVx; bounced = true; ballScaleX = 0.6f; ballScaleY = 1.4f; }
      if (ballY - 5.0f < 0) { ballY = 5.0f; ballVy = -ballVy; bounced = true; ballScaleX = 1.4f; ballScaleY = 0.6f; }
      if (ballY + 5.0f > 15) { ballY = 15 - 5.0f; ballVy = -ballVy; bounced = true; ballScaleX = 1.4f; ballScaleY = 0.6f; }
      
      if (bounced) {
        impactFlashFrames = 2;
        for(int i = 0; i < 10; i++) {
          float a = ((float)rand() / RAND_MAX) * TWO_PI;
          float v = 20.0f + ((float)rand() / RAND_MAX) * 40.0f;
          spawnParticle(ballX, ballY, cos(a) * v, sin(a) * v, hsv2rgb(globalHue, 1.0f, 1.0f), 10 + rand() % 10);
        }
      }
      
      trail[trailIdx] = {ballX, ballY};
      trailIdx = (trailIdx + 1) % 10;
      
      for(int i = 0; i < 10; i++) {
        int idx = (trailIdx + i) % 10;
        float tx = trail[idx].x;
        float ty = trail[idx].y;
        if (tx != 48.0f || ty != 8.0f) {
          _matrix->fillCircle((int)tx, (int)ty, 2, hsv2rgb(fmod(globalHue + i * 20.0f, 360.0f), 1.0f, (i + 1) * 0.1f));
        }
      }
      
      if (elapsed > 5000) {
        float ease = (6000 - elapsed) / 1000.0f;
        ballVx = (48.0f - ballX) * (1.0f - ease) * 3.0f;
        ballVy = (8.0f - ballY) * (1.0f - ease) * 3.0f;
      }
      drawBall = true;
    }
    // -- Phase 4: 6-8s --
    else if (elapsed < 8000) {
      ballX += (48.0f - ballX) * 10.0f * dt;
      ballY += (8.0f - ballY) * 10.0f * dt;
      ballVx = 0; ballVy = 0;
      ballScaleX = 1.0f; ballScaleY = 1.0f;
      ballAngle += 20.0f * dt;
      
      float ease = min(1.0f, (elapsed - 6000) / 1500.0f);
      padLeftX = -20.0f + ease * 50.0f; 
      padRightX = 116.0f - ease * 50.0f;
      
      drawPaddle(padLeftX, 8.0f, globalHue);
      drawPaddle(padRightX, 8.0f, globalHue + 180.0f);
      drawBall = true;
    }
    // -- Phase 5: 8-9s --
    else if (elapsed < 9000) {
      float progress = (elapsed - 8000) / 1000.0f;
      ballAngle += 40.0f * dt;
      
      if (progress < 0.1f) {
        padLeftX += (39.0f - padLeftX) * 30.0f * dt;
        padRightX += (57.0f - padRightX) * 30.0f * dt;
        if (elapsed - 8000 < 20) {
          impactFlashFrames = 3;
          for(int i = 0; i < 150; i++) {
            float a = ((float)rand() / RAND_MAX) * TWO_PI;
            float v = 40.0f + ((float)rand() / RAND_MAX) * 80.0f;
            spawnParticle(48.0f, 8.0f, cos(a) * v, sin(a) * v, hsv2rgb((float)(rand() % 360), 1.0f, 1.0f), 20 + rand() % 20);
          }
        }
      } else {
        padLeftX += (25.0f - padLeftX) * 5.0f * dt;
        padRightX += (71.0f - padRightX) * 5.0f * dt;
      }
      
      drawPaddle(padLeftX, 8.0f, globalHue);
      drawPaddle(padRightX, 8.0f, globalHue + 180.0f);
      drawBall = true;
    }
    // -- Phase 6: 9-10s --
    else {
      ballAngle += 5.0f * dt;
      drawPaddle(padLeftX, 8.0f, globalHue);
      drawPaddle(padRightX, 8.0f, globalHue + 180.0f);
      drawBall = true;
      
      float progress = (elapsed - 9000) / 1000.0f;
      int alpha = (int)(progress * 255.0f);
      if (alpha > 255) alpha = 255;
      
      if (alpha > 50) {
        int textWidth = 12 * 6; // "PADDLE POINT" is 12 chars, 6px each
        _matrix->setCursor(48 - (textWidth / 2), 1); // Put at top to avoid paddles
        _matrix->setTextColor(_matrix->color565(alpha, alpha, alpha));
        _matrix->print("PADDLE POINT");
      }
    }

    // Process and draw particles
    for(int i = 0; i < 150; i++) {
      if (particles[i].active) {
        particles[i].x += particles[i].vx * dt;
        particles[i].y += particles[i].vy * dt;
        particles[i].life--;
        if (particles[i].life <= 0 || particles[i].x < 0 || particles[i].x > 95 || particles[i].y < 0 || particles[i].y > 15) {
          particles[i].active = false;
        } else {
          float fade = (float)particles[i].life / particles[i].maxLife;
          uint16_t c = particles[i].color;
          uint8_t r = (uint8_t)(((c >> 11) & 0x1F) * 8 * fade);
          uint8_t g = (uint8_t)(((c >> 5) & 0x3F) * 4 * fade);
          uint8_t b = (uint8_t)((c & 0x1F) * 8 * fade);
          _matrix->drawPixel((int)particles[i].x, (int)particles[i].y, _matrix->color565(r, g, b));
        }
      }
    }

    // Draw Pickleball (reverse mapping for no holes with scaling)
    if (drawBall) {
      int maxR = 6;
      for (int dy = -maxR; dy <= maxR; dy++) {
        for (int dx = -maxR; dx <= maxR; dx++) {
          float tx = dx;
          float ty = dy;
          
          float ux = tx * cos(-ballAngle) - ty * sin(-ballAngle);
          float uy = tx * sin(-ballAngle) + ty * cos(-ballAngle);
          
          float sx = ux / ballScaleX;
          float sy = uy / ballScaleY;
          
          float srcX = sx * cos(ballAngle) - sy * sin(ballAngle);
          float srcY = sx * sin(ballAngle) + sy * cos(ballAngle);
          
          float distSq = srcX * srcX + srcY * srcY;
          if (distSq <= 25.0f) {
            int isrcX = (int)round(srcX);
            int isrcY = (int)round(srcY);
            
            uint16_t c = colorYellow;
            if (distSq >= 16.0f) {
              c = colorOrange;
            } else if (isrcX == -2 && isrcY == -2) {
              c = colorWhite;
            } else if ((isrcX == 0 && isrcY == -2) || (isrcX == -2 && isrcY == 2) || (isrcX == 2 && isrcY == 1)) {
              c = colorBlack;
            }
            
            int px = (int)ballX + dx;
            int py = (int)ballY + dy;
            if (px >= 0 && px < 96 && py >= 0 && py < 16) {
              _matrix->drawPixel(px, py, c);
            }
          }
        }
      }
    }
    
    // Impact flash full screen overlay (disabled per request)
    // if (impactFlashFrames > 0) {
    //   _matrix->fillRect(0, 0, 96, 32, colorWhite);
    //   impactFlashFrames--;
    // }

    _matrix->flipDMABuffer();
    if (_pollCb) _pollCb();
    delay(16);
  }
  
  delete[] particles;
}

#endif
