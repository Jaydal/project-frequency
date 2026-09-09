#pragma once
#ifdef HD_WF2

#include <Arduino.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include "IDisplayDriver.h"

class ConfigPortal {
public:
  ConfigPortal();

  bool isConfigured();

  bool connectSavedWiFi(uint8_t maxRetries = 3);

  void startPortal();

  void update();

  bool isActive() { return _active; }

  void setDisplayDriver(IDisplayDriver* driver) { _driver = driver; }

  bool saveField(const String& key, const String& value);
  bool saveField(const String& key, uint8_t value);
  bool saveField(const String& key, uint16_t value);

  String getPortalSSID();

  String getWifiSsid();
  String getWifiPass();
  String getMqttBroker();
  uint16_t getMqttPort();
  String getMqttUser();
  String getMqttPass();
  String getServerUrl();
  String getApiKey();
  bool fetchMqttConfig(int* outStatusCode = nullptr);
  int getLastFetchStatus() const { return _lastFetchStatus; }
  String getLastFetchError() const { return _lastFetchError; }
  String getCourtId();
  uint8_t getBrightness();
  String getColorHex();
  String getOtaPass();

  void factoryReset();

private:
  Preferences _prefs;
  WebServer*   _server;
  DNSServer*   _dns;
  bool         _active;
  String       _cachedNetworks;
  IDisplayDriver* _driver = nullptr;

  String _wifiSsid;
  String _wifiPass;
  String _mqttBroker;
  uint16_t _mqttPort;
  String _mqttUser;
  String _mqttPass;
  String _serverUrl;
  String _apiKey;
  String _otaPass;
  String _courtId;
  uint8_t _brightness = 0;
  String _colorHex;
  int _lastFetchStatus = 0;
  String _lastFetchError;

  bool loadFields();
  bool saveFields(const String& ssid, const String& pass, const String& broker,
                  uint16_t port, const String& user, const String& mpwd, const String& court, uint8_t brightness, const String& colorHex);

  void handleRoot();
  void handleSave();
  void handleNotFound();
  void handleTestDisplay();
  void handleTestSequence();
  String scanNetworks();
  void sendHtmlChunked();
};

#endif // HD_WF2
