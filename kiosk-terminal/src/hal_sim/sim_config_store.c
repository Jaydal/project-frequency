#include "../data/kiosk_config.h"
#include <stdio.h>
#include <string.h>

/* Simulator persistence: a small key=value file in the working directory,
 * standing in for the ESP32-S3's NVS flash. */

#define CONFIG_PATH   "kiosk_config.ini"
#define DEFAULTS_PATH "kiosk_defaults.ini"  /* optional, git-ignored, prefill source */
#define DEFAULT_MQTT_BROKER "mqtts://594d608708f34a7b9607e86258c3b3ae.s1.eu.hivemq.cloud:8883"

static void read_value(const char *line, const char *key, char *out, size_t out_size) {
  size_t key_len = strlen(key);
  if (strncmp(line, key, key_len) == 0 && line[key_len] == '=') {
    const char *val = line + key_len + 1;
    snprintf(out, out_size, "%s", val);
    /* Strip a trailing newline. */
    size_t n = strlen(out);
    while (n > 0 && (out[n - 1] == '\n' || out[n - 1] == '\r')) {
      out[--n] = '\0';
    }
    /* Strip matching surrounding quotes so a hand-edited ini can't silently
     * send "key" instead of key in an auth header. */
    if (n >= 2 && out[0] == '"' && out[n - 1] == '"') {
      memmove(out, out + 1, n - 1);
      out[n - 2] = '\0';
    }
  }
}

/* Overlays key=value lines from `path` onto *out. Returns false if absent.
 * Empty values in the file don't clobber existing non-empty fields. */
static bool overlay_file(const char *path, kiosk_config_t *out) {
  FILE *f = fopen(path, "r");
  if (!f) return false;
  char line[512];
  while (fgets(line, sizeof(line), f)) {
    read_value(line, "wifi_ssid", out->wifi_ssid, sizeof(out->wifi_ssid));
    read_value(line, "wifi_password", out->wifi_password, sizeof(out->wifi_password));
    read_value(line, "server_url", out->server_url, sizeof(out->server_url));
    read_value(line, "api_key", out->api_key, sizeof(out->api_key));
    read_value(line, "mqtt_broker", out->mqtt_broker, sizeof(out->mqtt_broker));
    read_value(line, "mqtt_user", out->mqtt_user, sizeof(out->mqtt_user));
    read_value(line, "mqtt_password", out->mqtt_password, sizeof(out->mqtt_password));
  }
  fclose(f);
  return true;
}

bool kiosk_config_exists(void) {
  FILE *f = fopen(CONFIG_PATH, "r");
  if (!f) return false;
  fclose(f);
  return true;
}

bool kiosk_config_load(kiosk_config_t *out) {
  memset(out, 0, sizeof(*out));
  return overlay_file(CONFIG_PATH, out);
}

void kiosk_config_defaults(kiosk_config_t *out) {
  memset(out, 0, sizeof(*out));
  /* Built-in non-secret defaults. In the simulator the host machine's network
   * is used directly, so WiFi is informational — a placeholder is fine. */
  snprintf(out->wifi_ssid, sizeof(out->wifi_ssid), "%s", "Wokwi-GUEST");
  snprintf(out->server_url, sizeof(out->server_url), "%s", "https://project-frequency.vercel.app/");
  snprintf(out->mqtt_broker, sizeof(out->mqtt_broker), "%s", DEFAULT_MQTT_BROKER);
  /* Network credentials are supplied by the local simulator configuration.
   * Keep repository defaults empty so production credentials cannot leak. */
  /* Overlay secrets/overrides (broker, creds, api key) from a local, git-ignored
   * kiosk_defaults.ini if the operator dropped one in. */
  overlay_file(DEFAULTS_PATH, out);
}

bool kiosk_config_save(const kiosk_config_t *cfg) {
  FILE *f = fopen(CONFIG_PATH, "w");
  if (!f) return false;
  fprintf(f, "wifi_ssid=%s\n", cfg->wifi_ssid);
  fprintf(f, "wifi_password=%s\n", cfg->wifi_password);
  fprintf(f, "server_url=%s\n", cfg->server_url);
  fprintf(f, "api_key=%s\n", cfg->api_key);
  fprintf(f, "mqtt_broker=%s\n", cfg->mqtt_broker);
  fprintf(f, "mqtt_user=%s\n", cfg->mqtt_user);
  fprintf(f, "mqtt_password=%s\n", cfg->mqtt_password);
  fclose(f);
  return true;
}
