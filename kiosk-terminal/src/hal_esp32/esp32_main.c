/**
 * @file esp32_main.c
 * @brief ESP32-S3 entry point for the kiosk-terminal application.
 *
 * Initialisation order:
 *   1. NVS flash
 *   2. WiFi subsystem (STA mode, no connection yet)
 *   3. LVGL core
 *   4. Display driver (hal_esp32)
 *   5. Application UI
 *   6. MQTT polling timer
 *   7. LVGL tick task on core 1
 */

#include <string.h>

/* ESP-IDF */
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "nvs_flash.h"
#include "esp_sntp.h"

/* FreeRTOS */
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "../net/nfc_reader.h"

/* LVGL */
#include "lvgl.h"

/* Project headers */
#include "hal_esp32/esp32_display.h"
#include "net/mqtt_transport.h"
#include "ui/ui_app.h"
#include "data/kiosk_config.h"

/* -------------------------------------------------------------------------- */
/*  Private constants                                                         */
/* -------------------------------------------------------------------------- */

static const char *TAG = "main";

/** Stack size for the dedicated LVGL task (bytes). */
#define LVGL_TASK_STACK_SIZE (24 * 1024)

/** LVGL task priority – higher than idle, lower than WiFi/network tasks. */
#define LVGL_TASK_PRIORITY   5

/** MQTT poll interval in milliseconds (matches LVGL timer period). */
#define MQTT_POLL_INTERVAL_MS 50

/** LVGL handler delay between iterations (milliseconds). */
#define LVGL_HANDLER_PERIOD_MS 5

/**
 * Maximum time to wait for an RGB-panel frame boundary.  The timeout keeps
 * boot and recovery paths alive if the panel has not started generating
 * VSYNC events yet.
 */
#define LVGL_VSYNC_WAIT_TIMEOUT_MS 100

/* -------------------------------------------------------------------------- */
/*  Private functions                                                         */
/* -------------------------------------------------------------------------- */

/**
 * @brief Initialise NVS flash, erasing and reinitialising on corruption.
 */
static void prv_nvs_init(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES ||
        err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS partition truncated or version mismatch – erasing");
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);
    ESP_LOGI(TAG, "NVS flash initialised");
}

bool g_wifi_scan_active = false;

static void prv_wifi_event_handler(void* arg, esp_event_base_t event_base, int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        if (!g_wifi_scan_active) {
            ESP_LOGI(TAG, "WiFi disconnected, retrying...");
            esp_wifi_connect();
        } else {
            ESP_LOGI(TAG, "WiFi disconnected, not retrying (scan active)");
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
    }
}

static void prv_wifi_init_sta(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t wifi_cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&wifi_cfg));
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    
    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &prv_wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &prv_wifi_event_handler, NULL));

    kiosk_config_t cfg;
    if (kiosk_config_exists() && kiosk_config_load(&cfg) && strlen(cfg.wifi_ssid) > 0) {
        wifi_config_t sta_cfg = {0};
        strncpy((char *)sta_cfg.sta.ssid, cfg.wifi_ssid, sizeof(sta_cfg.sta.ssid) - 1);
        strncpy((char *)sta_cfg.sta.password, cfg.wifi_password, sizeof(sta_cfg.sta.password) - 1);
        ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta_cfg));
        ESP_ERROR_CHECK(esp_wifi_start());
        esp_err_t err = esp_wifi_connect();
        if (err == ESP_OK) {
            ESP_LOGI(TAG, "WiFi STA connecting to %s", cfg.wifi_ssid);
        } else {
            ESP_LOGW(TAG, "esp_wifi_connect failed: %s", esp_err_to_name(err));
        }
    } else {
        ESP_ERROR_CHECK(esp_wifi_start());
        ESP_LOGI(TAG, "WiFi STA mode initialised (not connected / empty SSID)");
    }

    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "pool.ntp.org");
    esp_sntp_init();

    /* Set timezone to Philippine Standard Time (UTC+8) */
    setenv("TZ", "PHT-8", 1);
    tzset();
}

static bool prv_wifi_has_ip(void)
{
    esp_netif_t *netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
    if (!netif) return false;
    esp_netif_ip_info_t ip_info;
    return esp_netif_get_ip_info(netif, &ip_info) == ESP_OK && ip_info.ip.addr != 0;
}

static void prv_wait_for_wifi_ip(void)
{
    kiosk_config_t cfg;
    if (!kiosk_config_exists() || !kiosk_config_load(&cfg) || cfg.wifi_ssid[0] == '\0') {
        return; /* Setup mode must remain immediately available. */
    }

    const int max_wait_ms = 10000;
    for (int elapsed = 0; elapsed < max_wait_ms && !prv_wifi_has_ip(); elapsed += 250) {
        vTaskDelay(pdMS_TO_TICKS(250));
    }
    ESP_LOGI(TAG, "WiFi startup wait complete (IP: %s)",
             prv_wifi_has_ip() ? "ready" : "not available");
}

/**
 * @brief LVGL timer callback that pumps the MQTT transport layer.
 */
static void prv_mqtt_poll_cb(lv_timer_t *timer)
{
    (void)timer;
    mqtt_transport_poll();
}

/**
 * @brief FreeRTOS task that runs the LVGL event loop.
 *
 * Pinned to core 1 so that core 0 remains available for WiFi / networking.
 */
/**
 * @brief Periodic esp_timer callback that advances LVGL's internal clock.
 *
 * Kept separate from the LVGL task so rendering time does not make LVGL's
 * timers drift. Driving lv_tick_inc() from a hardware timer keeps its clock
 * accurate.
 */
static void prv_lvgl_tick_cb(void *arg)
{
    (void)arg;
    lv_tick_inc(LVGL_HANDLER_PERIOD_MS);
}

static void prv_lvgl_task(void *arg)
{
    (void)arg;
    esp32_display_set_lvgl_task(xTaskGetCurrentTaskHandle());

    ESP_LOGI(TAG, "LVGL task started on core %d", xPortGetCoreID());

    for (;;) {
        /*
         * The display uses one panel-owned PSRAM framebuffer in LVGL direct
         * mode.  Rendering while the RGB peripheral is scanning that same
         * buffer causes visible tearing (most obvious on keyboard presses).
         * The RGB VSYNC callback signals this task, so begin each redraw at a
         * frame boundary.  A bounded timeout avoids deadlocking during panel
         * startup or recovery when no VSYNC has arrived yet.
         */
        (void)ulTaskNotifyTake(pdTRUE,
                               pdMS_TO_TICKS(LVGL_VSYNC_WAIT_TIMEOUT_MS));
        lv_timer_handler();
        vTaskDelay(pdMS_TO_TICKS(LVGL_HANDLER_PERIOD_MS));
    }
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                               */
/* -------------------------------------------------------------------------- */

void app_main(void)
{
    ESP_LOGI(TAG, "=== Kiosk Terminal booting ===");

    /* 1. Non-volatile storage */
    prv_nvs_init();

    /* 2. LVGL core */
    lv_init();
    ESP_LOGI(TAG, "LVGL initialised");

    /* 3. Display driver (LCD + touch) */
    /* Init display before Wi-Fi so we can allocate large contiguous internal RAM buffers 
     * for LVGL before the Wi-Fi driver fractures the heap. */
    esp32_display_init();
    ESP_LOGI(TAG, "Display initialised");

    /* 4. WiFi subsystem (STA, no connection) */
    prv_wifi_init_sta();
    /* Do not race the first REST request against DHCP. */
    prv_wait_for_wifi_ip();

    /* 5. Application UI */
    ui_app_init();
    ESP_LOGI(TAG, "UI initialised");

    /* 6. NFC Reader Task — started after UI so LVGL renders first frame */
    nfc_reader_start();

    /* 7. MQTT polling timer */
    lv_timer_create(prv_mqtt_poll_cb, MQTT_POLL_INTERVAL_MS, NULL);
    ESP_LOGI(TAG, "MQTT poll timer created (%d ms)", MQTT_POLL_INTERVAL_MS);

    /* 8. LVGL clock driven by a hardware timer. */
    const esp_timer_create_args_t lvgl_tick_args = {
        .callback = &prv_lvgl_tick_cb,
        .name = "lvgl_tick",
    };
    esp_timer_handle_t lvgl_tick_timer = NULL;
    ESP_ERROR_CHECK(esp_timer_create(&lvgl_tick_args, &lvgl_tick_timer));
    ESP_ERROR_CHECK(esp_timer_start_periodic(lvgl_tick_timer,
                                             LVGL_HANDLER_PERIOD_MS * 1000));

    /* 9. Dedicated LVGL task on core 1. */
    xTaskCreatePinnedToCore(
        prv_lvgl_task,
        "lvgl",
        LVGL_TASK_STACK_SIZE,
        NULL,
        LVGL_TASK_PRIORITY,
        NULL,
        1  /* core 1 */
    );

    ESP_LOGI(TAG, "=== Boot complete ===");
}
