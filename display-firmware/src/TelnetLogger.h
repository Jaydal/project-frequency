#pragma once
#include <Arduino.h>
#include <WiFi.h>

typedef void (*TelnetCommandCallback)(const String& cmd, const String& args);

class TelnetLogger {
public:
  TelnetLogger();
  void begin(uint16_t port = 23);
  void update();
  void printf(const char* fmt, ...);
  void setCommandCallback(TelnetCommandCallback cb) { _cmdCb = cb; }
  WiFiClient* client();
  bool hasClient() { return _client && _client.connected(); }
  void setPassword(const String& password) { _password = password; _authed = false; }
  bool isAuthenticated() const { return _authed; }
private:
  WiFiServer _server;
  WiFiClient _client;
  bool _active;
  String _lineBuf;
  TelnetCommandCallback _cmdCb = nullptr;
  String _password;
  bool _authed = false;
  void handleLine(const String& line);
};
