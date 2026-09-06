/**
 * @file esp32_config_store.c
 * @brief ESP32 NVS flash implementation of the kiosk configuration store.
 *
 * Stores each kiosk_config_t field as a separate NVS string entry under the
 * "kiosk_cfg" namespace.  NVS flash must be initialised (nvs_flash_init)
 * before any function in this file is called – that is handled in esp32_main.c.
 */

#include "data/kiosk_config.h"

#include <string.h>

#include "esp_log.h"
#include "nvs.h"
#include "nvs_flash.h"

/* -------------------------------------------------------------------------- */
/*  Private constants                                                         */
/* -------------------------------------------------------------------------- */

static const char *TAG = "config";

/** NVS namespace – max 15 characters. */
#define NVS_NAMESPACE "kiosk_cfg"

/* NVS key names (max 15 characters each). */
#define KEY_WIFI_SSID  "wifi_ssid"
#define KEY_WIFI_PASS  "wifi_pass"
#define KEY_SERVER_URL "server_url"
#define KEY_API_KEY    "api_key"
#define KEY_MQTT_BROKER "mqtt_broker"
#define KEY_MQTT_USER  "mqtt_user"
#define KEY_MQTT_PASS  "mqtt_pass"

#define DEFAULT_MQTT_BROKER "mqtts://594d608708f34a7b9607e86258c3b3ae.s1.eu.hivemq.cloud:8883"

/* -------------------------------------------------------------------------- */
/*  Private helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * @brief Read a single NVS string into a fixed-size buffer.
 *
 * @param handle  Open NVS handle.
 * @param key     NVS key name.
 * @param buf     Destination buffer.
 * @param buf_len Size of the destination buffer.
 * @return true on success or if the key simply does not exist (buffer zeroed).
 * @return false on a hard NVS error.
 */
static bool prv_read_str(nvs_handle_t handle, const char *key,
                         char *buf, size_t buf_len)
{
    size_t required = buf_len;
    esp_err_t err = nvs_get_str(handle, key, buf, &required);

    if (err == ESP_ERR_NVS_NOT_FOUND) {
        /* Key not written yet – leave buffer as-is (already zeroed). */
        return true;
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to read key \"%s\": %s", key, esp_err_to_name(err));
        return false;
    }
    return true;
}

/**
 * @brief Write a single NVS string.
 *
 * @param handle  Open NVS handle (read-write).
 * @param key     NVS key name.
 * @param value   Null-terminated string to store.
 * @return true on success, false on error.
 */
static bool prv_write_str(nvs_handle_t handle, const char *key,
                          const char *value)
{
    esp_err_t err = nvs_set_str(handle, key, value);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to write key \"%s\": %s", key, esp_err_to_name(err));
        return false;
    }
    return true;
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

bool kiosk_config_exists(void)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &handle);
    if (err != ESP_OK) {
        /* Namespace never created → no config stored yet. */
        return false;
    }

    /* Probe for the wifi_ssid key as a sentinel. */
    size_t required = 0;
    err = nvs_get_str(handle, KEY_WIFI_SSID, NULL, &required);
    nvs_close(handle);

    return (err == ESP_OK);
}

bool kiosk_config_load(kiosk_config_t *out)
{
    if (out == NULL) {
        return false;
    }

    memset(out, 0, sizeof(*out));

    nvs_handle_t handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "NVS open failed: %s", esp_err_to_name(err));
        return false;
    }

    bool ok = true;
    ok = ok && prv_read_str(handle, KEY_WIFI_SSID,   out->wifi_ssid,     sizeof(out->wifi_ssid));
    ok = ok && prv_read_str(handle, KEY_WIFI_PASS,    out->wifi_password, sizeof(out->wifi_password));
    ok = ok && prv_read_str(handle, KEY_SERVER_URL,   out->server_url,    sizeof(out->server_url));
    ok = ok && prv_read_str(handle, KEY_API_KEY,      out->api_key,       sizeof(out->api_key));
    ok = ok && prv_read_str(handle, KEY_MQTT_BROKER,  out->mqtt_broker,   sizeof(out->mqtt_broker));
    ok = ok && prv_read_str(handle, KEY_MQTT_USER,    out->mqtt_user,     sizeof(out->mqtt_user));
    ok = ok && prv_read_str(handle, KEY_MQTT_PASS,    out->mqtt_password, sizeof(out->mqtt_password));

    nvs_close(handle);

    if (ok) {
        ESP_LOGI(TAG, "Configuration loaded from NVS");
    }
    return ok;
}

bool kiosk_config_save(const kiosk_config_t *cfg)
{
    if (cfg == NULL) {
        return false;
    }

    nvs_handle_t handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "NVS open (rw) failed: %s", esp_err_to_name(err));
        return false;
    }

    bool ok = true;
    ok = ok && prv_write_str(handle, KEY_WIFI_SSID,   cfg->wifi_ssid);
    ok = ok && prv_write_str(handle, KEY_WIFI_PASS,    cfg->wifi_password);
    ok = ok && prv_write_str(handle, KEY_SERVER_URL,   cfg->server_url);
    ok = ok && prv_write_str(handle, KEY_API_KEY,      cfg->api_key);
    ok = ok && prv_write_str(handle, KEY_MQTT_BROKER,  cfg->mqtt_broker);
    ok = ok && prv_write_str(handle, KEY_MQTT_USER,    cfg->mqtt_user);
    ok = ok && prv_write_str(handle, KEY_MQTT_PASS,    cfg->mqtt_password);

    if (ok) {
        err = nvs_commit(handle);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "NVS commit failed: %s", esp_err_to_name(err));
            ok = false;
        } else {
            ESP_LOGI(TAG, "Configuration saved to NVS");
        }
    }

    nvs_close(handle);
    return ok;
}

void kiosk_config_defaults(kiosk_config_t *out)
{
    if (out == NULL) {
        return;
    }

    memset(out, 0, sizeof(*out));

    /* WiFi credentials left empty – user must configure via setup screen. */
    strncpy(out->server_url,  "https://project-frequency.vercel.app", sizeof(out->server_url)  - 1);
    strncpy(out->mqtt_broker, DEFAULT_MQTT_BROKER, sizeof(out->mqtt_broker) - 1);
    /* Network credentials are provisioned through the setup flow. Never ship
     * shared MQTT/API credentials in firmware defaults. */
}
