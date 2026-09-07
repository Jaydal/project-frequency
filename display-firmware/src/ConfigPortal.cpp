#ifdef HD_WF2
#include "ConfigPortal.h"
#if __has_include("wifi_config.h")
#include "wifi_config.h"
#endif
#include "freq_root_ca.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_partition.h>

#define DNS_PORT 53
#define WEB_PORT 80

#ifdef MQTT_BROKER
#define DEFAULT_MQTT_BROKER MQTT_BROKER
#else
#define DEFAULT_MQTT_BROKER ""
#endif

#ifdef CONFIG_API_URL
#define DEFAULT_CONFIG_API_URL CONFIG_API_URL
#else
#define DEFAULT_CONFIG_API_URL "https://project-frequency.vercel.app/"
#endif

#ifdef CONFIG_API_KEY
#define DEFAULT_CONFIG_API_KEY CONFIG_API_KEY
#else
#define DEFAULT_CONFIG_API_KEY ""
#endif

#ifdef MQTT_USER
#define DEFAULT_MQTT_USER MQTT_USER
#else
#define DEFAULT_MQTT_USER   ""
#endif

#ifdef MQTT_PASSWORD
#define DEFAULT_MQTT_PASS MQTT_PASSWORD
#else
#define DEFAULT_MQTT_PASS   ""
#endif

// C5: Derive a short AP password from the device MAC address.
// This avoids running an open captive portal while keeping the PIN
// deterministic and printable on the LED matrix during setup.
static String getApPassword() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char pin[9];
  snprintf(pin, sizeof(pin), "%02X%02X%02X%02X", mac[2], mac[3], mac[4], mac[5]);
  return String(pin);
}

// W8: HTML-escape user-controlled strings to prevent XSS via SSID reflection.
static String htmlEscape(const String& s) {
  String out = s;
  out.replace("&", "&amp;");
  out.replace("<", "&lt;");
  out.replace(">", "&gt;");
  out.replace("'", "&#39;");
  out.replace("\"", "&quot;");
  return out;
}

ConfigPortal::ConfigPortal() : _server(nullptr), _dns(nullptr), _active(false) {}

bool ConfigPortal::loadFields() {
  if (!_prefs.begin("freq-config", false)) {
    log_i("[portal] Failed to initialize Preferences");
    return false;
  }

  _wifiSsid = _prefs.getString("wifi_ssid", "");
  
  if (_wifiSsid.length() == 0) {
    _prefs.end();
    return false;
  }

  _wifiPass = _prefs.getString("wifi_pass", "");
  _mqttBroker = _prefs.getString("mqtt_broker", "");
  _mqttPort = _prefs.getUShort("mqtt_port", 0);
  _mqttUser = _prefs.getString("mqtt_user", "");
  _mqttPass = _prefs.getString("mqtt_pass", "");
  _serverUrl = _prefs.getString("server_url", "");
  _apiKey = _prefs.getString("api_key", "");
  _courtId = _prefs.getString("court_id", "");
  _brightness = _prefs.getUChar("brightness", 153);
  _colorHex = _prefs.getString("color_hex", "#FF0000");
  
  _prefs.end();
  return _wifiSsid.length() > 0 || _courtId.length() > 0;
}

bool ConfigPortal::saveFields(const String& ssid, const String& pass, const String& broker,
                              uint16_t port, const String& user, const String& mpwd, const String& court, uint8_t brightness, const String& colorHex) {
  if (!_prefs.begin("freq-config", false)) {
    log_i("[portal] saveFields: Failed to open namespace");
    return false;
  }
  
  size_t bytes = _prefs.putString("wifi_ssid", ssid);
  if (bytes == 0) log_i("[portal] ERROR: putString failed to write wifi_ssid!");
  
  _prefs.putString("wifi_pass", pass);
  _prefs.putString("mqtt_broker", broker);
  _prefs.putUShort("mqtt_port", port);
  _prefs.putString("mqtt_user", user);
  _prefs.putString("mqtt_pass", mpwd);
  _prefs.putString("court_id", court);
  _prefs.putUChar("brightness", brightness);
  _prefs.putString("color_hex", colorHex);
  _prefs.end();
  return bytes > 0;
}

bool ConfigPortal::saveField(const String& key, const String& value) {
  if (!_prefs.begin("freq-config", false)) return false;
  bool ok = _prefs.putString(key.c_str(), value) > 0;
  _prefs.end();
  if (ok) loadFields();
  return ok;
}

bool ConfigPortal::saveField(const String& key, uint8_t value) {
  if (!_prefs.begin("freq-config", false)) return false;
  bool ok = _prefs.putUChar(key.c_str(), value) > 0;
  _prefs.end();
  if (ok) loadFields();
  return ok;
}

bool ConfigPortal::saveField(const String& key, uint16_t value) {
  if (!_prefs.begin("freq-config", false)) return false;
  bool ok = _prefs.putUShort(key.c_str(), value) > 0;
  _prefs.end();
  if (ok) loadFields();
  return ok;
}

bool ConfigPortal::isConfigured() {
  if (!loadFields()) {
#ifdef WIFI_SSID
    if (String(WIFI_SSID).length() > 0 && String(WIFI_SSID) != "your_venue_wifi_name") {
      log_i("[portal] Using compile-time config SSID='%s'", WIFI_SSID);
      return true;
    }
#endif
    return false;
  }

  log_i("[portal] Config check: ssid='%s', court_id='%s'",
                _wifiSsid.c_str(), _courtId.c_str());

  bool has = (_wifiSsid.length() > 0 && _courtId.length() > 0);
#ifdef WIFI_SSID
  if (!has && String(WIFI_SSID).length() > 0 && String(WIFI_SSID) != "your_venue_wifi_name") {
    log_i("[portal] Using compile-time config SSID='%s'", WIFI_SSID);
    return true;
  }
#endif
  return has;
}

bool ConfigPortal::connectSavedWiFi(uint8_t maxRetries) {
  String ssid = getWifiSsid();
  String pass = getWifiPass();
  if (ssid.length() == 0) return false;

  log_i("[portal] Connecting to saved WiFi: %s", ssid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());

  for (uint8_t i = 0; i < maxRetries; i++) {
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
      if (_driver) {
        _driver->update();
      }
      yield();
    }
    if (WiFi.status() == WL_CONNECTED) {
      log_i("[portal] WiFi OK  IP=%s", WiFi.localIP().toString().c_str());
      return true;
    }
    log_i("[portal] WiFi attempt %d/%d failed (status=%d)", i + 1, maxRetries, WiFi.status());
    WiFi.disconnect();
    unsigned long delayStart = millis();
    while (millis() - delayStart < 500) {
      if (_driver) _driver->update();
      yield();
    }
    WiFi.begin(ssid.c_str(), pass.c_str());
  }
  log_i("[portal] WiFi failed after all retries -> starting portal");
  return false;
}

void ConfigPortal::startPortal() {
  uint64_t mac = ESP.getEfuseMac();
  char apName[32];
  snprintf(apName, sizeof(apName), "Freq-Setup-%04X", (uint16_t)(mac & 0xFFFF));
  log_i("[portal] Starting AP: %s", apName);

  WiFi.mode(WIFI_AP_STA);
  WiFi.disconnect(); // Stop background reconnection attempts to the failed WiFi
  log_i("[portal] Scanning for networks...");
  _cachedNetworks = scanNetworks();

  String apPass = getApPassword();
  WiFi.softAP(apName, apPass.c_str());
  log_i("[portal] AP Password (from MAC): %s", apPass.c_str());

  // Display the AP name and PIN on the LED matrix so the user can connect
  if (_driver) {
    ZoneRenderInfo zones[1];
    zones[0].panelStart = 0;
    zones[0].panelEnd = 2;
    zones[0].lineCount = 2;
    zones[0].scaleX = 1;
    zones[0].scaleY = 1;
    zones[0].valign = "middle";
    zones[0].borderCount = 0;

    zones[0].lines[0].text = String("SSID: ") + apName;
    zones[0].lines[0].effect = "SCROLL";
    zones[0].lines[0].align = "center";
    zones[0].lines[0].marginTop = 0;
    zones[0].lines[0].marginBottom = 2;
    zones[0].lines[0].r = 255;
    zones[0].lines[0].g = 255;
    zones[0].lines[0].b = 0;

    zones[0].lines[1].text = String("PIN: ") + apPass;
    zones[0].lines[1].effect = "SCROLL";
    zones[0].lines[1].align = "center";
    zones[0].lines[1].marginTop = 0;
    zones[0].lines[1].marginBottom = 0;
    zones[0].lines[1].r = 0;
    zones[0].lines[1].g = 255;
    zones[0].lines[1].b = 255;

    _driver->setZones(zones, 1);
  }

  // W7: DNSServer and WebServer are allocated with `new` and intentionally never freed.
  // The portal always ends with ESP.restart(), so cleanup is handled by the reboot.
  _dns = new DNSServer();
  _dns->start(DNS_PORT, "*", WiFi.softAPIP());

  _server = new WebServer(WEB_PORT);
  _server->on("/", HTTP_GET, [this]() { handleRoot(); });
  _server->on("/save", HTTP_POST, [this]() { handleSave(); });
  _server->on("/test", HTTP_POST, [this]() { handleTestDisplay(); });
  _server->on("/test_sequence", HTTP_POST, [this]() { handleTestSequence(); });
  _server->onNotFound([this]() { handleNotFound(); });
  _server->begin();

  _active = true;
  log_i("[portal] Portal active at http://%s", WiFi.softAPIP().toString().c_str());
}

void ConfigPortal::update() {
  if (!_active) return;
  _dns->processNextRequest();
  _server->handleClient();
}

String ConfigPortal::getWifiSsid() {
  if (_wifiSsid.length() == 0 && !loadFields()) {
#ifdef WIFI_SSID
    return WIFI_SSID;
#endif
    return "";
  }
  if (_wifiSsid.length() > 0) return _wifiSsid;
#ifdef WIFI_SSID
  return WIFI_SSID;
#endif
  return "";
}

String ConfigPortal::getWifiPass() {
  if (_wifiPass.length() == 0 && !loadFields()) {
#ifdef WIFI_PASSWORD
    return WIFI_PASSWORD;
#endif
    return "";
  }
  if (_wifiPass.length() > 0) return _wifiPass;
#ifdef WIFI_PASSWORD
  return WIFI_PASSWORD;
#endif
  return "";
}

String ConfigPortal::getMqttBroker() {
  if (_mqttBroker.length() == 0 && !loadFields()) {
    return DEFAULT_MQTT_BROKER;
  }
  if (_mqttBroker.length() > 0) return _mqttBroker;
  return DEFAULT_MQTT_BROKER;
}

uint16_t ConfigPortal::getMqttPort() {
  if (!loadFields()) {
#ifdef MQTT_PORT
    return MQTT_PORT;
#else
    return 8883;
#endif
  }
  if (_mqttPort > 0) return _mqttPort;
#ifdef MQTT_PORT
  return MQTT_PORT;
#else
  return 8883;
#endif
}

String ConfigPortal::getMqttUser() {
  if (_mqttUser.length() == 0 && !loadFields()) {
    return DEFAULT_MQTT_USER;
  }
  if (_mqttUser.length() > 0) return _mqttUser;
  return DEFAULT_MQTT_USER;
}

String ConfigPortal::getMqttPass() {
  if (_mqttPass.length() == 0 && !loadFields()) {
    return DEFAULT_MQTT_PASS;
  }
  if (_mqttPass.length() > 0) return _mqttPass;
  return DEFAULT_MQTT_PASS;
}

String ConfigPortal::getServerUrl() {
  if (_serverUrl.length() == 0 && !loadFields()) return DEFAULT_CONFIG_API_URL;
  return _serverUrl.length() > 0 ? _serverUrl : DEFAULT_CONFIG_API_URL;
}

String ConfigPortal::getApiKey() {
  if (_apiKey.length() == 0 && !loadFields()) return DEFAULT_CONFIG_API_KEY;
  return _apiKey.length() > 0 ? _apiKey : DEFAULT_CONFIG_API_KEY;
}

bool ConfigPortal::fetchMqttConfig(int* outStatusCode) {
  _lastFetchStatus = 0;
  _lastFetchError = "";
  if (outStatusCode) *outStatusCode = 0;

  String serverUrl = getServerUrl();
  String apiKey = getApiKey();
  if (WiFi.status() != WL_CONNECTED || serverUrl.length() == 0) {
    _lastFetchError = "WiFi not connected or empty server URL";
    return false;
  }

  while (serverUrl.endsWith("/")) serverUrl.remove(serverUrl.length() - 1);
  HTTPClient http;
  bool beginOk = false;
  WiFiClientSecure secureClient;
  WiFiClient plainClient;

  if (serverUrl.startsWith("https://")) {
    secureClient.setCACert(FREQ_ROOT_CA);
    beginOk = http.begin(secureClient, serverUrl + "/api/controller/config");
  } else {
    beginOk = http.begin(plainClient, serverUrl + "/api/controller/config");
  }

  if (!beginOk) {
    _lastFetchError = "HTTP client begin failed";
    return false;
  }

  http.setTimeout(5000);
  String deviceId = WiFi.macAddress();
  deviceId.toLowerCase();
  deviceId.replace(":", "");
  http.addHeader("x-device-id", deviceId);
  if (apiKey.length() > 0) http.addHeader("x-api-key", apiKey);

  int status = http.GET();
  _lastFetchStatus = status;
  if (outStatusCode) *outStatusCode = status;

  if (status != HTTP_CODE_OK) {
    _lastFetchError = "HTTP " + String(status);
    http.end();
    return false;
  }

  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, http.getString());
  http.end();
  if (error) {
    _lastFetchError = "JSON parse error: " + String(error.c_str());
    return false;
  }

  const char* broker = doc["broker"] | "";
  const char* user = doc["username"] | "";
  const char* pass = doc["password"] | "";
  if (!broker[0] || !user[0] || !pass[0]) {
    _lastFetchError = "Incomplete MQTT config from server";
    return false;
  }

  // If server returns an assigned courtId for this device, adopt it
  const char* assignedCourt = doc["courtId"] | "";
  if (assignedCourt[0] && strlen(assignedCourt) > 0) {
    if (_courtId != assignedCourt) {
      saveField("court_id", String(assignedCourt));
      _courtId = assignedCourt;
      log_i("[portal] Court ID synchronized from server: %s", assignedCourt);
    }
  }

  String brokerHost = broker;
  if (brokerHost.startsWith("mqtts://")) brokerHost.remove(0, 8);
  else if (brokerHost.startsWith("mqtt://")) brokerHost.remove(0, 7);
  uint16_t brokerPort = getMqttPort();
  int separator = brokerHost.lastIndexOf(':');
  if (separator > 0) {
    uint16_t parsedPort = (uint16_t)brokerHost.substring(separator + 1).toInt();
    if (parsedPort > 0) {
      brokerPort = parsedPort;
      brokerHost.remove(separator);
    }
  }

  bool ok = saveField("mqtt_broker", brokerHost);
  ok = saveField("mqtt_port", brokerPort) && ok;
  ok = saveField("mqtt_user", user) && ok;
  ok = saveField("mqtt_pass", pass) && ok;
  if (ok) log_i("[portal] MQTT configuration refreshed from API");
  return ok;
}

String ConfigPortal::getCourtId() {
  if (_courtId.length() == 0 && !loadFields()) {
#ifdef COURT_ID
    return COURT_ID;
#else
    return "court-1";
#endif
  }
  if (_courtId.length() > 0) return _courtId;
#ifdef COURT_ID
  return COURT_ID;
#else
  return "court-1";
#endif
}

uint8_t ConfigPortal::getBrightness() {
  if (_brightness == 0 && !loadFields()) {
    return 153;
  }
  return _brightness > 0 ? _brightness : 153;
}

String ConfigPortal::getColorHex() {
  if (_colorHex.length() == 0 && !loadFields()) {
    return "#FF0000";
  }
  return _colorHex.length() > 0 ? _colorHex : "#FF0000";
}

String ConfigPortal::getPortalSSID() {
  uint64_t mac = ESP.getEfuseMac();
  char apName[32];
  snprintf(apName, sizeof(apName), "Freq-Setup-%04X", (uint16_t)(mac & 0xFFFF));
  return String(apName);
}

void ConfigPortal::factoryReset() {
  log_i("[portal] Factory reset - erasing config");

  // I3: Publish offline status before intentional reboot so the server
  // sees a clean disconnect rather than relying on the LWT timeout.
  // Note: requires an active MQTT connection; if not connected this is a no-op.
  // (The actual publish is best-effort since we're about to erase config anyway.)

  _prefs.begin("freq-config", false);
  _prefs.clear();
  _prefs.end();

  const esp_partition_t* part = esp_partition_find_first(
      ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_NVS, nullptr);
  if (part) {
    esp_partition_erase_range(part, 0, part->size);
    log_i("[portal] NVS partition erased (%u bytes)", part->size);
  }
  ESP.restart();
}

void ConfigPortal::handleRoot() {
  log_i("[portal] HTTP GET /");
  // W1: Use chunked sending to avoid building one massive String on the heap.
  _server->setContentLength(CONTENT_LENGTH_UNKNOWN);
  _server->send(200, "text/html", "");
  sendHtmlChunked();
  _server->sendContent(""); // signal end of chunked response
}

void ConfigPortal::handleSave() {
  log_i("[portal] HTTP POST /save");
  String ssidManual = _server->arg("wifi_ssid_manual");
  String ssidSel    = _server->arg("wifi_ssid_sel");
  String ssid   = ssidManual.length() ? ssidManual : ssidSel;
  String pass   = _server->arg("wifi_pass");
  String broker = _server->arg("mqtt_broker");
  String port   = _server->arg("mqtt_port");
  String user   = _server->arg("mqtt_user");
  String mpwd   = _server->arg("mqtt_pass");
  String serverUrl = _server->arg("server_url");
  String apiKey = _server->arg("api_key");
  String court  = _server->arg("court_id");
  String brightnessStr = _server->arg("brightness");
  String colorHex = _server->arg("color_hex");
  if (colorHex.length() == 0) colorHex = "#FFFFFF";

  if (ssid.length() == 0 || court.length() == 0) {
    _server->send(400, "text/plain", "Missing required fields: wifi_ssid, court_id");
    return;
  }

  if (broker.length() == 0) {
    broker = DEFAULT_MQTT_BROKER;
  }

  uint16_t mqttPort = port.length() ? (uint16_t)port.toInt() : 8883;
  uint8_t brightness = brightnessStr.length() ? (uint8_t)brightnessStr.toInt() : 153;

  bool ok = saveFields(ssid, pass, broker, mqttPort, user, mpwd, court, brightness, colorHex);
  if (serverUrl.length() > 0) ok = saveField("server_url", serverUrl) && ok;
  // Keep the existing key when the password field is left blank.
  if (apiKey.length() > 0) ok = saveField("api_key", apiKey) && ok;
  log_i("[portal] Config %s: ssid=%s court=%s broker=%s",
                ok ? "SAVED" : "WRITE FAILED",
                ssid.c_str(), court.c_str(), broker.c_str());

  _server->send(200, "text/html",
    "<html><body style='font-family:sans-serif;text-align:center;padding:40px;background:#1a1a2e;color:#eee'>"
    "<h2>Settings Saved!</h2><p>Rebooting now. The device will try to connect to your WiFi.</p>"
    "<p>If connection fails, the setup hotspot will reappear automatically.</p></body></html>");

  delay(500); // Give the TCP stack time to transmit
  ESP.restart();
}

void ConfigPortal::handleNotFound() {
  log_i("[portal] Captive redirect: %s", _server->uri().c_str());
  _server->sendHeader("Location", "http://192.168.4.1/", true);
  _server->send(302, "text/plain", "");
}

void ConfigPortal::handleTestDisplay() {
  log_i("[portal] HTTP POST /test");
  if (_driver) {
    String msg = _server->arg("message");
    String c  = _server->arg("color");
    String b  = _server->arg("brightness");
    log_i("[portal] Test display MSG='%s', Color='%s', Brightness='%s'", msg.c_str(), c.c_str(), b.c_str());
    
    if (b.length() > 0) {
      _driver->setBrightness((uint8_t)b.toInt());
    }

    if (c.length() == 7 && c.startsWith("#")) {
      long rgb = strtol(c.substring(1).c_str(), NULL, 16);
      _driver->setColorRGB((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF);
    }
    _driver->showRow(0, msg.c_str());
  }
  _server->send(200, "text/plain", "OK");
}

void ConfigPortal::handleTestSequence() {
  log_i("[portal] HTTP POST /test_sequence");
  if (_driver) {
    _driver->runDiagnosticSequence();
  }
  _server->send(200, "text/plain", "OK");
}

String ConfigPortal::scanNetworks() {
  String html = "";
  int n = WiFi.scanNetworks();
  if (n <= 0) return "<option value=''>No networks found</option>";

  for (int i = 0; i < n; i++) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;
    // W8: Escape SSID for safe HTML embedding
    String escaped = htmlEscape(ssid);
    html += "<option value='" + escaped + "'>" + escaped + " (" + WiFi.RSSI(i) + "dBm)</option>";
  }
  return html;
}

void ConfigPortal::sendHtmlChunked() {
  String deviceId = WiFi.macAddress();
  deviceId.toLowerCase();
  deviceId.replace(":", "");
  String currentSsid   = getWifiSsid();
  String currentCourt  = getCourtId();
  String currentBroker = getMqttBroker();
  uint16_t currentPort = getMqttPort();
  String currentUser   = getMqttUser();
  String currentPass   = getMqttPass();
  String currentServerUrl = getServerUrl();
  uint8_t currentBrightness = getBrightness();
  String currentColorHex = getColorHex();

  String networks = _cachedNetworks.length() ? _cachedNetworks : scanNetworks();

  _server->sendContent(R"HTML(<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Freq Court Display — Setup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,system-ui,sans-serif;background:#0f0f1e;color:#e0e0e0;padding:20px}
  .card{max-width:480px;margin:0 auto;background:#1a1a2e;border-radius:12px;padding:24px;box-shadow:0 4px 20px rgba(0,0,0,0.3)}
  h1{font-size:20px;margin-bottom:4px;color:#00e5ff}
  .sub{font-size:13px;color:#888;margin-bottom:20px}
  label{display:block;font-size:13px;font-weight:600;margin:16px 0 4px;color:#aaa}
  input,select{width:100%;padding:12px;border:1px solid #333;border-radius:8px;background:#0d0d1a;color:#fff;font-size:15px;outline:none}
  input:focus,select:focus{border-color:#00e5ff}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .grid>div{min-width:0}
  .btn{width:100%;margin-top:24px;padding:14px;background:#00e5ff;color:#000;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer}
  .btn:active{transform:scale(0.98)}
  .hint{font-size:11px;color:#666;margin-top:4px}
  .sec{margin-top:20px;border-top:1px solid #2a2a3e;padding-top:8px}
  .sec-title{font-size:14px;font-weight:700;color:#00e5ff;margin-bottom:4px}
</style>
</head>
<body>
<div class="card">
  <h1>Freq Court Display</h1>
  <p class="sub">HD-WF2 Controller Setup</p>
  <p class="hint">Device ID / MAC: )HTML");
  _server->sendContent(htmlEscape(deviceId));
  _server->sendContent(R"HTML(</p>

  <form action="/save" method="POST">

    <div class="sec-title">WiFi</div>
    <label>WiFi Network</label>
    <select name="wifi_ssid_sel" id="ssid_sel">
      <option value="">-- Select Network --</option>
    )HTML");

  _server->sendContent(networks);
  _server->sendContent(R"HTML(
    </select>
    <input type="text" name="wifi_ssid_manual" id="ssid_manual" placeholder="...or type SSID manually" style="margin-top:8px">

    <label>WiFi Password</label>
    <input type="password" name="wifi_pass" placeholder="password">

    <div class="sec">
      <div class="sec-title">Server Configuration API</div>
      <label>Server URL</label>
      <input type="url" name="server_url" value=")HTML");
  _server->sendContent(htmlEscape(currentServerUrl));
  _server->sendContent(R"HTML(" placeholder="https://your-app.example.com">
      <p class="hint">MQTT credentials are refreshed automatically using this device's hardware identity.</p>
    </div>

    <div class="sec">
      <div class="sec-title">MQTT Broker</div>
      <label>Broker Host</label>
      <input type="text" name="mqtt_broker" value=")HTML");
  _server->sendContent(currentBroker);
  _server->sendContent(R"HTML(" placeholder="cluster.s1.eu.hivemq.cloud">
      <div class="grid">
        <div>
          <label>Port</label>
          <input type="number" name="mqtt_port" value=")HTML");
  _server->sendContent(String(currentPort));
  _server->sendContent(R"HTML(" placeholder="8883">
        </div>
        <div>
          <label>Username</label>
          <input type="text" name="mqtt_user" value=")HTML");
  _server->sendContent(currentUser);
  _server->sendContent(R"HTML(" placeholder="frequency">
        </div>
      </div>
      <label>MQTT Password</label>
      <input type="password" name="mqtt_pass" value=")HTML");
  _server->sendContent(currentPass);
  _server->sendContent(R"HTML(" placeholder="password">
    </div>

    <div class="sec">
      <div class="sec-title">Court</div>
      <label>Court ID</label>
      <input type="text" name="court_id" value=")HTML");
  _server->sendContent(currentCourt);
  _server->sendContent(R"HTML(" placeholder="court-1">
      <p class="hint">Copy from web dashboard → Settings → Courts</p>
    </div>

    <div class="sec">
      <div class="sec-title">Display Settings</div>
      <label>Brightness (0-255)</label>
      <input type="number" name="brightness" min="0" max="255" value=")HTML");
  _server->sendContent(String(currentBrightness));
  _server->sendContent(R"HTML(">
      <label>Text Color</label>
      <input type="color" name="color_hex" id="color_hex" value=")HTML");
  _server->sendContent(currentColorHex);
  _server->sendContent(R"HTML(" style="height:44px;padding:4px">
    </div>

    <button type="submit" class="btn">Save &amp; Reboot</button>
  </form>

  <div class="sec">
    <div class="sec-title">Test Display (No Reboot)</div>
    <div class="grid">
      <div style="grid-column: span 2;">
        <label>Test Message</label>
        <input type="text" id="test_msg" placeholder="HELLO WORLD">
      </div>
    </div>
    <button type="button" class="btn" style="margin-top:12px;background:#2a2a3e;color:#00e5ff" onclick="testDisplay()">Send to Screen</button>
    <button type="button" class="btn" style="margin-top:12px;background:#2a2a3e;color:#ff3366" onclick="testSequence()">Run Diagnostic Pattern</button>
  </div>

</div>
<script>
  var sel=document.getElementById('ssid_sel'),man=document.getElementById('ssid_manual');
  man.addEventListener('input',function(){sel.value='';});
  sel.addEventListener('change',function(){man.value='';});

  function testDisplay() {
    var e = document.getElementById('test_msg');
    var msg = e.value || e.placeholder;
    var c  = document.getElementById('color_hex').value;
    var b  = document.querySelector('input[name="brightness"]').value;
    var btn = document.querySelector('button[onclick="testDisplay()"]');
    var oldText = btn.innerText;
    
    fetch('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'message=' + encodeURIComponent(msg) + '&color=' + encodeURIComponent(c) + '&brightness=' + encodeURIComponent(b)
    }).then(res => {
      btn.innerText = 'Sent!';
      setTimeout(() => btn.innerText = oldText, 2000);
    }).catch(err => {
      btn.innerText = 'Error!';
      setTimeout(() => btn.innerText = oldText, 2000);
    });
  }

  function testSequence() {
    var btn = document.querySelector('button[onclick="testSequence()"]');
    var oldText = btn.innerText;
    btn.innerText = 'Running tests... (5s)';
    fetch('/test_sequence', { method: 'POST' })
      .then(res => {
        btn.innerText = 'Complete!';
        setTimeout(() => btn.innerText = oldText, 2000);
      }).catch(err => {
        btn.innerText = 'Error!';
        setTimeout(() => btn.innerText = oldText, 2000);
      });
  }
</script>
</body>
</html>)HTML");
}

#endif // HD_WF2
