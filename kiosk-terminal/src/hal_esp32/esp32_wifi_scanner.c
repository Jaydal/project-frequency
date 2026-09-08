#include "net/wifi_scanner.h"
#include "esp_wifi.h"
#include "esp_netif.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <string.h>

static const char *TAG = "wifi_scanner";

typedef struct {
    kiosk_wifi_scan_cb_t cb;
    void *user_data;
} scan_task_args_t;

static void scan_task(void *pvParameters) {
    scan_task_args_t *args = (scan_task_args_t *)pvParameters;

    wifi_scan_config_t scan_config = {
        .ssid = NULL,
        .bssid = NULL,
        .channel = 0,
        .show_hidden = true
    };

    extern bool g_wifi_scan_active;
    g_wifi_scan_active = true;
    esp_wifi_disconnect();
    vTaskDelay(pdMS_TO_TICKS(100)); // Give driver time to transition state

    ESP_LOGI(TAG, "Starting WiFi scan...");
    
    // Perform blocking scan
    esp_err_t err = esp_wifi_scan_start(&scan_config, true);
    
    if (err == ESP_OK) {
        uint16_t ap_count = 0;
        esp_wifi_scan_get_ap_num(&ap_count);
        
        wifi_ap_record_t *ap_info = malloc(sizeof(wifi_ap_record_t) * ap_count);
        if (ap_info) {
            esp_wifi_scan_get_ap_records(&ap_count, ap_info);
            
            kiosk_wifi_ap_t *results = malloc(sizeof(kiosk_wifi_ap_t) * ap_count);
            if (results) {
                for (int i = 0; i < ap_count; i++) {
                    strncpy(results[i].ssid, (char *)ap_info[i].ssid, sizeof(results[i].ssid) - 1);
                    results[i].ssid[sizeof(results[i].ssid) - 1] = '\0';
                    results[i].rssi = ap_info[i].rssi;
                }
                
                if (args->cb) {
                    args->cb(results, ap_count, args->user_data);
                }
                free(results);
            }
            free(ap_info);
        }
    } else {
        ESP_LOGE(TAG, "esp_wifi_scan_start failed: %s", esp_err_to_name(err));
        if (args->cb) {
            args->cb(NULL, 0, args->user_data);
        }
    }
    
    g_wifi_scan_active = false;
    esp_wifi_connect();
    
    free(args);
    vTaskDelete(NULL);
}

void kiosk_wifi_scan_start(kiosk_wifi_scan_cb_t cb, void *user_data) {
    scan_task_args_t *args = malloc(sizeof(scan_task_args_t));
    if (!args) return;
    args->cb = cb;
    args->user_data = user_data;
    
    xTaskCreate(scan_task, "wifi_scan", 4096, args, 5, NULL);
}

void kiosk_wifi_get_ip(char *out_ip, size_t max_len) {
    if (!out_ip || max_len == 0) return;
    
    esp_netif_t *netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    esp_netif_ip_info_t ip_info;
    if (netif && esp_netif_get_ip_info(netif, &ip_info) == ESP_OK && ip_info.ip.addr != 0) {
        snprintf(out_ip, max_len, IPSTR, IP2STR(&ip_info.ip));
    } else {
        snprintf(out_ip, max_len, "Not connected");
    }
}
