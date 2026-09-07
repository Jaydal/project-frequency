#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <time.h>

/* Mirrors web/src/lib/queue/index.ts, the web terminal component prop
 * shapes, and web/src/lib/products-config-types.ts, translated to C structs. */

#define KIOSK_MAX_NAME_LEN 32
#define KIOSK_MAX_ID_LEN   37 /* uuid (36) + NUL */
#define KIOSK_MAX_PLAYERS  4
#define KIOSK_MAX_COURTS   8
#define KIOSK_MAX_QUEUE    16
#define KIOSK_MAX_DURATIONS 4

typedef enum {
  COURT_PHASE_AVAILABLE,
  COURT_PHASE_PREPARING,
  COURT_PHASE_IN_GAME,
} court_phase_t;

typedef struct {
  char first_name[KIOSK_MAX_NAME_LEN];
  char last_name[KIOSK_MAX_NAME_LEN];
} kiosk_player_name_t;

/* One entry in the idle screen's court panel (mirrors CourtStatusData).
 * start_time is the game's epoch-second start; the UI computes elapsed as
 * (now - start_time) each render, so timers advance between board updates. */
typedef struct {
  char id[KIOSK_MAX_ID_LEN];
  char name[KIOSK_MAX_NAME_LEN];
  char match_type[8]; /* "1v1" / "2v2" */
  char match_title[KIOSK_MAX_NAME_LEN];
  time_t start_time;
  int32_t duration_min;
  int32_t prep_time_sec;
  kiosk_player_name_t players[KIOSK_MAX_PLAYERS];
  uint8_t player_count;
  /* Next scheduled game on this court, kept in a reserved fixed slot so
   * displaying it never changes the card's layout during timer ticks. */
  char next_match_title[KIOSK_MAX_NAME_LEN];
  time_t next_start_time;
  int32_t next_duration_min;
  bool next_is_scheduled;
  kiosk_player_name_t next_players[KIOSK_MAX_PLAYERS];
  uint8_t next_player_count;
} court_status_t;

/* effectivePrepSec() from products-config-types.ts: no prep time under 5 min games. */
static inline int32_t kiosk_effective_prep_sec(int32_t duration_min, int32_t configured_prep_sec) {
  return (duration_min < 5) ? 0 : configured_prep_sec;
}

/* phaseForElapsed() from CourtStatusCard.tsx. */
static inline court_phase_t kiosk_phase_for_elapsed(int32_t elapsed_sec, int32_t prep_time_sec) {
  return (elapsed_sec < prep_time_sec) ? COURT_PHASE_PREPARING : COURT_PHASE_IN_GAME;
}

/* Whether a court has an active game window (schedule-derived, live every call). */
static inline bool court_is_active(const court_status_t *c) {
  if (c->start_time == 0) return false;
  int32_t eff_prep = kiosk_effective_prep_sec(c->duration_min, c->prep_time_sec);
  time_t end = c->start_time + eff_prep + c->duration_min * 60;
  return time(NULL) < end;
}

/* Live elapsed seconds since start (0 if no game or before start). */
static inline int32_t court_elapsed_sec(const court_status_t *c) {
  if (c->start_time == 0) return 0;
  int32_t e = (int32_t)(time(NULL) - c->start_time);
  return e < 0 ? 0 : e;
}

/* One row in the idle screen's queue list (mirrors QueueEntryDisplay). */
typedef struct {
  char id[KIOSK_MAX_ID_LEN];
  char member_id[KIOSK_MAX_ID_LEN];
  int32_t position; /* 1-based */
  char first_name[KIOSK_MAX_NAME_LEN];
  char last_name[KIOSK_MAX_NAME_LEN];
  char match_type[8];
  char match_title[KIOSK_MAX_NAME_LEN];
  char court_name[KIOSK_MAX_NAME_LEN]; /* "" -> displayed as "Any" */
  int32_t duration_min;
  char estimated_wait[16]; /* pre-formatted, e.g. "~60 min" */
  time_t estimated_start_time; /* epoch seconds */
  char simulated_court_name[KIOSK_MAX_NAME_LEN];
} queue_row_t;

/* Pricing config (mirrors ProductsConfig); carried in the board snapshot so
 * durations/rates come from the API, never hardcoded on the kiosk. */
typedef struct {
  int32_t durations_min[KIOSK_MAX_DURATIONS];
  uint8_t duration_count;
  int32_t rates[KIOSK_MAX_DURATIONS]; /* parallel to durations_min, matches web's rates[duration] */
  int32_t prep_time_sec;
} kiosk_products_config_t;

/* Full idle-screen snapshot (mirrors QueueBoard's fetched state). */
typedef struct {
  kiosk_products_config_t config;
  court_status_t courts[KIOSK_MAX_COURTS];
  uint8_t court_count;
  queue_row_t queue[KIOSK_MAX_QUEUE];
  uint8_t queue_count;
} kiosk_board_t;

typedef enum {
  RFID_DECISION_PLAY_NOW,
  RFID_DECISION_CHECK_IN_SCHEDULED,
  RFID_DECISION_ALREADY_ACTIVE,
  RFID_DECISION_ALREADY_QUEUED,
  RFID_DECISION_NO_ELIGIBLE_WINDOW,
  RFID_DECISION_MEMBER_UNAVAILABLE
} rfid_decision_type_t;

typedef struct {
  rfid_decision_type_t type;
  char court_id[KIOSK_MAX_ID_LEN];
  char court_name[KIOSK_MAX_NAME_LEN];
  char game_id[KIOSK_MAX_ID_LEN];
  char entry_id[KIOSK_MAX_ID_LEN];
  char reason[128];
  int32_t duration;
  bool capped;
  char cutoff_time[32]; // ISO string
  bool has_active_game;
  bool has_active_queue;
} rfid_decision_t;

/* A scanned member (mirrors TerminalKiosk.tsx's Player). */
typedef struct {
  char id[KIOSK_MAX_ID_LEN];
  char member_id[KIOSK_MAX_ID_LEN];
  char first_name[KIOSK_MAX_NAME_LEN];
  char last_name[KIOSK_MAX_NAME_LEN];
  int32_t balance;
  rfid_decision_t decision;
} kiosk_member_t;

/* One tile in the Select Court step (mirrors CourtOption). */
typedef struct {
  char id[KIOSK_MAX_ID_LEN]; /* "" = "Any Court" */
  char name[KIOSK_MAX_NAME_LEN];
  char status[16]; /* "Available" / "Playing" / "Reserved" / "Maintenance" / "Closed" */
} court_option_t;

typedef enum { GAME_TYPE_1V1, GAME_TYPE_2V2 } game_type_t;

/* getCost() from products-config-types.ts, ported verbatim. */
static inline int32_t kiosk_get_cost(const kiosk_products_config_t *cfg, int32_t duration_min, int32_t party_size) {
  int32_t rate = 0;
  for (uint8_t i = 0; i < cfg->duration_count; i++) {
    if (cfg->durations_min[i] == duration_min) { rate = cfg->rates[i]; break; }
  }
  if (rate == 0 && cfg->duration_count > 0) {
    rate = cfg->rates[0]; // fallback to base rate if not an exact match
  }
  int32_t total = (rate * duration_min) / 30;
  return (party_size == 4) ? (total / 2) : total;
}

/* Result of joining the queue (mirrors the 'success' step's two variants). */
typedef struct {
  bool success; /* true = booked immediately, false = queued */
  char court_name[KIOSK_MAX_NAME_LEN];
  int32_t duration_min;
  int32_t credits_used;
  int32_t credits_remaining;
} booking_result_t;

/* Mirrors the 'error' step (ErrorScreen). */
typedef struct {
  char title[KIOSK_MAX_NAME_LEN];
  char message[128];
} kiosk_error_t;
