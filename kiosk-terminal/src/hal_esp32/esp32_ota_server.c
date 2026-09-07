#include "esp32_ota_server.h"

#include <stdio.h>
#include <string.h>
#include "esp_log.h"
#include "esp_system.h"
#include "esp_http_server.h"
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "ota_server";

static httpd_handle_t s_server = NULL;

static void restart_task(void *arg)
{
    (void)arg;
    vTaskDelay(pdMS_TO_TICKS(2000));
    ESP_LOGI(TAG, "Rebooting into new firmware...");
    esp_restart();
}

static const char *HTML_HEADER =
    "<!DOCTYPE html><html><head><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>Freq Kiosk — Firmware OTA</title>"
    "<style>"
    "body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;box-sizing:border-box;}"
    ".card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;max-width:480px;width:100%;box-shadow:0 10px 25px rgba(0,0,0,0.5);}"
    "h1{font-size:1.5rem;margin:0 0 12px 0;color:#38bdf8;}"
    "p{margin:0 0 20px 0;color:#94a3b8;font-size:0.95rem;line-height:1.5;}"
    ".badge{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px;margin-bottom:20px;font-family:monospace;font-size:0.85rem;}"
    ".badge div{display:flex;justify-content:space-between;margin:4px 0;}"
    ".badge span:last-child{color:#10b981;font-weight:bold;}"
    "input[type=file]{display:block;width:100%;padding:12px;margin-bottom:20px;background:#0f172a;border:1px dashed #475569;border-radius:8px;color:#f8fafc;box-sizing:border-box;cursor:pointer;}"
    "button{width:100%;background:#0284c7;color:#fff;border:none;padding:14px;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;transition:background 0.2s;}"
    "button:hover{background:#0369a1;}"
    "#progress{display:none;margin-top:20px;background:#0f172a;border-radius:8px;height:12px;overflow:hidden;border:1px solid #334155;}"
    "#bar{height:100%;width:0%;background:#10b981;transition:width 0.2s;}"
    "#status{margin-top:12px;font-size:0.9rem;text-align:center;color:#cbd5e1;}"
    "</style></head><body>"
    "<div class='card'>"
    "<h1>Freq Kiosk OTA Update</h1>"
    "<p>Upload a new <code>firmware.bin</code> over the local venue Wi-Fi.</p>"
    "<div class='badge'>";

static const char *HTML_FOOTER =
    "<form id='f'>"
    "<input type='file' id='bin' accept='.bin' required>"
    "<button type='submit' id='btn'>Flash Firmware</button>"
    "<div id='progress'><div id='bar'></div></div>"
    "<div id='status'></div>"
    "</form>"
    "<script>"
    "document.getElementById('f').onsubmit=function(e){"
    "e.preventDefault();"
    "const file=document.getElementById('bin').files[0];"
    "if(!file)return;"
    "document.getElementById('btn').disabled=true;"
    "document.getElementById('progress').style.display='block';"
    "const status=document.getElementById('status');"
    "status.innerText='Uploading firmware...';"
    "const xhr=new XMLHttpRequest();"
    "xhr.open('POST','/update',true);"
    "xhr.upload.onprogress=function(evt){"
    "if(evt.lengthComputable){"
    "const pct=Math.round((evt.loaded/evt.total)*100);"
    "document.getElementById('bar').style.width=pct+'%';"
    "status.innerText='Writing to flash: '+pct+'%';"
    "}"
    "};"
    "xhr.onload=function(){"
    "if(xhr.status===200){"
    "status.innerText='Success! Rebooting into new firmware...';"
    "status.style.color='#10b981';"
    "}else{"
    "status.innerText='Update failed: '+xhr.responseText;"
    "status.style.color='#ef4444';"
    "document.getElementById('btn').disabled=false;"
    "}"
    "};"
    "xhr.onerror=function(){status.innerText='Network error during upload';status.style.color='#ef4444';document.getElementById('btn').disabled=false;};"
    "xhr.send(file);"
    "};"
    "</script></div></body></html>";

static esp_err_t update_get_handler(httpd_req_t *req)
{
    const esp_partition_t *running = esp_ota_get_running_partition();
    const esp_partition_t *next = esp_ota_get_next_update_partition(NULL);

    httpd_resp_set_type(req, "text/html");
    httpd_resp_sendstr_chunk(req, HTML_HEADER);

    char badge[256];
    snprintf(badge, sizeof(badge),
        "<div><span>Running Partition:</span><span>%s</span></div>"
        "<div><span>Target Partition:</span><span>%s</span></div>"
        "<div><span>Free Heap:</span><span>%lu KB</span></div>"
        "</div>",
        running ? running->label : "unknown",
        next ? next->label : "unknown",
        (unsigned long)(esp_get_free_heap_size() / 1024)
    );
    httpd_resp_sendstr_chunk(req, badge);
    httpd_resp_sendstr_chunk(req, HTML_FOOTER);

    /* End response */
    return httpd_resp_sendstr_chunk(req, NULL);
}

static esp_err_t update_post_handler(httpd_req_t *req)
{
    ESP_LOGI(TAG, "Starting OTA update receive, content length: %d", req->content_len);

    const esp_partition_t *update_partition = esp_ota_get_next_update_partition(NULL);
    if (!update_partition) {
        ESP_LOGE(TAG, "Failed to get target OTA partition");
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "No target OTA partition");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "Writing firmware to partition: %s (offset 0x%lx)",
             update_partition->label, update_partition->address);

    esp_ota_handle_t ota_handle = 0;
    esp_err_t err = esp_ota_begin(update_partition, OTA_WITH_SEQUENTIAL_WRITES, &ota_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_ota_begin failed: %s", esp_err_to_name(err));
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "OTA begin failed");
        return ESP_FAIL;
    }

    char buf[2048];
    int remaining = req->content_len;

    while (remaining > 0) {
        int to_read = remaining < (int)sizeof(buf) ? remaining : (int)sizeof(buf);
        int received = httpd_req_recv(req, buf, to_read);
        if (received <= 0) {
            if (received == HTTPD_SOCK_ERR_TIMEOUT) {
                continue;
            }
            ESP_LOGE(TAG, "Socket receive error: %d", received);
            esp_ota_abort(ota_handle);
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Socket receive timeout");
            return ESP_FAIL;
        }

        err = esp_ota_write(ota_handle, buf, received);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "esp_ota_write failed: %s", esp_err_to_name(err));
            esp_ota_abort(ota_handle);
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Flash write failed");
            return ESP_FAIL;
        }
        remaining -= received;
    }

    err = esp_ota_end(ota_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_ota_end failed: %s", esp_err_to_name(err));
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "OTA validation failed");
        return ESP_FAIL;
    }

    err = esp_ota_set_boot_partition(update_partition);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_ota_set_boot_partition failed: %s", esp_err_to_name(err));
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Set boot partition failed");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "OTA update complete! Next boot: %s", update_partition->label);
    httpd_resp_sendstr(req, "OK");

    /* Schedule reboot in 2 seconds */
    xTaskCreate(restart_task, "restart_task", 2048, NULL, 5, NULL);
    return ESP_OK;
}

static esp_err_t status_get_handler(httpd_req_t *req)
{
    const esp_partition_t *running = esp_ota_get_running_partition();
    char json[256];
    snprintf(json, sizeof(json),
        "{\"status\":\"online\",\"running_partition\":\"%s\",\"free_heap\":%lu}\n",
        running ? running->label : "unknown",
        (unsigned long)esp_get_free_heap_size()
    );
    httpd_resp_set_type(req, "application/json");
    return httpd_resp_send(req, json, HTTPD_RESP_USE_STRLEN);
}

esp_err_t esp32_ota_server_start(void)
{
    if (s_server != NULL) {
        return ESP_OK; /* Already started */
    }

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 80;
    config.ctrl_port = 32768;
    config.max_open_sockets = 4;
    config.lru_purge_enable = true;

    esp_err_t ret = httpd_start(&s_server, &config);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start HTTP server: %s", esp_err_to_name(ret));
        return ret;
    }

    httpd_uri_t uri_get_update = {
        .uri = "/update",
        .method = HTTP_GET,
        .handler = update_get_handler,
        .user_ctx = NULL,
    };
    httpd_register_uri_handler(s_server, &uri_get_update);

    httpd_uri_t uri_post_update = {
        .uri = "/update",
        .method = HTTP_POST,
        .handler = update_post_handler,
        .user_ctx = NULL,
    };
    httpd_register_uri_handler(s_server, &uri_post_update);

    httpd_uri_t uri_get_status = {
        .uri = "/status",
        .method = HTTP_GET,
        .handler = status_get_handler,
        .user_ctx = NULL,
    };
    httpd_register_uri_handler(s_server, &uri_get_status);

    ESP_LOGI(TAG, "Local WiFi OTA server running on port 80 (http://<ip>/update)");
    return ESP_OK;
}
