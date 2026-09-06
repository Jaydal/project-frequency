#pragma once

#include <stdbool.h>
#include <stddef.h>

/* Portable MQTT subscribe transport. The implementation is platform-specific:
 *   - simulator: libmosquitto  (src/hal_sim/sim_mqtt_transport.c)
 *   - ESP32-S3:  esp-mqtt       (src/hal_esp32/esp32_mqtt_transport.c)
 *
 * Designed to be pumped from the UI thread via mqtt_transport_poll(), so the
 * message callback runs on the same thread as LVGL — no locking needed. */

typedef void (*mqtt_message_cb_t)(const char *topic, const char *payload,
                                  size_t payload_len, void *user_data);

typedef struct {
  const char *broker;    /* "host", "host:port", or "mqtt(s)://host:port" */
  const char *username;  /* may be NULL */
  const char *password;  /* may be NULL */
} mqtt_config_t;

/* Begins connecting (non-blocking). The connection completes during poll().
 * cb is invoked for each received message. Returns false on setup failure. */
bool mqtt_transport_start(const mqtt_config_t *cfg, mqtt_message_cb_t cb, void *user_data);

/* Queues a subscription; (re)applied automatically on every (re)connect. */
void mqtt_transport_subscribe(const char *topic);

/* Pumps the client. Call regularly (e.g. from an LVGL timer). */
void mqtt_transport_poll(void);

bool mqtt_transport_connected(void);
