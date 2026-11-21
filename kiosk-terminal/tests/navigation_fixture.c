#include "data/live/live_data_provider.h"
#include "net/wifi_scanner.h"
#include "net/nfc_reader.h"
#include <stdio.h>
#include "net/freq_rest_client.h"
#include <string.h>

/* Isolate UI actions from disk, Wi-Fi, physical cards and paid bookings. */
kiosk_board_t fixture_board = {
  .config = {.duration_count = 1, .durations_min = {60}, .rates = {10}},
  .court_count = 2,
  .courts = {{.id = "one", .name = "Court 1"}, {.id = "two", .name = "Court 2"}}
};
unsigned fixture_reads, fixture_joins, fixture_cancellations, fixture_ends;
uint32_t fixture_version = 1;

static void board(kiosk_board_t *out) { ++fixture_reads; *out = fixture_board; }
static void products(kiosk_products_config_t *out) { *out = fixture_board.config; }
static uint32_t version(void) { return fixture_version; }
static bool ready(void) { return true; }
static void options(court_option_t *out, uint8_t *count) {
  *out = (court_option_t){.id = "one", .name = "Court 1", .status = "Available"};
  *count = 1;
}
static bool join(const char *member, const char *court, game_type_t game, int32_t duration,
                 const char *title, booking_result_t *result, kiosk_error_t *error) {
  ++fixture_joins;
  *result = (booking_result_t){.success = true};
  return true;
}
static bool cancel(const char *member, const char *entry, kiosk_error_t *error) {
  ++fixture_cancellations;
  return true;
}
static bool end(const char *member, const char *game, kiosk_error_t *error) {
  ++fixture_ends;
  return true;
}

const kiosk_data_provider_t *live_data_provider_get(void) {
  static const kiosk_data_provider_t provider = {
    .get_board = board, .get_court_options = options, .get_products_config = products,
    .join_queue = join, .cancel_waiting = cancel, .end_game = end,
    .get_board_version = version, .is_ready = ready
  };
  return &provider;
}
void live_data_provider_start(const char *url, const char *key, const char *broker,
                              const char *user, const char *pass) {}
void freq_rest_init(const char *url, const char *key) {}
freq_rest_result_t freq_rest_fetch_mqtt_config(freq_mqtt_config_t *out) {
  return (freq_rest_result_t){0};
}
freq_rest_result_t freq_rest_lookup_member(const char *rfid, kiosk_member_t *out) {
  *out = (kiosk_member_t){.id = "test", .first_name = "Member", .balance = 500};
  if (strcmp(rfid, "queued") == 0) out->decision.type = RFID_DECISION_ALREADY_QUEUED;
  else if (strcmp(rfid, "playing") == 0) out->decision.type = RFID_DECISION_ALREADY_ACTIVE;
  else out->decision.type = RFID_DECISION_PLAY_NOW;
  return (freq_rest_result_t){.ok = strcmp(rfid, "invalid") != 0};
}
bool kiosk_config_exists(void) { return true; }
bool kiosk_config_load(kiosk_config_t *out) {
  *out = (kiosk_config_t){.wifi_ssid = "test"};
  return true;
}
bool kiosk_config_save(const kiosk_config_t *cfg) { return true; }
void kiosk_config_defaults(kiosk_config_t *out) { *out = (kiosk_config_t){0}; }

bool fixture_nfc_online;
bool nfc_reader_is_online(void) { return fixture_nfc_online; }

/* Let the test deliver a radio result after a dialog has been dismissed. */
static kiosk_wifi_scan_cb_t pending_scan;
static void *pending_scan_data;
void kiosk_wifi_scan_start(kiosk_wifi_scan_cb_t callback, void *data) {
  pending_scan = callback;
  pending_scan_data = data;
}
void fixture_finish_scan(void) {
  kiosk_wifi_ap_t aps[12];
  for (unsigned i = 0; i < 12; ++i) snprintf(aps[i].ssid, sizeof(aps[i].ssid), "Network %02u", i);
  pending_scan(aps, 12, pending_scan_data);
  pending_scan = NULL;
}
void kiosk_wifi_get_ip(char *out, size_t size) { snprintf(out, size, "127.0.0.1"); }
