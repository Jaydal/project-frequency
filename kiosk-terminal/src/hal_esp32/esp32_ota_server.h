#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#include "esp_err.h"

/**
 * @brief Starts the local background HTTP OTA update server on port 80.
 *
 * Provides endpoints:
 *   - GET  /update : Web dashboard with upload form and system partition info
 *   - POST /update : Streams and flashes incoming .bin firmware to the inactive OTA partition
 *   - GET  /status : System health, current partition, and heap stats JSON
 *   - GET  /logs   : Real-time chunked log stream from a safe static 4KB ring buffer
 *
 * @return ESP_OK on success, or error code on failure.
 */
esp_err_t esp32_ota_server_start(void);

#ifdef __cplusplus
}
#endif
