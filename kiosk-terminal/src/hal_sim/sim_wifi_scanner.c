#include "net/wifi_scanner.h"
#include <stddef.h>
#include <stdio.h>

void kiosk_wifi_scan_start(kiosk_wifi_scan_cb_t cb, void *user_data) {
    if (!cb) return;
    
    kiosk_wifi_ap_t mock_aps[3] = {
        { .ssid = "Wokwi-GUEST", .rssi = -50 },
        { .ssid = "Simulator-Net", .rssi = -65 },
        { .ssid = "Hidden-Network", .rssi = -80 }
    };

    cb(mock_aps, 3, user_data);
}

void kiosk_wifi_get_ip(char *out_ip, size_t max_len) {
    if (out_ip && max_len > 0) {
        snprintf(out_ip, max_len, "127.0.0.1");
    }
}
