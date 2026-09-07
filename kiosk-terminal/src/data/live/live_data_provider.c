#include "live_data_provider.h"
#include "../../net/freq_rest_client.h"
#include "../../net/mqtt_transport.h"
#include "../../net/board_parser.h"
#include "../../net/relay.h"
#include <cJSON.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <stddef.h>

/* Latest board, updated on each `freq/board` MQTT message. The MQTT client is
 * pumped from the UI thread (mqtt_transport_poll via an LVGL timer in main),
 * so this cache is only ever touched from one thread — no locking needed. */
static kiosk_board_t s_board;
static bool s_have_board = false;
static uint32_t s_board_version = 1;

/* The board publisher includes a freshly computed ETA on every snapshot.
 * Those values move with wall-clock time and must not be treated as a layout
 * change: doing so makes the kiosk rebuild the entire idle screen every time
 * the server publishes, which is visible as a flash (especially with two
 * active court cards). */
static bool boards_equal_for_layout(const kiosk_board_t *a, const kiosk_board_t *b) {
  if (a->court_count != b->court_count || a->queue_count != b->queue_count) return false;
  if (memcmp(&a->config, &b->config, sizeof(a->config)) != 0) return false;
  if (memcmp(a->courts, b->courts, (size_t)a->court_count * sizeof(a->courts[0])) != 0) return false;

  /* Queue ETA text/start time are recomputed from serverTime on every
   * publish. Compare only the stable prefix of each row so those clock-only
   * updates cannot trigger a full LVGL tree rebuild. */
  const size_t stable_row_size = offsetof(queue_row_t, estimated_wait);
  for (uint8_t i = 0; i < a->queue_count; i++) {
    if (memcmp(&a->queue[i], &b->queue[i], stable_row_size) != 0) return false;
    if (strcmp(a->queue[i].simulated_court_name, b->queue[i].simulated_court_name) != 0) return false;
  }
  return true;
}

#ifdef ESP_PLATFORM
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
static SemaphoreHandle_t s_board_mutex = NULL;
#define LOCK_BOARD()   if (s_board_mutex) xSemaphoreTake(s_board_mutex, portMAX_DELAY)
#define UNLOCK_BOARD() if (s_board_mutex) xSemaphoreGive(s_board_mutex)
#else
#define LOCK_BOARD()
#define UNLOCK_BOARD()
#endif

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

static void on_board_message(const char *topic, const char *payload, size_t len, void *user_data) {
  (void)topic; (void)user_data;
  kiosk_board_t *parsed = malloc(sizeof(kiosk_board_t));
  if (!parsed) return;
  if (board_parse(payload, len, parsed)) {
    LOCK_BOARD();
    if (!s_have_board || !boards_equal_for_layout(&s_board, parsed)) {
      s_board = *parsed;
      s_have_board = true;
      s_board_version++;
    } else {
      /* Keep the latest data available to the queue widget without asking the
       * UI to recreate every card just because an ETA string ticked. */
      s_board = *parsed;
    }
    UNLOCK_BOARD();
  }
  free(parsed);
}

static void on_mqtt_message(const char *topic, const char *payload,
                            size_t len, void *user_data) {
  if (strcmp(topic, "freq/board") == 0) {
    on_board_message(topic, payload, len, user_data);
  } else if (strcmp(topic, "freq/lights") == 0) {
    on_lights_message(topic, payload, len, user_data);
  }
}

// ── kiosk_data_provider_t implementation ────────────────────────────────────

static void get_board(kiosk_board_t *out) {
  LOCK_BOARD();
  if (s_have_board) *out = s_board;
  else memset(out, 0, sizeof(*out));
  UNLOCK_BOARD();

  /* Project scheduled games locally between MQTT snapshots. A client that
   * received a schedule before its start time must still show it as active at
   * 09:40 when its 09:30-09:50 window is in progress. Queue estimates are
   * explicitly excluded; they become active only after server promotion. */
  time_t now = time(NULL);
  for (uint8_t i = 0; i < out->court_count; i++) {
    court_status_t *court = &out->courts[i];
    /* A client may not receive another MQTT message at the exact end of a
     * scheduled game. Expire the locally displayed active game from its
     * schedule window instead of leaving a lapsed booking on screen. */
    if (court->start_time != 0) {
      time_t active_end = court->start_time + court->duration_min * 60;
      if (court->duration_min > 0 && now >= active_end) {
        court->start_time = 0;
        court->duration_min = 0;
        court->match_type[0] = '\0';
        court->match_title[0] = '\0';
        court->player_count = 0;
        memset(court->players, 0, sizeof(court->players));
      } else {
        continue;
      }
    }

    if (!court->next_is_scheduled || court->next_start_time == 0) continue;
    time_t end = court->next_start_time + court->next_duration_min * 60;
    if (now >= court->next_start_time && now < end) {
      char title[KIOSK_MAX_NAME_LEN];
      snprintf(title, sizeof(title), "%s", court->next_match_title);
      memcpy(court->match_title, title, sizeof(court->match_title));
      court->start_time = court->next_start_time;
      court->duration_min = court->next_duration_min;
      memcpy(court->players, court->next_players, sizeof(court->players));
      court->player_count = court->next_player_count;
    }
  }
}

static void get_court_options(court_option_t *out, uint8_t *count) {
  uint8_t n = 0;
  LOCK_BOARD();
  if (s_have_board) {
    for (uint8_t i = 0; i < s_board.court_count && n < KIOSK_MAX_COURTS; i++) {
      const court_status_t *c = &s_board.courts[i];
      court_option_t *o = &out[n++];
      memset(o, 0, sizeof(*o));
      snprintf(o->id, sizeof(o->id), "%s", c->id);
      snprintf(o->name, sizeof(o->name), "%s", c->name);
      snprintf(o->status, sizeof(o->status), "%s", court_is_active(c) ? "Playing" : "Available");
    }
  }
  UNLOCK_BOARD();
  *count = n;
}

static void get_products_config(kiosk_products_config_t *out) {
  /* Durations/rates come from the board's config (from the API). Fall back to
   * seed defaults only if the board hasn't been received yet. */
  LOCK_BOARD();
  if (s_have_board && s_board.config.duration_count > 0) {
    *out = s_board.config;
    UNLOCK_BOARD();
    return;
  }
  UNLOCK_BOARD();
  memset(out, 0, sizeof(*out));
  const int32_t durations[] = { 30, 60, 90 };
  const int32_t rates[] = { 150, 300, 450 };
  out->duration_count = 3;
  for (uint8_t i = 0; i < 3; i++) { out->durations_min[i] = durations[i]; out->rates[i] = rates[i]; }
  out->prep_time_sec = 300;
}

static bool lookup_member(const char *rfid, kiosk_member_t *out) {
  freq_rest_result_t r = freq_rest_lookup_member(rfid, out);
  return r.ok;
}

static bool join_queue(const char *member_id, const char *court_id, game_type_t game_type,
                       int32_t duration_min, const char *match_title,
                       booking_result_t *out_result, kiosk_error_t *out_error) {
  const char *players[1] = { member_id };
  int32_t party_size = (game_type == GAME_TYPE_2V2) ? 4 : 2;
  char start_iso[32];
  /* ISO-8601 UTC "now". */
  time_t now = time(NULL);
  struct tm tm_utc;
  gmtime_r(&now, &tm_utc);
  strftime(start_iso, sizeof(start_iso), "%Y-%m-%dT%H:%M:%SZ", &tm_utc);

  freq_join_response_t resp;
  freq_rest_result_t r = freq_rest_join_queue(
      member_id, start_iso, duration_min, party_size,
      players, 1,
      (court_id && court_id[0]) ? court_id : NULL,
      (match_title && match_title[0]) ? match_title : NULL,
      &resp);

  if (!r.ok) {
    snprintf(out_error->title, sizeof(out_error->title), "Unable to Join Queue");
    snprintf(out_error->message, sizeof(out_error->message), "%s", r.error);
    return false;
  }

  memset(out_result, 0, sizeof(*out_result));
  out_result->duration_min = duration_min;
  out_result->success = (strcmp(resp.status, "completed") == 0);
  snprintf(out_result->court_name, sizeof(out_result->court_name), "%s", resp.court_name);
  /* Credits/balance aren't returned by the join endpoint; left at 0 for now. */
  return true;
}

static bool cancel_waiting(const char *member_id, kiosk_error_t *out_error) {
  bool cancelled = false;
  freq_rest_result_t result = { 0 };

  LOCK_BOARD();
  if (s_have_board) {
    for (uint8_t i = 0; i < s_board.queue_count; i++) {
      if (strcmp(s_board.queue[i].member_id, member_id) == 0) {
        result = freq_rest_cancel_queue(s_board.queue[i].id);
        cancelled = result.ok;
        break;
      }
    }
  }
  UNLOCK_BOARD();

  if (out_error) {
    if (!cancelled) {
      snprintf(out_error->title, sizeof(out_error->title), "Cancel Failed");
      snprintf(out_error->message, sizeof(out_error->message), "%s",
               result.error[0] ? result.error : "No active booking found on the board.");
    } else {
      out_error->title[0] = '\0';
      out_error->message[0] = '\0';
    }
  }
  return cancelled;
}

static bool end_game(const char *member_id, const char *game_id, kiosk_error_t *out_error) {
  freq_rest_result_t result = freq_rest_end_game(member_id, game_id);
  if (!result.ok && out_error) {
    snprintf(out_error->title, sizeof(out_error->title), "End Game Failed");
    snprintf(out_error->message, sizeof(out_error->message), "%s",
             result.error[0] ? result.error : "Unable to end match.");
  } else if (out_error) {
    out_error->title[0] = '\0';
    out_error->message[0] = '\0';
  }
  return result.ok;
}

static bool is_ready(void) {
  LOCK_BOARD();
  bool ready = s_have_board;
  UNLOCK_BOARD();
  return ready;
}

static uint32_t get_board_version(void) {
  LOCK_BOARD();
  uint32_t version = s_board_version;
  UNLOCK_BOARD();
  return version;
}

static const kiosk_data_provider_t s_live_provider = {
  .get_board = get_board,
  .get_court_options = get_court_options,
  .get_products_config = get_products_config,
  .lookup_member = lookup_member,
  .join_queue = join_queue,
  .cancel_waiting = cancel_waiting,
  .end_game = end_game,
  .is_ready = is_ready,
  .get_board_version = get_board_version,
};

void live_data_provider_start(const char *server_url, const char *api_key,
                              const char *mqtt_broker, const char *mqtt_user,
                              const char *mqtt_pass) {
#ifdef ESP_PLATFORM
  if (!s_board_mutex) {
    s_board_mutex = xSemaphoreCreateMutex();
  }
#endif

  LOCK_BOARD();
  memset(&s_board, 0, sizeof(s_board));
  s_have_board = false;
  UNLOCK_BOARD();

  freq_rest_init((server_url && server_url[0]) ? server_url : "http://localhost:3000",
                 (api_key && api_key[0]) ? api_key : NULL);

  mqtt_config_t cfg = { mqtt_broker, mqtt_user, mqtt_pass };
  if (mqtt_broker && mqtt_broker[0]) {
    mqtt_transport_start(&cfg, on_mqtt_message, NULL);
    mqtt_transport_subscribe("freq/board");
    mqtt_transport_subscribe("freq/lights");
  }
  
  /* Send a non-blocking ping to the Next.js API to wake it up in case it is sleeping on a serverless platform (Vercel) */
  /* The kiosk connects directly to MQTT; publishing display wake requests is
   * a controller-only operation and requires a staff/controller API key. */
}

const kiosk_data_provider_t *live_data_provider_get(void) {
  return &s_live_provider;
}
