#include "../net/mqtt_transport.h"
#include <string.h>
#include <stdlib.h>

#include "mqtt_client.h"
#include "esp_crt_bundle.h"
#include "esp_log.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "gts_root_r1.h"

#ifdef ESP_PLATFORM
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
static SemaphoreHandle_t s_mutex = NULL;
#define MQTT_LOCK()   if (s_mutex) xSemaphoreTake(s_mutex, portMAX_DELAY)
#define MQTT_UNLOCK() if (s_mutex) xSemaphoreGive(s_mutex)
#else
#define MQTT_LOCK()
#define MQTT_UNLOCK()
#endif

/* ESP32-S3 MQTT transport: esp-mqtt. Replaces the libmosquitto-based
 * simulator implementation (src/hal_sim/sim_mqtt_transport.c).
 *
 * esp-mqtt runs its own FreeRTOS task internally, so mqtt_transport_poll()
 * is a no-op.  The message callback fires from the esp-mqtt task context;
 * for this project the callback just queues data into the shared model,
 * which is protected at a higher layer. */

static const char *TAG = "mqtt";

#define MAX_SUBSCRIPTIONS 8

static esp_mqtt_client_handle_t s_client    = NULL;
static mqtt_message_cb_t        s_cb        = NULL;
static void                    *s_user_data = NULL;
static char                     s_topics[MAX_SUBSCRIPTIONS][128];
static int                      s_topic_count = 0;
static bool                     s_connected  = false;
static bool                     s_mqtt_started = false;
static bool                     s_ip_handler_registered = false;
static char                    *s_rx_payload = NULL;
static size_t                   s_rx_payload_capacity = 0;
static char                     s_rx_topic[256];

/* ── Event handler ───────────────────────────────────────────────────── */

static void ip_event_handler(void *arg, esp_event_base_t event_base,
                             int32_t event_id, void *event_data) {
  (void)arg;
  (void)event_base;
  (void)event_data;
  if (event_id == IP_EVENT_STA_GOT_IP) {
    if (s_client && !s_mqtt_started) {
      ESP_LOGI(TAG, "Network is up, starting MQTT client...");
      s_mqtt_started = true;
      esp_mqtt_client_start(s_client);
    }
  }
}

static void mqtt_event_handler(void *handler_args, esp_event_base_t base,
                               int32_t event_id, void *event_data) {
  (void)handler_args;
  (void)base;
  esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;

  switch (event_id) {

    case MQTT_EVENT_CONNECTED:
      ESP_LOGI(TAG, "connected");
      MQTT_LOCK();
      s_connected = true;
      for (int i = 0; i < s_topic_count; i++) {
        esp_mqtt_client_subscribe(s_client, (char *)s_topics[i], 0);
      }
      MQTT_UNLOCK();
      break;

    case MQTT_EVENT_DISCONNECTED:
      ESP_LOGI(TAG, "disconnected");
      MQTT_LOCK();
      s_connected = false;
      MQTT_UNLOCK();
      break;

    case MQTT_EVENT_DATA:
      if (event->topic && event->topic_len > 0) {
        int tlen = event->topic_len;
        if (tlen >= (int)sizeof(s_rx_topic)) tlen = (int)sizeof(s_rx_topic) - 1;
        memcpy(s_rx_topic, event->topic, tlen);
        s_rx_topic[tlen] = '\0';
      }

      if (event->total_data_len > event->data_len) {
        size_t total = (size_t)event->total_data_len;
        size_t offset = (size_t)event->current_data_offset;
        if (offset == 0 && total + 1 > s_rx_payload_capacity) {
          char *grown = realloc(s_rx_payload, total + 1);
          if (!grown) {
            ESP_LOGE(TAG, "MQTT payload allocation failed (%zu bytes)", total + 1);
            free(s_rx_payload);
            s_rx_payload = NULL;
            s_rx_payload_capacity = 0;
            break;
          }
          s_rx_payload = grown;
          s_rx_payload_capacity = total + 1;
        }
        if (!s_rx_payload || offset + (size_t)event->data_len > total) break;
        memcpy(s_rx_payload + offset, event->data, (size_t)event->data_len);
        if (offset + (size_t)event->data_len != total) break;
        s_rx_payload[total] = '\0';
        if (s_cb && s_rx_topic[0]) s_cb(s_rx_topic, s_rx_payload, total, s_user_data);
        free(s_rx_payload);
        s_rx_payload = NULL;
        s_rx_payload_capacity = 0;
      } else if (s_cb && event->data && s_rx_topic[0]) {
        s_cb(s_rx_topic, event->data, (size_t)event->data_len, s_user_data);
      }
      break;

    case MQTT_EVENT_ERROR:
      ESP_LOGE(TAG, "transport error");
      break;

    default:
      break;
  }
}

/* ── Public interface ────────────────────────────────────────────────── */

bool mqtt_transport_start(const mqtt_config_t *cfg, mqtt_message_cb_t cb,
                          void *user_data) {
  if (!cfg || !cfg->broker || !cfg->broker[0]) return false;

  s_cb        = cb;
  s_user_data = user_data;
  s_topic_count = 0;

  if (s_client) {
    esp_mqtt_client_stop(s_client);
    esp_mqtt_client_destroy(s_client);
    s_client = NULL;
  }

#ifdef ESP_PLATFORM
  if (!s_mutex) s_mutex = xSemaphoreCreateMutex();
#endif

  /* Use a static buffer to ensure the pointer remains valid for the life 
   * of the MQTT client, bypassing esp-tls buggy URI parsing. */
  static char s_host[128];
  memset(s_host, 0, sizeof(s_host));
  int port = 0;
  esp_mqtt_transport_t transport = MQTT_TRANSPORT_UNKNOWN;
  
  if (strncmp(cfg->broker, "mqtts://", 8) == 0) {
      transport = MQTT_TRANSPORT_OVER_SSL;
      sscanf(cfg->broker + 8, "%127[^:]:%d", s_host, &port);
      if (port == 0) port = 8883;
  } else if (strncmp(cfg->broker, "mqtt://", 7) == 0) {
      transport = MQTT_TRANSPORT_OVER_TCP;
      sscanf(cfg->broker + 7, "%127[^:]:%d", s_host, &port);
      if (port == 0) port = 1883;
  } else {
      transport = MQTT_TRANSPORT_OVER_TCP;
      sscanf(cfg->broker, "%127[^:]:%d", s_host, &port);
      if (port == 0) port = 1883;
  }

  esp_mqtt_client_config_t mqtt_cfg = {
    .broker.address.hostname  = s_host,
    .broker.address.port      = port,
    .broker.address.transport = transport,
    .credentials.username     = cfg->username,
    .credentials.authentication.password = cfg->password,
    .buffer.size              = 8192,
  };

  if (transport == MQTT_TRANSPORT_OVER_SSL) {
    mqtt_cfg.broker.verification.crt_bundle_attach = esp_crt_bundle_attach;
  }

  s_client = esp_mqtt_client_init(&mqtt_cfg);
  if (!s_client) {
    ESP_LOGE(TAG, "esp_mqtt_client_init failed");
    return false;
  }

  esp_mqtt_client_register_event(s_client, ESP_EVENT_ANY_ID,
                                 mqtt_event_handler, NULL);

  /* Instead of starting immediately (which spams esp-tls DNS errors because
   * Wi-Fi hasn't connected yet), we wait for the IP_EVENT_STA_GOT_IP event. */
  s_mqtt_started = false;
  if (!s_ip_handler_registered) {
    esp_err_t handler_err = esp_event_handler_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, ip_event_handler, NULL);
    if (handler_err != ESP_OK) {
      ESP_LOGE(TAG, "IP event handler registration failed: %s",
               esp_err_to_name(handler_err));
      esp_mqtt_client_destroy(s_client);
      s_client = NULL;
      return false;
    }
    s_ip_handler_registered = true;
  }

  /* Check if the network is already up (in case Wi-Fi connected extremely fast
   * before this init was called), otherwise the event handler will catch it. */
  esp_netif_t *netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
  esp_netif_ip_info_t ip_info;
  if (netif && esp_netif_get_ip_info(netif, &ip_info) == ESP_OK && ip_info.ip.addr != 0) {
      ESP_LOGI(TAG, "Network already up, starting MQTT client...");
      s_mqtt_started = true;
      esp_mqtt_client_start(s_client);
  }

  ESP_LOGI(TAG, "configured → %s (waiting for network)", cfg->broker);
  return true;
}

void mqtt_transport_subscribe(const char *topic) {
  MQTT_LOCK();
  for (int i = 0; i < s_topic_count; i++) {
    if (strcmp(s_topics[i], topic) == 0) {
      MQTT_UNLOCK();
      return;
    }
  }
  if (s_topic_count < MAX_SUBSCRIPTIONS) {
    snprintf(s_topics[s_topic_count], sizeof(s_topics[s_topic_count]), "%s", topic);
    s_topic_count++;
    if (s_connected && s_client) {
      esp_mqtt_client_subscribe(s_client, (char *)topic, 0);
    }
  }
  MQTT_UNLOCK();
}

void mqtt_transport_poll(void) {
  /* No-op on ESP32: esp-mqtt runs its own FreeRTOS task internally. */
}

bool mqtt_transport_connected(void) {
  MQTT_LOCK();
  bool connected = s_connected;
  MQTT_UNLOCK();
  return connected;
}
