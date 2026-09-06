#pragma once

#include "kiosk_model.h"

/* Abstract data source for the kiosk UI. The mock implementation
 * (mock/mock_data_provider.c) is the only implementation in this phase;
 * a later phase adds a real HTTP/MQTT-backed implementation of the exact
 * same vtable, and none of src/ui/ needs to change when that happens. */

typedef struct {
  void (*get_board)(kiosk_board_t *out);
  void (*get_court_options)(court_option_t *out, uint8_t *count);
  void (*get_products_config)(kiosk_products_config_t *out);

  /* Returns false if the RFID/test id isn't recognized. */
  bool (*lookup_member)(const char *rfid, kiosk_member_t *out);

  /* Submits a booking request. Returns false + *out_error on failure
   * (e.g. insufficient credits). On success, fills *out_result. */
  bool (*join_queue)(const char *member_id, const char *court_id, game_type_t game_type,
                      int32_t duration_min, const char *match_title,
                      booking_result_t *out_result, kiosk_error_t *out_error);

  bool (*cancel_waiting)(const char *member_id, kiosk_error_t *out_error);
  bool (*is_ready)(void);
  uint32_t (*get_board_version)(void);
} kiosk_data_provider_t;

const kiosk_data_provider_t *kiosk_data_provider_get(void);
