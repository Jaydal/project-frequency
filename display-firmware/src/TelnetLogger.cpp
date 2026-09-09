#include "TelnetLogger.h"
#include <esp_log.h>

static TelnetLogger* s_instance = nullptr;

static int custom_vprintf(const char* fmt, va_list args) {
  char buf[512];
  int n = vsnprintf(buf, sizeof(buf), fmt, args);
  if (n < 0) return n;
  if (n >= (int)sizeof(buf)) n = sizeof(buf) - 1;
  buf[n] = '\0';

  Serial.print(buf);

  TelnetLogger* self = s_instance;
  if (self) {
    WiFiClient* c = self->client();
    if (c && c->connected()) {
      c->print(buf);
    }
  }
  return n;
}

TelnetLogger::TelnetLogger() : _active(false) {}

WiFiClient* TelnetLogger::client() {
  return &_client;
}

void TelnetLogger::begin(uint16_t port) {
  s_instance = this;
  _server.close();
  _server.begin(port);
  _active = true;

  esp_log_set_vprintf(custom_vprintf);
  log_i("[telnet] Listening on port %d", port);
}

void TelnetLogger::update() {
  if (!_active) return;

  if (!_client || !_client.connected()) {
    _client = _server.accept();
    if (_client) {
      _authed = false;
      _client.printf("\r\n=== Freq Court Display ===\r\n");
      _client.printf("IP: %s | RSSI: %d dBm\r\n",
        WiFi.localIP().toString().c_str(), WiFi.RSSI());
      _client.printf("Type 'help' for commands\r\n");
      _client.printf("-----------------------------\r\n> ");
    }
    return;
  }

  while (_client.available()) {
    char c = _client.read();
    if (c == '\r') continue;
    if (c == '\n') {
      handleLine(_lineBuf);
      _lineBuf = "";
      _client.printf("> ");
    } else if (c == '\b' || c == 127) {
      if (_lineBuf.length() > 0) {
        _lineBuf.remove(_lineBuf.length() - 1);
        _client.printf("\b \b");
      }
    } else {
      // Cap the line buffer so a client streaming without newlines can't OOM us.
      if (_lineBuf.length() < 128) {
        _lineBuf += c;
        _client.printf("%c", c);
      }
    }
  }
}

void TelnetLogger::handleLine(const String& line) {
  String trimmed = line;
  trimmed.trim();
  if (trimmed.length() == 0) return;

  int space = trimmed.indexOf(' ');
  String cmd, args;
  if (space < 0) {
    cmd = trimmed;
    args = "";
  } else {
    cmd = trimmed.substring(0, space);
    args = trimmed.substring(space + 1);
    args.trim();
  }
  cmd.toLowerCase();

  if (cmd == "help") {
    _client.printf("Available commands:\r\n");
    _client.printf("  help                     - this list\r\n");
    _client.printf("  auth <password>          - authenticate for set.*/reboot\r\n");
    _client.printf("  set.court <id>           - change court ID (saves + reboots)\r\n");
    _client.printf("  set.brightness <0-255>   - set display brightness\r\n");
    _client.printf("  set.color #RRGGBB        - set accent color\r\n");
    _client.printf("  reboot                   - restart the device\r\n");
    _client.printf("  status                   - show current config\r\n");
    return;
  }

  if (cmd == "auth") {
    if (_password.length() > 0 && args == _password) {
      _authed = true;
      _client.printf("Authenticated\r\n");
    } else {
      _authed = false;
      _client.printf("Authentication failed\r\n");
    }
    return;
  }

  if (_cmdCb) {
    _cmdCb(cmd, args);
  } else {
    _client.printf("Unknown command: %s\r\n", cmd.c_str());
  }
}

void TelnetLogger::printf(const char* fmt, ...) {
  va_list args;
  va_start(args, fmt);
  custom_vprintf(fmt, args);
  va_end(args);
}
