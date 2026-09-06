#ifdef USE_HUB75
#include "MqttDisplayClient.h"
#include <ArduinoJson.h>

MqttDisplayClient* MqttDisplayClient::_instance = nullptr;

static bool parseHexColor(const std::string& hex, uint8_t& r, uint8_t& g, uint8_t& b) {
  if (hex.length() == 7 && hex[0] == '#') {
    long rgb = strtol(hex.c_str() + 1, NULL, 16);
    r = (rgb >> 16) & 0xFF;
    g = (rgb >> 8) & 0xFF;
    b = rgb & 0xFF;
    return true;
  }
  return false;
}

MqttDisplayClient::MqttDisplayClient(IDisplayDriver& driver)
  : _driver(driver), _mqtt(_wifi),
    _lastWifiReconnect(0), _lastMqttReconnect(0), _lastHeartbeat(0), _wasOnline(false)
{}

void MqttDisplayClient::begin(const char* ssid, const char* password,
                               const char* broker, uint16_t port,
                               const char* courtId, const char* mqttUser, const char* mqttPass) {
  _ssid = ssid; _password = password;
  _broker = broker; _port = port; _courtId = courtId;
  _mqttUser = mqttUser ? mqttUser : "";
  _mqttPass = mqttPass ? mqttPass : "";
  _instance = this;

  const char* ca_cert =
"-----BEGIN CERTIFICATE-----\n"
"MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n"
"TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh\n"
"cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4\n"
"WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu\n"
"ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY\n"
"MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc\n"
"h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+\n"
"0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U\n"
"A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW\n"
"T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH\n"
"B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC\n"
"B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv\n"
"KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn\n"
"OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn\n"
"jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw\n"
"qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI\n"
"rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV\n"
"HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq\n"
"hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL\n"
"ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ\n"
"3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK\n"
"NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5\n"
"ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur\n"
"TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC\n"
"jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc\n"
"oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq\n"
"4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA\n"
"mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d\n"
"emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=\n"
"-----END CERTIFICATE-----\n";
  _wifi.setCACert(ca_cert);

  snprintf(_displayTopic, sizeof(_displayTopic), "courts/%s/display", courtId);
  snprintf(_statusTopic,  sizeof(_statusTopic),  "freq.led/courts/%s/status",  courtId);
  log_i("[health] Will publish status to: %s", _statusTopic);

  _mqtt.setServer(broker, port);
  _mqtt.setCallback(onMessage);
  _mqtt.setBufferSize(4096);
  _mac = WiFi.macAddress();
  _mac.toLowerCase();
  _mac.replace(":", "");
  snprintf(_cmdTopic, sizeof(_cmdTopic), "freq/display/cmd/%s", _mac.c_str());
  log_i("[mqtt] MAC: %s, CMD topic: %s", _mac.c_str(), _cmdTopic);
  _playlist.reserve(8);
  memset(_subpageIdx, 0, sizeof(_subpageIdx));
  memset(_lastSubChange, 0, sizeof(_lastSubChange));

  connectWiFi();
  connectMqtt();
}

void MqttDisplayClient::update() {
  bool online = isOnline();

  if (!online && _wasOnline) {
    log_i("[health] Connection lost");
    String msg = wifiOk() ? "MQTT LOST - RETRYING..." : "WIFI LOST - RETRYING...";
    _driver.showRow(0, msg.c_str());
    _driver.update();
  }
  _wasOnline = online;

  if (!wifiOk()) {
    unsigned long now = millis();
    if (now - _lastWifiReconnect > 30000) {
      _lastWifiReconnect = now;
      log_i("[health] WiFi reconnect attempt");
      WiFi.reconnect();
    }
    _driver.update();
    return;
  }

  if (!mqttOk()) {
    unsigned long now = millis();
    if (now - _lastMqttReconnect > 5000) {
      _lastMqttReconnect = now;
      log_i("[health] MQTT reconnect attempt");
      if (connectMqtt()) {
        _failedMqttAttempts = 0;
        publishOnline();
      } else {
        _failedMqttAttempts++;
        if ((_failedMqttAttempts >= 3 || _mqttUser.length() == 0) && (now - _lastConfigRefresh > 20000)) {
          _lastConfigRefresh = now;
          if (_configRefreshCb) {
            String newBroker, newUser, newPass, newCourt;
            uint16_t newPort = 8883;
            log_i("[health] Attempting remote config refresh...");
            if (_configRefreshCb(newBroker, newPort, newUser, newPass, newCourt)) {
              log_i("[health] Refreshed MQTT config successfully");
              _broker = newBroker;
              _port = newPort;
              _mqttUser = newUser;
              _mqttPass = newPass;
              _mqtt.setServer(_broker.c_str(), _port);
              if (newCourt.length() > 0 && newCourt != _courtId) {
                _courtId = newCourt;
                snprintf(_displayTopic, sizeof(_displayTopic), "courts/%s/display", _courtId.c_str());
                snprintf(_statusTopic,  sizeof(_statusTopic),  "freq.led/courts/%s/status",  _courtId.c_str());
                log_i("[health] Court ID updated to: %s", _courtId.c_str());
              }
              _failedMqttAttempts = 0;
            }
          }
        }
      }
    }
  }

  _mqtt.loop();

  if (online) {
    unsigned long now = millis();
    if (now - _lastHeartbeat > 60000) {
      _lastHeartbeat = now;
      publishOnline();
    }
  }

  // --- TIME-BLOCKED PLAYLIST LOGIC ---
  if (!_blocks.empty() && _wasOnline) {
    long currentEpoch = time(NULL);
    if (currentEpoch < 1700000000) {
      currentEpoch = _serverTime + ((millis() - _localTimeAtServerSync) / 1000);
    }
    
    int newBlockIndex = -1;
    for (size_t i = 0; i < _blocks.size(); i++) {
      if (currentEpoch >= _blocks[i].startEpoch && currentEpoch < _blocks[i].endEpoch) {
        newBlockIndex = i;
        break;
      }
    }
    if (newBlockIndex == -1) {
      newBlockIndex = _blocks.size() - 1; // fallback to last block (idle)
    }

    if (newBlockIndex != _currentBlockIndex) {
      log_i("[mqtt] Transitioning to block index %d", newBlockIndex);
      _currentBlockIndex = newBlockIndex;
      _playlist = _blocks[newBlockIndex].pages;
      _currentPageIndex = 0;
      _lastPageChangeTime = millis();
      memset(_subpageIdx, 0, sizeof(_subpageIdx));
      memset(_lastSubChange, 0, sizeof(_lastSubChange));
      applyCurrentPage();

      // Reset Timer
      long remainingSec = _blocks[newBlockIndex].endEpoch - currentEpoch;
      if (remainingSec < 0) remainingSec = 0;
      long totalSec = _blocks[newBlockIndex].endEpoch - _blocks[newBlockIndex].startEpoch;
      
      // If it's the last block (Idle), don't show timer. (Or if total is extremely large)
      if (newBlockIndex < (int)_blocks.size() - 1 && totalSec < 86400) {
         _driver.setTimer(remainingSec * 1000, totalSec * 1000, millis());
      } else {
         _driver.clearTimer(); // Idle block: disable timer so {timer} shows nothing
      }
    }
  }

  if (!_playlist.empty() && _wasOnline) {
    unsigned long now = millis();
    unsigned long durationMs = (unsigned long)_playlist[_currentPageIndex].durationSeconds * 1000;
    if (durationMs == 0) durationMs = 10000;

    if (now - _lastPageChangeTime >= durationMs) {
      _lastPageChangeTime = now;
      if (_playlist.size() > 1) {
        _currentPageIndex = (_currentPageIndex + 1) % _playlist.size();
        memset(_subpageIdx, 0, sizeof(_subpageIdx));
        memset(_lastSubChange, 0, sizeof(_lastSubChange));
        applyCurrentPage();
      }
    }
  }

  // Sub-page cycling for all lines on the current page
  if (!_playlist.empty() && _wasOnline) {
    const auto& page = _playlist[_currentPageIndex];
    if (!_overrideActive) {
      unsigned long now = millis();
      for (int zi = 0; zi < page.zoneCount && zi < 3; zi++) {
        for (int li = 0; li < page.zones[zi].lineCount && li < 2; li++) {
          const auto& line = page.zones[zi].lines[li];
          if (line.subpages.size() <= 1) continue;
          int si = _subpageIdx[zi][li];
          if (si >= (int)line.subpages.size()) si = 0;
          const auto& sp = line.subpages[si];
          if (sp.durationMs > 0 && now - _lastSubChange[zi][li] >= sp.durationMs) {
            _lastSubChange[zi][li] = now;
            _subpageIdx[zi][li] = (si + 1) % line.subpages.size();
            applyCurrentPage();
            _driver.update();
          }
        }
      }
    }
  }

  // Override page rotation
  if (_overrideActive && !_overridePages.empty()) {
    unsigned long now = millis();
    size_t oIdx = _overridePageIndex % _overridePages.size();
    unsigned long pageDuration = (unsigned long)(_overridePages[oIdx].durationSeconds * 1000);
    if (pageDuration == 0) pageDuration = 10000;
    if (now - _overridePageChangeTime >= pageDuration) {
      _overridePageChangeTime = now;
      if (_overridePages.size() > 1) {
        _overridePageIndex = (_overridePageIndex + 1) % _overridePages.size();
        memset(_subpageIdx, 0, sizeof(_subpageIdx));
        memset(_lastSubChange, 0, sizeof(_lastSubChange));
        applyCurrentPage();
      }
    }
    // Sub-page cycling for override lines (use current index after any rotation)
    {
      size_t curOIdx = _overridePageIndex % _overridePages.size();
      const auto& opage = _overridePages[curOIdx];
      for (int zi = 0; zi < opage.zoneCount && zi < 3; zi++) {
        for (int li = 0; li < opage.zones[zi].lineCount && li < 2; li++) {
          const auto& line = opage.zones[zi].lines[li];
          if (line.subpages.size() <= 1) continue;
          int si = _subpageIdx[zi][li];
          if (si >= (int)line.subpages.size()) si = 0;
          const auto& sp = line.subpages[si];
          if (sp.durationMs > 0 && now - _lastSubChange[zi][li] >= sp.durationMs) {
            _lastSubChange[zi][li] = now;
            _subpageIdx[zi][li] = (si + 1) % line.subpages.size();
            applyCurrentPage();
            _driver.update();
          }
        }
      }
    }
  }

  _driver.update();
}

// ── Private ───────────────────────────────────────────────────────────────────

void MqttDisplayClient::applyCurrentPage() {
  // Override takes priority over playlist
  if (_overrideActive && !_overridePages.empty()) {
    size_t idx = _overridePageIndex % _overridePages.size();
    const DisplayPage& page = _overridePages[idx];
    if (page.zoneCount == 0) {
      _driver.clear();
      return;
    }
    ZoneRenderInfo rz[3];
    for (int zi = 0; zi < page.zoneCount && zi < 3; zi++) {
      rz[zi].panelStart = page.zones[zi].panelStart;
      rz[zi].panelEnd = page.zones[zi].panelEnd;
      rz[zi].lineCount = page.zones[zi].lineCount;
      rz[zi].scaleX = page.zones[zi].scaleX;
      rz[zi].scaleY = page.zones[zi].scaleY;
      rz[zi].valign = page.zones[zi].valign.c_str();
      rz[zi].borderCount = page.zones[zi].borderCount;
      for (int bri = 0; bri < page.zones[zi].borderCount && bri < 4; bri++) {
        rz[zi].borderRanges[bri] = page.zones[zi].borderRanges[bri];
      }
      for (int li = 0; li < page.zones[zi].lineCount && li < 2; li++) {
        const auto& srcLine = page.zones[zi].lines[li];
        int si = _subpageIdx[zi][li];
        if (srcLine.subpages.empty()) continue;
        if (si >= (int)srcLine.subpages.size()) si = 0;
        const auto& sp = srcLine.subpages[si];

        rz[zi].lines[li].text = sp.text.c_str();
        uint8_t r = 0, g = 255, b = 0;
        parseHexColor(sp.color, r, g, b);
        rz[zi].lines[li].r = r;
        rz[zi].lines[li].g = g;
        rz[zi].lines[li].b = b;
        rz[zi].lines[li].effect = sp.effect.c_str();
        rz[zi].lines[li].align = sp.align.c_str();
        rz[zi].lines[li].font = sp.font.c_str();
        rz[zi].lines[li].scrollSpeed = sp.scrollSpeed;
        rz[zi].lines[li].marginTop = srcLine.marginTop;
        rz[zi].lines[li].marginBottom = srcLine.marginBottom;
        rz[zi].lines[li].hasBgColor = !sp.bgColor.empty();
        if (rz[zi].lines[li].hasBgColor) {
          uint8_t br = 0, bg = 0, bb = 0;
          parseHexColor(sp.bgColor, br, bg, bb);
          rz[zi].lines[li].bgR = br; rz[zi].lines[li].bgG = bg; rz[zi].lines[li].bgB = bb;
        }
        rz[zi].lines[li].ruleCount = srcLine.ruleCount;
        for (int r = 0; r < srcLine.ruleCount; r++) {
          rz[zi].lines[li].rules[r] = srcLine.rules[r];
        }
        rz[zi].lines[li].scaleX = srcLine.scaleX;
        rz[zi].lines[li].scaleY = srcLine.scaleY;
        rz[zi].lines[li].spacing = srcLine.spacing;
      }
    }
    _driver.setZones(rz, page.zoneCount);
    return;
  }

  // Normal playlist logic
  if (_currentPageIndex >= _playlist.size()) return;

  const auto& page = _playlist[_currentPageIndex];

  if (page.zoneCount == 0) return;

  ZoneRenderInfo rz[3];
  for (int zi = 0; zi < page.zoneCount && zi < 3; zi++) {
    rz[zi].panelStart = page.zones[zi].panelStart;
    rz[zi].panelEnd = page.zones[zi].panelEnd;
    rz[zi].lineCount = page.zones[zi].lineCount;
    rz[zi].scaleX = page.zones[zi].scaleX;
    rz[zi].scaleY = page.zones[zi].scaleY;
    rz[zi].valign = page.zones[zi].valign.c_str();
    rz[zi].borderCount = page.zones[zi].borderCount;
    for (int bri = 0; bri < page.zones[zi].borderCount && bri < 4; bri++) {
      rz[zi].borderRanges[bri] = page.zones[zi].borderRanges[bri];
    }

    for (int li = 0; li < page.zones[zi].lineCount && li < 2; li++) {
      const auto& srcLine = page.zones[zi].lines[li];
      int si = _subpageIdx[zi][li];
      if (srcLine.subpages.empty()) continue;
      if (si >= (int)srcLine.subpages.size()) si = 0;
      const auto& sp = srcLine.subpages[si];

      rz[zi].lines[li].text = sp.text.c_str();
      uint8_t r = 0, g = 255, b = 0;
      parseHexColor(sp.color, r, g, b);
      rz[zi].lines[li].r = r;
      rz[zi].lines[li].g = g;
      rz[zi].lines[li].b = b;
      rz[zi].lines[li].effect = sp.effect.c_str();
      rz[zi].lines[li].align = sp.align.c_str();
      rz[zi].lines[li].font = sp.font.c_str();
      rz[zi].lines[li].bold = sp.bold;
      rz[zi].lines[li].scrollSpeed = sp.scrollSpeed;
      rz[zi].lines[li].marginTop = srcLine.marginTop;
      rz[zi].lines[li].marginBottom = srcLine.marginBottom;
      rz[zi].lines[li].hasBgColor = !sp.bgColor.empty();
      if (rz[zi].lines[li].hasBgColor) {
        uint8_t br = 0, bg = 0, bb = 0;
        parseHexColor(sp.bgColor, br, bg, bb);
        rz[zi].lines[li].bgR = br; rz[zi].lines[li].bgG = bg; rz[zi].lines[li].bgB = bb;
      }
      rz[zi].lines[li].ruleCount = srcLine.ruleCount;
      for (int r = 0; r < srcLine.ruleCount; r++) {
        rz[zi].lines[li].rules[r] = srcLine.rules[r];
      }
      rz[zi].lines[li].scaleX = srcLine.scaleX;
      rz[zi].lines[li].scaleY = srcLine.scaleY;
      rz[zi].lines[li].spacing = srcLine.spacing;
    }
  }

  _driver.setZones(rz, page.zoneCount);
}

void MqttDisplayClient::connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    log_i("[health] WiFi already connected. IP=%s  RSSI=%d dBm",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    return;
  }

  log_i("[health] Connecting WiFi: %s", _ssid.c_str());
  
  String msg = "WIFI CONNECTING...";
  _driver.showRow(0, msg.c_str());
  _driver.update();

  WiFi.mode(WIFI_STA);
  WiFi.begin(_ssid.c_str(), _password.c_str());
  unsigned long start = millis();
  unsigned long lastUpdate = 0;
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    if (millis() - lastUpdate >= 500) {
      _driver.update();
      lastUpdate = millis();
    }
    yield();
  }

  if (WiFi.status() == WL_CONNECTED) {
    log_i("[health] WiFi OK");
  } else {
    log_i("[health] WiFi FAILED");
    String msg = "WIFI FAILED - ";
#ifdef WOKWI_SIMULATION
    msg += "CHECK BROKER IP";
#else
    msg += "CHECK SSID & PASS";
#endif
    _driver.showRow(0, msg.c_str());
    _driver.update();
  }
}

bool MqttDisplayClient::connectMqtt() {
  if (_mqtt.connected()) return true;

  log_i("[health] Connecting MQTT...");
  _driver.showRow(0, "MQTT CONNECTING...");
  _driver.update();

  String clientId = "freq-led-" + String(ESP.getEfuseMac(), HEX);

  if (_mqtt.connect(clientId.c_str(), _mqttUser.c_str(), _mqttPass.c_str(),
                    _statusTopic, 1, true, "{\"status\":\"offline\"}")) {
    log_i("[health] MQTT OK");
    _mqtt.subscribe(_displayTopic, 1);
    _mqtt.subscribe("freq/display/discover", 1);
    _mqtt.subscribe(_cmdTopic, 1);
    log_i("[health] Subscribed to freq/display/discover and %s", _cmdTopic);
    log_i("[health] Subscribed to %s (retained msg will follow)", _displayTopic);
    publishOnline();
    return true;
  }

  log_i("[health] MQTT FAILED");
  return false;
}

void MqttDisplayClient::publishOnline() {
  char payload[192];
  snprintf(payload, sizeof(payload),
           "{\"status\":\"online\",\"ip\":\"%s\",\"rssi\":%d,\"court\":\"%s\",\"sim\":false}",
           WiFi.localIP().toString().c_str(), WiFi.RSSI(), _courtId.c_str());

  log_i("[mqtt] Publishing online status");
  _mqtt.publish(_statusTopic, (uint8_t*)payload, strlen(payload), true);
}

// ── DISCOVER & Command Handlers ──────────────────────────────────────────────

String MqttDisplayClient::buildStatusPayload() {
  JsonDocument doc;
  doc["mac"] = _mac;
  doc["ip"] = WiFi.localIP().toString();
  doc["courtId"] = _courtId;
  doc["rssi"] = WiFi.RSSI();
  doc["heap"] = ESP.getFreeHeap();
  doc["overrideActive"] = _overrideActive;
  String out;
  serializeJson(doc, out);
  return out;
}

void MqttDisplayClient::handleDiscover() {
  String payload = buildStatusPayload();
  _mqtt.publish("freq/display/discover/response", payload.c_str());
  log_i("[mqtt] Discover response sent: %s", payload.c_str());
}

void MqttDisplayClient::handleCmdMessage(uint8_t* payload, unsigned int len) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload, len, DeserializationOption::NestingLimit(20));
  if (error) {
    log_i("[mqtt-cmd] JSON parse failed: %s", error.c_str());
    return;
  }

  const char* action = doc["action"] | "";

  if (strcmp(action, "SET_COURT_ID") == 0) {
    const char* newId = doc["courtId"] | "";
    if (strlen(newId) > 0 && strcmp(newId, _courtId.c_str()) != 0) {
      log_i("[mqtt-cmd] SET_COURT_ID: '%s' -> '%s'", _courtId.c_str(), newId);
      if (_courtChangeCb) {
        _courtChangeCb(newId);
      }
    }
    return;
  }

  if (strcmp(action, "OVERRIDE") == 0) {
    _overridePages.clear();
    _overrideActive = false;
    JsonObject display = doc["display"];
    if (!display.isNull() && !display["pages"].isNull()) {
      for (JsonObject page : display["pages"].as<JsonArray>()) {
        DisplayPage p;
        p.durationSeconds = page["durationSeconds"] | 10;
        JsonArray zones = page["zones"];
        if (!zones.isNull()) {
          uint8_t zi = 0;
          for (JsonObject z : zones) {
            if (zi >= 3) break;
            DisplayZone& dz = p.zones[zi];
            dz.panelStart = z["panelStart"] | zi;
            dz.panelEnd = z["panelEnd"] | zi;
            dz.scaleX = z["scaleX"] | 0;
            dz.scaleY = z["scaleY"] | 0;
            dz.valign = z["valign"] | "middle";
            JsonArray lines = z["lines"];
            uint8_t li = 0;
            for (JsonObject l : lines) {
              if (li >= 2) break;
              {
                SubPage sp;
                sp.text = l["text"] | "";
                sp.color = l["color"] | "#FFFFFF";
                sp.bgColor = l["bgColor"] | "";
                sp.font = l["font"] | "";
                sp.effect = l["effect"] | "SCROLL";
                sp.align = l["align"] | "center";
                sp.scrollSpeed = l["scrollSpeed"] | 1.0f;
                sp.durationMs = 5000;
                dz.lines[li].subpages.push_back(sp);
              }
              dz.lines[li].marginTop = l["marginTop"] | 0;
              dz.lines[li].marginBottom = l["marginBottom"] | 2;
              li++;
            }
            dz.lineCount = li;
            dz.borderCount = 0;
            zi++;
          }
          p.zoneCount = zi;
        } else {
          p.zoneCount = 1;
          p.zones[0].panelStart = 0;
          p.zones[0].panelEnd = 2;
          p.zones[0].lineCount = 1;
          p.zones[0].borderCount = 0;
          p.zones[0].scaleX = 0;
          p.zones[0].scaleY = 0;
          p.zones[0].valign = "middle";
          {
            SubPage sp;
            sp.text = doc["display"]["message"] | "OVERRIDE";
            sp.color = "#FF0000";
            sp.effect = "SCROLL";
            sp.align = "center";
            sp.scrollSpeed = 1.0f;
            sp.durationMs = 5000;
            p.zones[0].lines[0].subpages.push_back(sp);
          }
          p.zones[0].lines[0].marginTop = 0;
          p.zones[0].lines[0].marginBottom = 2;
        }
        _overridePages.push_back(p);
      }
      _overrideActive = true;
      _overridePageIndex = 0;
      _overridePageChangeTime = millis();
      memset(_subpageIdx, 0, sizeof(_subpageIdx));
      memset(_lastSubChange, 0, sizeof(_lastSubChange));
      log_i("[mqtt-cmd] OVERRIDE: %d pages", _overridePages.size());
      // H1 fix: apply immediately so it appears without waiting for rotation timer
      applyCurrentPage();
      _driver.update();
    }
    return;
  }

  if (strcmp(action, "CLEAR_OVERRIDE") == 0) {
    _overridePages.clear();
    _overrideActive = false;
    _overridePageIndex = 0;
    _currentPageIndex = 0;
    _lastPageChangeTime = millis();
    memset(_subpageIdx, 0, sizeof(_subpageIdx));
    memset(_lastSubChange, 0, sizeof(_lastSubChange));
    log_i("[mqtt-cmd] CLEAR_OVERRIDE");
    if (!_playlist.empty()) {
      applyCurrentPage();
    }
    return;
  }
}

// ── Static MQTT callback ──────────────────────────────────────────────────────

void MqttDisplayClient::onMessage(char* topic, byte* payload, unsigned int length) {
  log_i("[mqtt] Received topic: %s", topic);
  if (_instance) {
    _instance->_lastTopic = String(topic);
    _instance->handleMessage(payload, length);
  }
}

void MqttDisplayClient::handleMessage(uint8_t* payload, unsigned int len) {
  // Route by topic
  if (_lastTopic == "freq/display/discover") {
    handleDiscover();
    return;
  }
  if (_lastTopic == _cmdTopic) {
    handleCmdMessage(payload, len);
    return;
  }

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload, len, DeserializationOption::NestingLimit(20));
  if (error) {
    log_i("[mqtt] JSON parse failed: %s", error.c_str());
    return;
  }

  _playlist.clear();

  if (doc["brightness"].is<uint8_t>()) {
    _driver.setBrightness(doc["brightness"].as<uint8_t>());
  }
  if (doc["rotation"].is<uint8_t>()) {
    _driver.setRotation(doc["rotation"].as<uint8_t>());
  }
  if (doc["scroll_speed"].is<uint16_t>()) {
    _driver.setScrollSpeed(doc["scroll_speed"].as<uint16_t>());
  }

  if (doc["courtId"].is<const char*>()) {
    const char* newId = doc["courtId"];
    if (strcmp(newId, _courtId.c_str()) != 0 && _courtChangeCb) {
      log_i("[mqtt] Court ID change requested: '%s' -> '%s'", _courtId.c_str(), newId);
      _courtChangeCb(newId);
      return;
    }
  }

  _blocks.clear();
  _currentBlockIndex = -1;
  _playlist.clear();
  _serverTime = doc["serverTime"] | 0;
  _localTimeAtServerSync = millis();

  JsonArray blocks = doc["blocks"];
  for (JsonObject blockObj : blocks) {
    DisplayBlock b;
    b.startEpoch = blockObj["startEpoch"] | 0;
    b.endEpoch = blockObj["endEpoch"] | 0;
    
    JsonArray pages = blockObj["pages"];
    for (JsonObject page : pages) {
      DisplayPage p;
      p.durationSeconds = page["durationSeconds"] | 10;

      JsonArray zones = page["zones"];
      if (!zones.isNull()) {
        p.zoneCount = 0;
        for (JsonObject zone : zones) {
          if (p.zoneCount >= 3) break;
          DisplayZone& z = p.zones[p.zoneCount];
          z.panelStart = zone["panelStart"] | 0;
          z.panelEnd = zone["panelEnd"] | 2;
          z.lineCount = 0;
          z.borderCount = 0;
          z.scaleX = zone["scaleX"] | 0;
          z.scaleY = zone["scaleY"] | 0;
          z.valign = zone["valign"] | "";

          JsonArray borderArr = zone["borderRows"];
          if (!borderArr.isNull()) {
            for (JsonObject br : borderArr) {
              if (z.borderCount >= 4) break;
              z.borderRanges[z.borderCount].start = br["start"] | 0;
              z.borderRanges[z.borderCount].end = br["end"] | 0;
              z.borderCount++;
            }
          }

          JsonArray lines = zone["lines"];
          if (!lines.isNull()) {
            for (JsonObject line : lines) {
              if (z.lineCount >= 2) break;
              ZoneLine& zl = z.lines[z.lineCount];
              
              JsonArray subpages = line["subpages"];
              if (!subpages.isNull()) {
                for (JsonVariant spv : subpages) {
                  SubPage sp;
                  sp.text = spv["text"].as<std::string>();
                  sp.color = spv["color"].as<std::string>();
                  sp.bgColor = spv["bgColor"].is<std::string>() ? spv["bgColor"].as<std::string>() : "";
                  sp.font = spv["font"].is<std::string>() ? spv["font"].as<std::string>() : "";
                  sp.bold = spv["bold"].is<bool>() ? spv["bold"].as<bool>() : false;
                  sp.effect = spv["effect"].is<std::string>() ? spv["effect"].as<std::string>() : "SCROLL";
                  sp.align = spv["align"].is<std::string>() ? spv["align"].as<std::string>() : "center";
                  sp.scrollSpeed = spv["scrollSpeed"].is<float>() ? spv["scrollSpeed"].as<float>() : 1.0f;
                  sp.durationMs = spv["durationMs"].is<uint16_t>() ? spv["durationMs"].as<uint16_t>() : 5000;
                  if (sp.durationMs == 0) sp.durationMs = 5000;
                  zl.subpages.push_back(sp);
                }
              } else {
                SubPage sp;
                sp.text = line["text"].as<std::string>();
                sp.color = line["color"].is<std::string>() ? line["color"].as<std::string>() : "#FFFFFF";
                sp.bgColor = line["bgColor"].is<std::string>() ? line["bgColor"].as<std::string>() : "";
                sp.font = line["font"].is<std::string>() ? line["font"].as<std::string>() : "";
                sp.bold = line["bold"].is<bool>() ? line["bold"].as<bool>() : false;
                sp.effect = line["effect"].is<std::string>() ? line["effect"].as<std::string>() : "SCROLL";
                sp.align = line["align"].is<std::string>() ? line["align"].as<std::string>() : "center";
                sp.scrollSpeed = line["scrollSpeed"].is<float>() ? line["scrollSpeed"].as<float>() : 1.0f;
                sp.durationMs = 5000;
                zl.subpages.push_back(sp);
              }
              zl.marginTop = line["marginTop"] | 0;
              zl.marginBottom = line["marginBottom"] | 2;
              
              if (!line["font"].isNull()) {
                zl.font = line["font"].as<std::string>();
              } else if (line["subpages"].is<JsonArray>() && line["subpages"].size() > 0 && !line["subpages"][0]["font"].isNull()) {
                zl.font = line["subpages"][0]["font"].as<std::string>();
              } else {
                zl.font = "default";
              }
              
              zl.scaleX = line["scaleX"] | 0;
              zl.scaleY = line["scaleY"] | 0;
              zl.spacing = line["spacing"] | 1;

              zl.ruleCount = 0;
              JsonArray rules = line["rules"];
              if (!rules.isNull()) {
                for (JsonObject rule : rules) {
                  if (zl.ruleCount >= 3) break;
                  zl.rules[zl.ruleCount].type = rule["type"].is<const char*>() ? rule["type"].as<String>() : "time_remaining";
                  
                  String opStr = rule["operator"].is<const char*>() ? rule["operator"].as<String>() : "<";
                  zl.rules[zl.ruleCount].op = opStr.length() > 0 ? opStr : "<";
                  
                  zl.rules[zl.ruleCount].value = rule["value"] | 0;
                  
                  if (rule["color"].is<const char*>()) {
                    zl.rules[zl.ruleCount].activeColor = true;
                    // parse color later in applyCurrentPage
                    String colStr = rule["color"].as<String>();
                    if (colStr.length() == 7 && colStr[0] == '#') {
                      long rgb = strtol(colStr.c_str() + 1, NULL, 16);
                      uint8_t r = (rgb >> 16) & 0xFF;
                      uint8_t g = (rgb >> 8) & 0xFF;
                      uint8_t b = rgb & 0xFF;
                      zl.rules[zl.ruleCount].color = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3); // 565 format
                    } else {
                      zl.rules[zl.ruleCount].color = 0; // Default to black or handled elsewhere
                    }
                  } else {
                    zl.rules[zl.ruleCount].activeColor = false;
                  }
                  
                  if (rule["effect"].is<const char*>()) {
                    zl.rules[zl.ruleCount].activeEffect = true;
                    zl.rules[zl.ruleCount].effect = rule["effect"].as<String>();
                  } else {
                    zl.rules[zl.ruleCount].activeEffect = false;
                  }

                  if (rule["align"].is<const char*>()) {
                    zl.rules[zl.ruleCount].activeAlign = true;
                    zl.rules[zl.ruleCount].align = rule["align"].as<String>();
                  } else {
                    zl.rules[zl.ruleCount].activeAlign = false;
                  }
                  
                  zl.ruleCount++;
                }
              }
              z.lineCount++;
            }
          }
          p.zoneCount++;
        }
      } else {
        // Legacy flat page -> single zone
        DisplayZone& z = p.zones[0];
        z.panelStart = 0;
        z.panelEnd = 2;
        z.lineCount = 1;
        z.borderCount = 0;
        z.scaleX = 0;
        z.scaleY = 0;
        z.valign = "middle";
        {
          SubPage sp;
          sp.text = page["text"] | "";
          sp.color = page["color"] | "#FFFFFF";
          sp.effect = page["effect"] | "SCROLL";
          sp.align = "center";
          sp.scrollSpeed = 1.0f;
          sp.durationMs = 5000;
          z.lines[0].subpages.push_back(sp);
        }
        z.lines[0].marginTop = 0;
        z.lines[0].marginBottom = 2;
        p.zoneCount = 1;
      }
      b.pages.push_back(p);
    }
    _blocks.push_back(b);
  }


  _currentPageIndex = 0;
  _lastPageChangeTime = millis();
  memset(_subpageIdx, 0, sizeof(_subpageIdx));
  memset(_lastSubChange, 0, sizeof(_lastSubChange));

  applyCurrentPage();
  _driver.update();
}

#endif // USE_HUB75
