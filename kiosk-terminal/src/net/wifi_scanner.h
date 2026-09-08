#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    char ssid[33];
    int8_t rssi;
} kiosk_wifi_ap_t;

typedef void (*kiosk_wifi_scan_cb_t)(kiosk_wifi_ap_t *results, uint16_t count, void *user_data);

/**
 * @brief Starts an asynchronous WiFi scan.
 * The callback will be invoked (possibly from another task/thread) when complete.
 * The `results` array is only valid during the callback.
 */
void kiosk_wifi_scan_start(kiosk_wifi_scan_cb_t cb, void *user_data);

/**
 * @brief Retrieves the current local IP address as a string.
 */
void kiosk_wifi_get_ip(char *out_ip, size_t max_len);

#ifdef __cplusplus
}
#endif
