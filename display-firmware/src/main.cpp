#include <Arduino.h>
#include "esp_attr.h"
#include "esp_system.h"
#include "IDisplayDriver.h"
#include "Hub75Driver.h"
#include "MqttDisplayClient.h"
#include "ConfigPortal.h"

// WF2 onboard peripherals
#define STATUS_LED    40   // RUN_LED — solid=online, blink 500ms=lost, rapid 200ms=portal
#define RESET_BUTTON  17   // long-press 5s → factory reset → portal

// ── Normal-mode state ────────────────────────────────────────────────────────
static MqttDisplayClient* g_mqtt       = nullptr;
static IDisplayDriver*    g_display    = nullptr;
static unsigned long       g_ledToggleAt = 0;
static bool               g_ledState    = false;

// ── Portal-mode state ────────────────────────────────────────────────────────
static ConfigPortal g_portal;
static bool g_portalMode = false;

// ── Button (factory reset) ───────────────────────────────────────────────────
static unsigned long g_btnPressStart = 0;
static bool g_btnHandled = false;

// ── Reboot-loop guard ────────────────────────────────────────────────────────
// Survives software resets (not power loss). If court reassignments reboot us
// repeatedly, stop rebooting and stay on the current assignment so the device
// doesn't loop forever on a mismatched server courtId.
RTC_NOINIT_ATTR static uint32_t s_courtReboots;
RTC_NOINIT_ATTR static uint32_t s_rebootGuardArmed;
static unsigned long s_bootMillis = 0;

static void checkResetButton() {
  bool pressed = (digitalRead(RESET_BUTTON) == LOW);  // active-low
  if (pressed) {
    if (g_btnPressStart == 0) g_btnPressStart = millis();
    if (millis() - g_btnPressStart > 5000 && !g_btnHandled) {
      log_i("[main] Button held 5s → factory reset");
      g_portal.factoryReset();
      g_btnHandled = true;
    }
  } else {
    g_btnPressStart = 0;
    g_btnHandled = false;
  }
}

static void statusLedPortal() {
  unsigned long now = millis();
  if (now - g_ledToggleAt >= 200) {  // rapid blink = portal mode
    g_ledToggleAt = now;
    g_ledState = !g_ledState;
    digitalWrite(STATUS_LED, g_ledState ? HIGH : LOW);
  }
}

static void showSetupMessage(const String& text, uint8_t r = 255, uint8_t g = 255, uint8_t b = 255) {
  ZoneRenderInfo zones[1];
  zones[0].panelStart = 0;
  zones[0].panelEnd = 2;
  zones[0].lineCount = 1;
  zones[0].scaleX = 1;
  zones[0].scaleY = 1;
  zones[0].valign = "middle";
  zones[0].borderCount = 0;
  zones[0].lines[0].text = text;
  zones[0].lines[0].effect = "SCROLL";
  zones[0].lines[0].align = "center";
  zones[0].lines[0].marginTop = 0;
  zones[0].lines[0].marginBottom = 2;
  zones[0].lines[0].r = r;
  zones[0].lines[0].g = g;
  zones[0].lines[0].b = b;
  g_display->setZones(zones, 1);
  g_display->update();
}

// Effective OTA/telnet password: per-site NVS value wins, firmware default
// is the fallback. ArduinoOTA::setPassword copies the string internally.
static String effectiveOtaPassword() {
  String p = g_portal.getOtaPass();
  if (p.length() > 0) return p;
#ifndef OTA_PASSWORD
#define OTA_PASSWORD "freq123"
#endif
  return String(OTA_PASSWORD);
}

static void statusLedNormal(MqttDisplayClient* mqtt) {
  if (mqtt->isOnline()) {
    digitalWrite(STATUS_LED, HIGH);
  } else {
    unsigned long now = millis();
    if (now - g_ledToggleAt >= 500) {  // slow blink = lost connection
      g_ledToggleAt = now;
      g_ledState = !g_ledState;
      digitalWrite(STATUS_LED, g_ledState ? HIGH : LOW);
    }
  }
}

#include <WiFi.h>

#ifdef ENABLE_OTA
#include <ArduinoOTA.h>
#endif

#ifdef ENABLE_TELNET
#include "TelnetLogger.h"
static TelnetLogger g_log;
#define LOG(fmt, ...) g_log.printf(fmt, ##__VA_ARGS__)
#else
#define LOG(fmt, ...) Serial.printf(fmt, ##__VA_ARGS__)
#endif

void setup() {
  // CRITICAL: Kill WiFi background task FIRST — before Serial, before DMA init.
  // The ESP32 auto-connect WiFi task fragments the heap and causes DMA init to fail.
  WiFi.mode(WIFI_OFF);
  delay(100);

  Serial.begin(115200);
  // Small pause to let USB CDC enumerate (non-critical; logs may be truncated on first boot)
  delay(200);

  LOG("BOOTING UP! If you see this, the chip is NOT frozen!\n");
  LOG("\n=== Freq Court Display — HD-WF2 ===\n");
  s_bootMillis = millis();
  if (s_rebootGuardArmed != 0xC0FFEE) {
    s_rebootGuardArmed = 0xC0FFEE;
    s_courtReboots = 0;
  }
  LOG("[main] reset reason: %d, court-reboot count: %u\n",
      (int)esp_reset_reason(), (unsigned)s_courtReboots);

  pinMode(STATUS_LED, OUTPUT);
  pinMode(RESET_BUTTON, INPUT_PULLUP);
  digitalWrite(STATUS_LED, LOW);

  g_display = new Hub75Driver();
  
  g_display->begin();
  
  if (!g_display->isAlive()) {
    log_e("[main] FATAL: Display init failed — entering portal mode for recovery");
    g_portalMode = true;
    String setupMsg = "DISPLAY FAILED - " + g_portal.getPortalSSID();
    g_display->showRow(0, setupMsg.c_str());
    g_display->update();
    g_portal.setDisplayDriver(g_display);
    g_portal.startPortal();
    return;
  }
  
  // Boot reel (~18s): original 10s ball scene, 5s "PADDLE POINT" text
  // intro, then the 3s logo end-card.
  // Poll the reset button each frame so a 5s factory-reset press isn't lost.
  g_display->setPollCallback(checkResetButton);
  g_display->playBootAnimation(10000);
  if (auto* hub = static_cast<Hub75Driver*>(g_display)) hub->playBootTextAnimation(5000);
  // Static brand end-card so the boot always lands on the Paddle Point logo
  if (auto* hub = static_cast<Hub75Driver*>(g_display)) hub->showBrandLogo(3000);
  g_display->setPollCallback(nullptr);
  g_display->setConnecting(true);
  // ── Boot branching: portal vs normal ──────────────────────────────────────
  if (!g_portal.isConfigured()) {
    g_portalMode = true;
    g_display->setConnecting(false);
    showSetupMessage("SETUP: " + g_portal.getPortalSSID());
    g_portal.setDisplayDriver(g_display);
    g_portal.startPortal();
    return;
  }

  // ── Try saved WiFi; fall back to portal on failure ─────────────────────────
  if (!g_portal.connectSavedWiFi(3)) {
    g_portalMode = true;
    g_display->setConnecting(false);
    showSetupMessage("WIFI FAILED - " + g_portal.getPortalSSID());
    g_portal.setDisplayDriver(g_display);
    g_portal.startPortal();
    return;
  }

  g_display->setConnecting(false);

  // HTTPS certificate validation requires a valid clock before bootstrapping
  // the MQTT credentials.
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  time_t now = 0;
  for (uint8_t i = 0; i < 20 && now < 1700000000; ++i) {
    time(&now);
    delay(250);
  }

  log_i("[main] SNTP time sync initiated");

  int fetchStatus = 0;
  bool bootstrapped = g_portal.fetchMqttConfig(&fetchStatus);

  String broker = g_portal.getMqttBroker();
  String user   = g_portal.getMqttUser();
  String mpwd   = g_portal.getMqttPass();
  bool hasMqttCreds = (broker.length() > 0 && user.length() > 0 && mpwd.length() > 0);

  // If initial bootstrap fails and we have no stored credentials, enter diagnostic retry
  if (!bootstrapped && !hasMqttCreds) {
    log_w("[main] Initial bootstrap failed (status=%d). Entering diagnostic retry...", fetchStatus);
    unsigned long retryStart = millis();
    while (!bootstrapped && !hasMqttCreds && (millis() - retryStart < 30000)) {
      String deviceMac = WiFi.macAddress();
      deviceMac.toLowerCase();
      deviceMac.replace(":", "");
      String failMsg = (fetchStatus == 401)
        ? ("UNAUTHORIZED (401) - MAC: " + deviceMac + " - ADD IN DASHBOARD")
        : ("CONFIG FAILED (" + String(fetchStatus) + ") - RETRYING...");

      showSetupMessage(failMsg, 255, (fetchStatus == 401) ? 50 : 200, 50);

      unsigned long waitStart = millis();
      while (millis() - waitStart < 3000) {
        checkResetButton();
        g_display->update();
        delay(20);
      }
      bootstrapped = g_portal.fetchMqttConfig(&fetchStatus);
      broker = g_portal.getMqttBroker();
      user   = g_portal.getMqttUser();
      mpwd   = g_portal.getMqttPass();
      hasMqttCreds = (broker.length() > 0 && user.length() > 0 && mpwd.length() > 0);
    }
  }

  // If still completely unconfigured after retries, open setup portal
  if (!bootstrapped && !hasMqttCreds) {
    log_e("[main] Could not obtain MQTT credentials - opening portal");
    g_portalMode = true;
    showSetupMessage((fetchStatus == 401)
      ? ("UNAUTHORIZED (401) - " + g_portal.getPortalSSID())
      : ("SETUP: " + g_portal.getPortalSSID()));
    g_portal.setDisplayDriver(g_display);
    g_portal.startPortal();
    return;
  }

  // ── Normal boot: MQTT client with saved settings ───────────────────────────
  g_mqtt = new MqttDisplayClient(*g_display);
  String ssid   = g_portal.getWifiSsid();
  String pass   = g_portal.getWifiPass();
  broker        = g_portal.getMqttBroker();
  user          = g_portal.getMqttUser();
  mpwd          = g_portal.getMqttPass();
  String court  = g_portal.getCourtId();
  uint16_t port = g_portal.getMqttPort();
  uint8_t brightness = g_portal.getBrightness();
  String colorHex = g_portal.getColorHex();

  g_display->setBrightness(brightness);
  if (colorHex.length() == 7 && colorHex.startsWith("#")) {
    long rgb = strtol(colorHex.substring(1).c_str(), NULL, 16);
    g_display->setColorRGB((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF);
  }

  // ── Telnet console ─────────────────────────────────────────────────────────
#ifdef ENABLE_TELNET
  g_log.begin(23);
  g_log.setPassword(effectiveOtaPassword());
  g_log.setCommandCallback([](const String& cmd, const String& args) {
    bool mutating = (cmd == "set.court" || cmd == "set.brightness" ||
                     cmd == "set.color" || cmd == "reboot");
    if (mutating && !g_log.isAuthenticated()) {
      LOG("[telnet] Authentication required — use 'auth <password>' first\n");
      return;
    }
    if (cmd == "set.court" && args.length() > 0) {
      g_portal.saveField("court_id", args);
      LOG("[telnet] Court set to '%s' — rebooting...\n", args.c_str());
      delay(500);
      ESP.restart();
    } else if (cmd == "set.brightness") {
      uint8_t val = (uint8_t)constrain(args.toInt(), 0, 255);
      g_portal.saveField("brightness", val);
      if (g_display) g_display->setBrightness(val);
      LOG("[telnet] Brightness set to %d\n", val);
    } else if (cmd == "set.color" && args.startsWith("#")) {
      g_portal.saveField("color_hex", args);
      long rgb = strtol(args.substring(1).c_str(), NULL, 16);
      if (g_display) g_display->setColorRGB((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF);
      LOG("[telnet] Color set to %s\n", args.c_str());
    } else if (cmd == "reboot") {
      LOG("[telnet] Rebooting...\n");
      delay(500);
      ESP.restart();
    } else if (cmd == "status") {
      LOG("[telnet] Court: %s | Brightness: %d | Color: %s\n",
        g_portal.getCourtId().c_str(), g_portal.getBrightness(), g_portal.getColorHex().c_str());
    } else {
      LOG("[telnet] Unknown command: %s\n", cmd.c_str());
    }
  });
#endif

  // ── OTA: wireless firmware updates ─────────────────────────────────────────
#ifdef ENABLE_OTA
  ArduinoOTA.setHostname(("freq-display-" + court).c_str());
  ArduinoOTA.setPassword(effectiveOtaPassword().c_str());
  ArduinoOTA.onStart([&]() {
    if (g_display) g_display->setOtaActive(true);
    LOG("[ota] Start — display paused\n");
  });
  ArduinoOTA.onEnd([]() {}); // device reboots after OTA; _otaActive resets on boot
  ArduinoOTA.onProgress([](unsigned int p, unsigned int t) {
    LOG("[ota] Progress: %u%%\n", t > 0 ? (p * 100) / t : 0);
  });
  ArduinoOTA.onError([](ota_error_t err) {
    LOG("[ota] Error %d\n", err);
  });
  ArduinoOTA.begin();
  LOG("[ota] Ready — upload via: pio run -e esp32-hub75-wf2-ota -t upload --upload-port %s\n",
        WiFi.localIP().toString().c_str());
#endif

  LOG("[main] Loaded settings: SSID='%s', Broker='%s:%d', CourtID='%s', User='%s', Brightness=%d, Color=%s\n",
                ssid.c_str(), broker.c_str(), port, court.c_str(), user.c_str(), brightness, colorHex.c_str());

  g_mqtt->setCourtChangeCallback([](const char* newCourtId) {
    if (s_courtReboots >= 3) {
      LOG("[mqtt] IGNORING court reassign to '%s' — %u recent reboots, possible server mismatch. Fix the dashboard assignment.\n",
          newCourtId, (unsigned)s_courtReboots);
      return;
    }
    LOG("[mqtt] Reassigning court: '%s' -> '%s' — saving and rebooting...\n",
        g_portal.getCourtId().c_str(), newCourtId);
    g_portal.saveField("court_id", String(newCourtId));
    s_courtReboots++;
    delay(500);
    ESP.restart();
  });

  g_mqtt->setPollCallback(checkResetButton);
  g_mqtt->setConfigRefreshCallback([](String& outBroker, uint16_t& outPort, String& outUser, String& outPass, String& outCourt) -> bool {
    int status = 0;
    if (g_portal.fetchMqttConfig(&status)) {
      outBroker = g_portal.getMqttBroker();
      outPort   = g_portal.getMqttPort();
      outUser   = g_portal.getMqttUser();
      outPass   = g_portal.getMqttPass();
      outCourt  = g_portal.getCourtId();
      return true;
    }
    return false;
  });

  g_mqtt->begin(ssid.c_str(), pass.c_str(), broker.c_str(), port,
                court.c_str(), user.c_str(), mpwd.c_str());
  digitalWrite(STATUS_LED, g_mqtt->isOnline() ? HIGH : LOW);

  LOG("[main] === BOOT COMPLETE ===\n");
  LOG("[main] WiFi:  %s (%d dBm)\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  LOG("[main] MQTT:  %s\n", g_mqtt->isOnline() ? "connected" : "disconnected");
  LOG("[main] Court: %s\n", court.c_str());
  LOG("[main] Subscribed to: courts/%s/display\n", court.c_str());
}

void loop() {
  checkResetButton();

  if (g_portalMode) {
    g_portal.update();
    statusLedPortal();
    if (g_display) g_display->update();
    yield();
    return;
  }

  if (!g_mqtt) return;
#ifdef ENABLE_TELNET
  g_log.update();
#endif
#ifdef ENABLE_OTA
  ArduinoOTA.handle();
#endif
  g_mqtt->update();
  statusLedNormal(g_mqtt);
  // Stable for 5 minutes: the reboot guard was a false alarm, reset it.
  if (s_courtReboots > 0 && millis() - s_bootMillis > 300000) {
    s_courtReboots = 0;
    LOG("[main] reboot guard cleared after stable uptime\n");
  }
  yield();
}
