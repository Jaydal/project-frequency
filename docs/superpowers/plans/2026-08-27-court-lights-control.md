# Court Lights Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-controlled court lighting via a relay on GPIO 6, with MQTT commands and a status indicator on the kiosk idle screen.

**Architecture:** The Next.js server decides when lights should be ON/OFF based on active games + evening time. It publishes MQTT commands to `freq/lights`. The kiosk subscribes, toggles GPIO 6, and shows the current state on screen. Following Smart Server / Thin Client — no logic on the kiosk.

**Tech Stack:** C (LVGL 8.2, cJSON, esp-mqtt/libmosquitto), TypeScript (Next.js, Supabase, MQTT.js)

---

## File Structure

### New Files
| File | Purpose |
|------|---------|
| `kiosk-terminal/src/net/relay.h` | Portable relay interface: `relay_init()`, `relay_set()`, `relay_is_on()` |
| `kiosk-terminal/src/hal_esp32/esp32_relay.c` | ESP32 GPIO 6 implementation |
| `kiosk-terminal/src/hal_sim/sim_relay.c` | Simulator stub (console log) |
| `web/src/lib/queue/light-controller.ts` | Server-side light state machine + MQTT publish |

### Modified Files
| File | Change |
|------|--------|
| `kiosk-terminal/src/net/mqtt_transport.h` | Multi-topic subscribe support (array instead of single topic) |
| `kiosk-terminal/src/hal_sim/sim_mqtt_transport.c` | Support multiple subscriptions |
| `kiosk-terminal/src/hal_esp32/esp32_mqtt_transport.c` | Support multiple subscriptions |
| `kiosk-terminal/src/data/live/live_data_provider.c` | Subscribe to `freq/lights` on startup |
| `kiosk-terminal/src/ui/screens/queue_board.c` | Add light status indicator in top-right controls |
| `kiosk-terminal/CMakeLists.txt` | Add relay source files |
| `kiosk-terminal/platformio.ini` | Add `RELAY_GPIO=6` build flag |
| `web/src/lib/mqtt.ts` | Add `publishLightsCommand()` function |
| `web/src/lib/queue/queue-processor.ts` | Import and call light controller |
| `web/.env.local.example` | Document new env vars |

---

## Task 1: Multi-Topic MQTT Subscribe Support

The kiosk MQTT transport currently stores a single topic (`s_topic`). Adding `freq/lights` requires supporting multiple subscriptions.

### 1.1 — Update mqtt_transport.h

**File:** `kiosk-terminal/src/net/mqtt_transport.h`

Replace the single-topic subscribe with a multi-topic API:

```c
#pragma once

#include <stdbool.h>
#include <stddef.h>

typedef void (*mqtt_message_cb_t)(const char *topic, const char *payload,
                                  size_t payload_len, void *user_data);

typedef struct {
  const char *broker;
  const char *username;
  const char *password;
} mqtt_config_t;

bool mqtt_transport_start(const mqtt_config_t *cfg, mqtt_message_cb_t cb, void *user_data);
void mqtt_transport_subscribe(const char *topic);
void mqtt_transport_poll(void);
bool mqtt_transport_connected(void);
```

No changes needed to the header — the interface is fine. The multi-topic support goes in the implementations.

### 1.2 — Update simulator MQTT transport

**File:** `kiosk-terminal/src/hal_sim/sim_mqtt_transport.c`

Change from single `s_topic` to an array of subscribed topics. On connect, subscribe to all of them.

```c
#include "../net/mqtt_transport.h"
#include <mosquitto.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#define MAX_SUBSCRIPTIONS 8

static struct mosquitto *s_mosq = NULL;
static mqtt_message_cb_t s_cb = NULL;
static void *s_user_data = NULL;
static char s_topics[MAX_SUBSCRIPTIONS][128];
static int s_topic_count = 0;
static bool s_connected = false;

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

  int rc = mosquitto_connect_async(s_mosq, host, port, 30);
  if (rc != MOSQ_ERR_SUCCESS) {
    fprintf(stderr, "[mqtt] connect_async failed: %s\n", mosquitto_strerror(rc));
    return false;
  }
  return true;
}

void mqtt_transport_subscribe(const char *topic) {
  if (s_topic_count >= MAX_SUBSCRIPTIONS) return;
  /* Avoid duplicates */
  for (int i = 0; i < s_topic_count; i++) {
    if (strcmp(s_topics[i], topic) == 0) return;
  }
  snprintf(s_topics[s_topic_count], sizeof(s_topics[0]), "%s", topic);
  s_topic_count++;
  if (s_connected && s_mosq) {
    mosquitto_subscribe(s_mosq, NULL, topic, 0);
  }
}

void mqtt_transport_poll(void) {
  if (s_mosq) mosquitto_loop(s_mosq, 0, 1);
}

bool mqtt_transport_connected(void) {
  return s_connected;
}
```

### 1.3 — Update ESP32 MQTT transport

**File:** `kiosk-terminal/src/hal_esp32/esp32_mqtt_transport.c`

Same multi-topic array pattern:

```c
#include "../net/mqtt_transport.h"
#include <string.h>

#include "mqtt_client.h"
#include "esp_crt_bundle.h"
#include "esp_log.h"
#include "esp_event.h"
#include "esp_netif.h"

#define MAX_SUBSCRIPTIONS 8

static const char *TAG = "mqtt";

static esp_mqtt_client_handle_t s_client    = NULL;
static mqtt_message_cb_t        s_cb        = NULL;
static void                    *s_user_data = NULL;
static char                     s_topics[MAX_SUBSCRIPTIONS][128];
static int                      s_topic_count = 0;
static bool                     s_connected  = false;
static bool                     s_mqtt_started = false;

static void ip_event_handler(void *arg, esp_event_base_t event_base,
                             int32_t event_id, void *event_data) {
  (void)arg; (void)event_base; (void)event_data;
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
  (void)handler_args; (void)base;
  esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;

  switch (event_id) {
    case MQTT_EVENT_CONNECTED:
      ESP_LOGI(TAG, "connected");
      s_connected = true;
      for (int i = 0; i < s_topic_count; i++) {
        esp_mqtt_client_subscribe(s_client, s_topics[i], 0);
      }
      break;

    case MQTT_EVENT_DISCONNECTED:
      ESP_LOGI(TAG, "disconnected");
      s_connected = false;
      break;

    case MQTT_EVENT_DATA:
      if (event->data_len < event->total_data_len) {
        ESP_LOGW(TAG, "chunked payload (%d/%d) — skipped",
                 event->data_len, event->total_data_len);
        break;
      }
      if (s_cb && event->data && event->topic) {
        char topic_buf[256];
        int tlen = event->topic_len;
        if (tlen >= (int)sizeof(topic_buf)) tlen = (int)sizeof(topic_buf) - 1;
        memcpy(topic_buf, event->topic, tlen);
        topic_buf[tlen] = '\0';
        s_cb(topic_buf, event->data, (size_t)event->data_len, s_user_data);
      }
      break;

    case MQTT_EVENT_ERROR:
      ESP_LOGE(TAG, "transport error");
      break;

    default:
      break;
  }
}

bool mqtt_transport_start(const mqtt_config_t *cfg, mqtt_message_cb_t cb,
                          void *user_data) {
  if (!cfg || !cfg->broker || !cfg->broker[0]) return false;

  s_cb        = cb;
  s_user_data = user_data;
  s_topic_count = 0;

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

  s_mqtt_started = false;
  esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, ip_event_handler, NULL);

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
  if (s_topic_count >= MAX_SUBSCRIPTIONS) return;
  for (int i = 0; i < s_topic_count; i++) {
    if (strcmp(s_topics[i], topic) == 0) return;
  }
  snprintf(s_topics[s_topic_count], sizeof(s_topics[0]), "%s", topic);
  s_topic_count++;
  if (s_connected && s_client) {
    esp_mqtt_client_subscribe(s_client, topic, 0);
  }
}

void mqtt_transport_poll(void) { /* no-op on ESP32 */ }

bool mqtt_transport_connected(void) {
  return s_connected;
}
```

### 1.4 — Verify simulator builds

Run: `cd kiosk-terminal && cmake -B build -S . && cmake --build build -j 2>&1 | grep -v "pn532_is_online"`
Expected: builds clean, no errors

---

## Task 2: Relay HAL — Portable Interface + Implementations

### 2.1 — Create relay.h

**File:** `kiosk-terminal/src/net/relay.h`

```c
#pragma once

#include <stdbool.h>

/* Portable relay interface. Controls the court lights relay via GPIO. */

void relay_init(void);
void relay_set(bool on);
bool relay_is_on(void);
```

### 2.2 — Create ESP32 relay driver

**File:** `kiosk-terminal/src/hal_esp32/esp32_relay.c`

```c
#include "../net/relay.h"

#ifdef ESP_PLATFORM

#include "driver/gpio.h"
#include "esp_log.h"

#define RELAY_GPIO    6
#define RELAY_BIT     (1ULL << RELAY_GPIO)

static const char *TAG = "relay";
static bool s_on = false;

void relay_init(void) {
  gpio_config_t io_conf = {
    .pin_bit_mask = RELAY_BIT,
    .mode = GPIO_MODE_OUTPUT,
    .pull_up_en = GPIO_PULLUP_DISABLE,
    .pull_down_en = GPIO_PULLDOWN_DISABLE,
    .intr_type = GPIO_INTR_DISABLE,
  };
  gpio_config(&io_conf);
  gpio_set_level(RELAY_GPIO, 0);
  s_on = false;
  ESP_LOGI(TAG, "initialized on GPIO %d (OFF)", RELAY_GPIO);
}

void relay_set(bool on) {
  if (s_on == on) return;
  s_on = on;
  gpio_set_level(RELAY_GPIO, on ? 1 : 0);
  ESP_LOGI(TAG, "relay → %s", on ? "ON" : "OFF");
}

bool relay_is_on(void) {
  return s_on;
}

#endif /* ESP_PLATFORM */
```

### 2.3 — Create simulator relay stub

**File:** `kiosk-terminal/src/hal_sim/sim_relay.c`

```c
#include "../net/relay.h"

#ifndef ESP_PLATFORM

#include <stdio.h>
#include <stdbool.h>

static bool s_on = false;

void relay_init(void) {
  s_on = false;
  printf("[relay] initialized (simulator, GPIO 6)\n");
}

void relay_set(bool on) {
  if (s_on == on) return;
  s_on = on;
  printf("[relay] → %s\n", on ? "ON" : "OFF");
}

bool relay_is_on(void) {
  return s_on;
}

#endif /* !ESP_PLATFORM */
```

### 2.4 — Add to CMakeLists.txt

**File:** `kiosk-terminal/CMakeLists.txt`

Add `src/hal_sim/sim_relay.c` to the `kiosk_sim` source list (after `sim_nfc_reader.c`):

```cmake
  src/hal_sim/sim_nfc_reader.c
  src/hal_sim/sim_relay.c
```

### 2.5 — Add to platformio.ini

**File:** `kiosk-terminal/platformio.ini`

Add relay GPIO define to build_flags:

```ini
build_flags =
    -DLV_CONF_INCLUDE_SIMPLE
    -DBOARD_HAS_PSRAM
    -DRELAY_GPIO=6
    -I${PROJECT_DIR}
    -I${PROJECT_DIR}/src
```

### 2.6 — Verify simulator builds

Run: `cd kiosk-terminal && cmake -B build -S . && cmake --build build -j 2>&1 | grep -v "pn532_is_online"`
Expected: builds clean

---

## Task 3: Kiosk MQTT — Subscribe to `freq/lights` + Handle Payload

### 3.1 — Add lights subscription to live_data_provider.c

**File:** `kiosk-terminal/src/data/live/live_data_provider.c`

Add `#include "../../net/relay.h"` at the top. In `live_data_provider_start()`, after the existing `mqtt_transport_subscribe("freq/board")` line, add:

```c
    mqtt_transport_subscribe("freq/lights");
```

### 3.2 — Add lights message handler to live_data_provider.c

**File:** `kiosk-terminal/src/data/live/live_data_provider.c`

Add a `#include <cJSON.h>` at the top.

Add a new static function before `on_board_message`:

```c
static void on_lights_message(const char *topic, const char *payload, size_t len, void *user_data) {
  (void)topic; (void)user_data;
  char *buf = malloc(len + 1);
  if (!buf) return;
  memcpy(buf, payload, len);
  buf[len] = '\0';

  cJSON *json = cJSON_Parse(buf);
  free(buf);
  if (!json) return;

  cJSON *state = cJSON_GetObjectItem(json, "state");
  if (cJSON_IsString(state)) {
    relay_set(strcmp(state->valuestring, "ON") == 0);
  }
  cJSON_Delete(json);
}
```

### 3.3 — Route lights messages to the handler

**File:** `kiosk-terminal/src/data/live/live_data_provider.c`

The current `on_board_message` handles ALL MQTT messages. We need to route by topic. Modify the callback registration and the message handler.

Replace the current `mqtt_transport_start(&cfg, on_board_message, NULL)` call with a new dispatcher:

```c
static void on_mqtt_message(const char *topic, const char *payload,
                            size_t len, void *user_data) {
  if (strcmp(topic, "freq/board") == 0) {
    on_board_message(topic, payload, len, user_data);
  } else if (strcmp(topic, "freq/lights") == 0) {
    on_lights_message(topic, payload, len, user_data);
  }
}
```

And change the `mqtt_transport_start` call to:

```c
    mqtt_transport_start(&cfg, on_mqtt_message, NULL);
```

### 3.4 — Verify simulator builds

Run: `cd kiosk-terminal && cmake -B build -S . && cmake --build build -j 2>&1 | grep -v "pn532_is_online"`
Expected: builds clean

---

## Task 4: Kiosk Light Status Indicator on Idle Screen

### 4.1 — Add indicator to queue_board.c

**File:** `kiosk-terminal/src/ui/screens/queue_board.c`

Add `#include "../../net/relay.h"` at the top.

In `queue_board_create`, between the NFC status label and the theme switch, add a light indicator:

```c
  /* Light status indicator */
  lv_obj_t *lights_status = lv_label_create(top_right);
  if (relay_is_on()) {
      lv_label_set_text(lights_status, LV_SYMBOL_EYE_OPEN " LIGHTS: ON");
      lv_obj_set_style_text_color(lights_status, kiosk_theme_color_success(), 0);
  } else {
      lv_label_set_text(lights_status, LV_SYMBOL_EYE_CLOSE " LIGHTS: OFF");
      lv_obj_set_style_text_color(lights_status, kiosk_theme_color_text_muted(), 0);
  }
  lv_obj_set_style_text_font(lights_status, &lv_font_montserrat_14, 0);
```

Place this BEFORE the NFC status label so the order is: `lights | NFC | theme toggle`.

The full top_right block becomes:

```c
  lv_obj_t *top_right = lv_obj_create(root);
  lv_obj_remove_style_all(top_right);
  lv_obj_set_size(top_right, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(top_right, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(top_right, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(top_right, 16, 0);

  /* Light status indicator */
  lv_obj_t *lights_status = lv_label_create(top_right);
  if (relay_is_on()) {
      lv_label_set_text(lights_status, LV_SYMBOL_EYE_OPEN " LIGHTS: ON");
      lv_obj_set_style_text_color(lights_status, kiosk_theme_color_success(), 0);
  } else {
      lv_label_set_text(lights_status, LV_SYMBOL_EYE_CLOSE " LIGHTS: OFF");
      lv_obj_set_style_text_color(lights_status, kiosk_theme_color_text_muted(), 0);
  }
  lv_obj_set_style_text_font(lights_status, &lv_font_montserrat_14, 0);

  lv_obj_t *nfc_status = lv_label_create(top_right);
  /* ... existing NFC label code ... */

  lv_obj_t *theme_sw = lv_switch_create(top_right);
  /* ... existing theme switch code ... */
```

### 4.2 — Verify simulator builds and runs

Run: `cd kiosk-terminal && cmake -B build -S . && cmake --build build -j 2>&1 | grep -v "pn532_is_online" && ./build/kiosk_sim`
Expected: builds clean, launches, idle screen shows "LIGHTS: OFF" in top-right

### 4.3 — Commit kiosk changes

```bash
cd kiosk-terminal && git add -A && git commit -m "feat(kiosk): add relay HAL, multi-topic MQTT, and lights indicator"
```

---

## Task 5: Server-Side MQTT Publisher for Lights

### 5.1 — Add publishLightsCommand to mqtt.ts

**File:** `web/src/lib/mqtt.ts`

Add at the end of the file:

```typescript
// ── Lights Control ──────────────────────────────────────────────────────────

export async function publishLightsCommand(state: 'ON' | 'OFF'): Promise<boolean> {
  try {
    const c = await connectMqtt();
    if (!c) return false;
    return new Promise((resolve) => {
      c.publish(
        'freq/lights',
        JSON.stringify({ state }),
        { qos: 1, retain: true },
        (err) => {
          if (err) {
            console.error('[mqtt] publishLightsCommand error:', err);
            resolve(false);
          } else {
            console.log(`[mqtt] lights → ${state}`);
            resolve(true);
          }
        }
      );
    });
  } catch (err) {
    console.error('[mqtt] publishLightsCommand error:', err);
    return false;
  }
}
```

---

## Task 6: Server-Side Light Controller State Machine

### 6.1 — Create light-controller.ts

**File:** `web/src/lib/queue/light-controller.ts`

```typescript
import { createClient } from '@/lib/supabase/server';
import { publishLightsCommand } from '@/lib/mqtt';

type LightState = 'OFF' | 'ON' | 'WAITING';

const g = globalThis as typeof globalThis & {
  _lightState?: LightState;
  _lightWaitTimer?: ReturnType<typeof setTimeout> | null;
  _lightLastPublish?: 'ON' | 'OFF' | null;
};

if (!g._lightState) g._lightState = 'OFF';
if (!g._lightWaitTimer) g._lightWaitTimer = null;
if (!g._lightLastPublish) g._lightLastPublish = null;

const SUNSET_HOUR = parseInt(process.env.LIGHT_SUNSET_HOUR ?? '18', 10);
const WAIT_MINUTES = parseInt(process.env.LIGHT_WAIT_MINUTES ?? '10', 10);

function isEvening(): boolean {
  const hour = new Date().getHours();
  return hour >= SUNSET_HOUR;
}

async function sendCommand(state: 'ON' | 'OFF'): Promise<void> {
  if (g._lightLastPublish === state) return;
  g._lightLastPublish = state;
  await publishLightsCommand(state);
}

function clearWaitTimer(): void {
  if (g._lightWaitTimer) {
    clearTimeout(g._lightWaitTimer);
    g._lightWaitTimer = null;
  }
}

export async function evaluateLights(): Promise<void> {
  const supabase = await createClient();

  const { data: courts } = await supabase
    .from('courts')
    .select('status');

  const hasActiveGame = courts?.some(c => c.status === 'In Game') ?? false;

  switch (g._lightState) {
    case 'OFF':
      if (hasActiveGame && isEvening()) {
        await sendCommand('ON');
        g._lightState = 'ON';
      }
      break;

    case 'ON':
      if (!hasActiveGame) {
        g._lightState = 'WAITING';
        clearWaitTimer();
        g._lightWaitTimer = setTimeout(async () => {
          await sendCommand('OFF');
          g._lightState = 'OFF';
          g._lightWaitTimer = null;
        }, WAIT_MINUTES * 60 * 1000);
      }
      break;

    case 'WAITING':
      if (hasActiveGame) {
        clearWaitTimer();
        g._lightState = 'ON';
      }
      break;
  }
}
```

### 6.2 — Add .env.local.example entries

**File:** `web/.env.local.example`

Add at the end:

```
# Court lights control
LIGHT_SUNSET_HOUR=18
LIGHT_WAIT_MINUTES=10
```

---

## Task 7: Wire Light Controller into Queue Processor

### 7.1 — Import and call in queue-processor.ts

**File:** `web/src/lib/queue/queue-processor.ts`

Add at the top:

```typescript
import { evaluateLights } from './light-controller';
```

Add at the end of `processAllCourts()`, after the for loop but inside the try block:

```typescript
    await evaluateLights();
```

### 7.2 — Commit server changes

```bash
cd web && git add -A && git commit -m "feat(server): add court lights control with MQTT publisher and state machine"
```

---

## Task 8: End-to-End Verification

### 8.1 — Simulator test

```bash
cd kiosk-terminal && cmake -B build -S . && cmake --build build -j 2>&1 | grep -v "pn532_is_online" && ./build/kiosk_sim
```

Expected: Idle screen shows "LIGHTS: OFF" in top-right. In a separate terminal, publish a test MQTT message:

```bash
mosquitto_pub -h <broker_host> -t "freq/lights" -m '{"state":"ON"}' -u <username> -P <password>
```

Expected: Simulator console prints `[relay] → ON`, screen indicator updates to "LIGHTS: ON" (green).

Send OFF:

```bash
mosquitto_pub -h <broker_host> -t "freq/lights" -m '{"state":"OFF"}' -u <username> -P <password>
```

Expected: Console prints `[relay] → OFF`, indicator updates to "LIGHTS: OFF" (gray).

### 8.2 — Hardware test

Flash ESP32-S3, connect relay module to GPIO 6 + 5V + GND on the 3-pin header. Send MQTT commands from HiveMQ Cloud dashboard. Verify relay clicks and indicator shows on screen.

### 8.3 — Server test

Start a game in the web dashboard during evening hours (after sunset hour). Verify kiosk receives ON command. End game, verify OFF after wait period.
