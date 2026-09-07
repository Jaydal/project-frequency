#pragma once

#include "../data/kiosk_model.h"
#include "../data/kiosk_config.h"
#include <stdbool.h>
#include <stddef.h>

/* REST client for the Freq web backend (the web/src/app/api routes).
 *
 * Uses the portable http_transport interface, so it works in the simulator
 * (libcurl) and on the ESP32-S3 (esp_http_client) without changes.
 *
 * Endpoint coverage vs. the live backend:
 *   GET    /api/controller/config          -> freq_rest_fetch_mqtt_config
 *   GET    /api/controller/member/{rfid}   -> freq_rest_lookup_member
 *   POST   /api/queue                      -> freq_rest_join_queue
 *   DELETE /api/queue/{id}                 -> freq_rest_cancel_queue
 *
 * Auth: every request carries `x-device-id` (allowlist) and, when a legacy key
 * is still saved in config, `x-api-key`.
 *
 * The live board (court cards + now-serving + queue) does NOT come through
 * this REST client — the backend publishes it to MQTT (topic `freq/board`,
 * see board_parser.h), which the kiosk subscribes to. This REST client covers
 * the request/response actions (RFID lookup + booking); MQTT covers the board.
 */

typedef struct {
  bool ok;            /* true if the call completed with a 2xx status      */
  long http_status;   /* raw HTTP status; 0 = transport/connection failure */
  char error[128];    /* human-readable message when ok == false           */
} freq_rest_result_t;

/* Returns the normalized hardware identity used by the device allowlist. */
void freq_device_id_get(char *out, size_t out_size);

/* Call once at startup. base_url like "http://192.168.1.50:3000" (no trailing
 * slash). api_key may be NULL if the controller endpoints are open (dev). */
void freq_rest_init(const char *base_url, const char *api_key);

/* POST /api/display/publish-all to wake Vercel */
void freq_rest_wake_server(void);

typedef struct {
  char broker[KIOSK_CONFIG_URL_LEN];
  char username[KIOSK_CONFIG_SSID_LEN];
  char password[KIOSK_CONFIG_PASS_LEN];
  char board_topic[64];
  char display_topic_prefix[64];
} freq_mqtt_config_t;

/* GET /api/controller/config. Requires the configured controller API key. */
freq_rest_result_t freq_rest_fetch_mqtt_config(freq_mqtt_config_t *out);

/* GET /api/controller/member/{rfid}. Fills out->{id,member_id,first_name,
 * last_name,balance,decision}; the caller then routes on out->decision.type. */
freq_rest_result_t freq_rest_lookup_member(const char *rfid, kiosk_member_t *out);

typedef struct {
  char status[16];                         /* "completed" | "waiting" | "offered" */
  char entry_id[KIOSK_MAX_ID_LEN];
  char court_name[KIOSK_MAX_NAME_LEN];     /* set when status == "completed"      */
  int32_t position;                        /* set when status == "waiting"        */
  char estimated_wait[16];                 /* set when status == "waiting"        */
} freq_join_response_t;

/* POST /api/queue. player_uuids has player_count entries (1..4).
 * court_uuid and match_title may be NULL. start_iso is an ISO-8601 string. */
freq_rest_result_t freq_rest_join_queue(const char *member_uuid, const char *start_iso,
                                        int32_t duration_min, int32_t party_size,
                                        const char *const *player_uuids, size_t player_count,
                                        const char *court_uuid, const char *match_title,
                                        freq_join_response_t *out);

/* DELETE /api/queue/{id}. */
freq_rest_result_t freq_rest_cancel_queue(const char *entry_id);

/* POST /api/terminal/game/end. Ends active game early. */
freq_rest_result_t freq_rest_end_game(const char *member_uuid, const char *game_uuid);

/* POST /api/queue/advance. The kiosk calls this when a locally observed game
 * window ends; the server remains responsible for selecting/promoting the
 * correct queue entry. */
freq_rest_result_t freq_rest_advance_queue(void);
