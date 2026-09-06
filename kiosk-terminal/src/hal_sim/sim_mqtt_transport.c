#include "../net/mqtt_transport.h"
#include <mosquitto.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

/* Simulator MQTT transport: libmosquitto, pumped via mqtt_transport_poll().
 * Replaced by an esp-mqtt implementation of the same interface on the ESP32. */

#define MAX_SUBSCRIPTIONS 8

static struct mosquitto *s_mosq = NULL;
static mqtt_message_cb_t s_cb = NULL;
static void *s_user_data = NULL;
static char s_topics[MAX_SUBSCRIPTIONS][128];
static int  s_topic_count = 0;
static bool s_connected = false;

/* Parses "mqtt(s)://host:port", "host:port", or "host" into host/port/tls. */
static void parse_broker(const char *broker, char *host, size_t host_size,
                         int *port, bool *tls) {
  *tls = false;
  *port = 1883;

  const char *p = broker;
  if (strncmp(p, "mqtts://", 8) == 0) { *tls = true; *port = 8883; p += 8; }
  else if (strncmp(p, "mqtt://", 7) == 0) { p += 7; }

  const char *colon = strrchr(p, ':');
  if (colon) {
    size_t hlen = (size_t)(colon - p);
    if (hlen >= host_size) hlen = host_size - 1;
    memcpy(host, p, hlen);
    host[hlen] = '\0';
    *port = atoi(colon + 1);
  } else {
    snprintf(host, host_size, "%s", p);
  }
}

static void on_connect(struct mosquitto *mosq, void *obj, int rc) {
  (void)obj;
  if (rc == 0) {
    s_connected = true;
    for (int i = 0; i < s_topic_count; i++) {
      mosquitto_subscribe(mosq, NULL, s_topics[i], 0);
    }
  }
}

static void on_disconnect(struct mosquitto *mosq, void *obj, int rc) {
  (void)mosq; (void)obj; (void)rc;
  s_connected = false;
}

static void on_message(struct mosquitto *mosq, void *obj,
                       const struct mosquitto_message *msg) {
  (void)mosq; (void)obj;
  if (s_cb && msg->payload) {
    s_cb(msg->topic, (const char *)msg->payload, (size_t)msg->payloadlen, s_user_data);
  }
}

bool mqtt_transport_start(const mqtt_config_t *cfg, mqtt_message_cb_t cb, void *user_data) {
  if (!cfg || !cfg->broker || !cfg->broker[0]) return false;

  mosquitto_lib_init();
  s_cb = cb;
  s_user_data = user_data;
  s_topic_count = 0;

  if (s_mosq) {
    mosquitto_disconnect(s_mosq);
    mosquitto_destroy(s_mosq);
    s_mosq = NULL;
  }

  s_mosq = mosquitto_new(NULL, true, NULL);
  if (!s_mosq) return false;

  if (cfg->username && cfg->username[0]) {
    mosquitto_username_pw_set(s_mosq, cfg->username, cfg->password);
  }

  char host[128];
  int port;
  bool tls;
  parse_broker(cfg->broker, host, sizeof(host), &port, &tls);

  if (tls) {
    mosquitto_int_option(s_mosq, MOSQ_OPT_TLS_USE_OS_CERTS, 1);
    mosquitto_tls_set(s_mosq, NULL, NULL, NULL, NULL, NULL);
  }

  mosquitto_connect_callback_set(s_mosq, on_connect);
  mosquitto_disconnect_callback_set(s_mosq, on_disconnect);
  mosquitto_message_callback_set(s_mosq, on_message);

  // K6: mosquitto_connect_async creates an internal thread for networking. 
  // However, mosquitto_loop must be called repeatedly by the main thread.
  // The callbacks will execute in the context of the thread calling mosquitto_loop.
  int rc = mosquitto_connect_async(s_mosq, host, port, 30);
  if (rc != MOSQ_ERR_SUCCESS) {
    fprintf(stderr, "[mqtt] connect_async failed: %s\n", mosquitto_strerror(rc));
    return false;
  }
  return true;
}

void mqtt_transport_subscribe(const char *topic) {
  for (int i = 0; i < s_topic_count; i++) {
    if (strcmp(s_topics[i], topic) == 0) return;
  }
  if (s_topic_count < MAX_SUBSCRIPTIONS) {
    snprintf(s_topics[s_topic_count], sizeof(s_topics[s_topic_count]), "%s", topic);
    s_topic_count++;
    if (s_connected && s_mosq) mosquitto_subscribe(s_mosq, NULL, topic, 0);
  }
}

void mqtt_transport_poll(void) {
  if (s_mosq) mosquitto_loop(s_mosq, 0, 1);
}

bool mqtt_transport_connected(void) {
  return s_connected;
}
