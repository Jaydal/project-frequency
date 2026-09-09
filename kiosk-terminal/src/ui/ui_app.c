#include "ui_app.h"
#include "lvgl.h"
#include <stdio.h>
#include <string.h>
#include <time.h>

#include "../data/kiosk_data_provider.h"
#include "../data/kiosk_config.h"
#include "../net/relay.h"
#include "../data/live/live_data_provider.h"
#include "../net/freq_rest_client.h"
#include "theme/kiosk_theme.h"
#include "assets/branding.h"
#include "screens/queue_board.h"
#include "screens/terminal_layout.h"
#include "screens/setup_screen.h"

#include "widgets/court_overview.h"
#include "widgets/step_select_court.h"
#include "widgets/step_select_game_type.h"
#include "widgets/step_select_duration.h"
#include "widgets/step_booking_success.h"
#include "widgets/step_booking_confirm.h"
#include "widgets/step_error.h"

typedef enum {
  KIOSK_STEP_SETUP,
  KIOSK_STEP_BOOTING,
  KIOSK_STEP_LOADING,
  KIOSK_STEP_IDLE,
  KIOSK_STEP_EXISTING_QUEUE,
  KIOSK_STEP_SELECT_COURT,
  KIOSK_STEP_SELECT_GAME,
  KIOSK_STEP_SELECT_DURATION,
  KIOSK_STEP_CONFIRM,
  KIOSK_STEP_SUCCESS,
  KIOSK_STEP_ERROR,
  KIOSK_STEP_COUNT,

} kiosk_step_t;

typedef struct {
  kiosk_step_t step;
  const kiosk_data_provider_t *provider;

  kiosk_member_t member;
  court_option_t selected_court;
  game_type_t game_type;
  int32_t duration_min;
  char match_title[KIOSK_MAX_NAME_LEN];

  booking_result_t result;
  kiosk_error_t error;
  time_t success_entered_at;

  lv_obj_t *current_root;
  terminal_layout_t terminal_layout;
  bool has_terminal_layout;

  /* Boot diagnostics */
  bool mqtt_configured;
  uint32_t boot_start_tick;
  uint32_t last_config_retry_tick;
  lv_obj_t *boot_sub_label;
} ui_app_state_t;

static ui_app_state_t s_app;
static lv_obj_t *s_screen_root = NULL;

const kiosk_data_provider_t *kiosk_data_provider_get(void) {
  return s_app.provider;
}

static void render_current(void);
static void reset_to_idle(void);

/* ---- provider selection ---- */

static bool try_fetch_and_apply_remote_mqtt(char *err_msg, size_t err_msg_size) {
  kiosk_config_t cfg;
  memset(&cfg, 0, sizeof(cfg));
  if (!kiosk_config_load(&cfg)) {
    kiosk_config_defaults(&cfg);
  }
  if (cfg.server_url[0] == '\0') {
    if (err_msg && err_msg_size > 0) snprintf(err_msg, err_msg_size, "Server URL is empty");
    return false;
  }

  freq_mqtt_config_t remote_mqtt;
  freq_rest_init(cfg.server_url, cfg.api_key);
  freq_rest_result_t res = freq_rest_fetch_mqtt_config(&remote_mqtt);
  if (!res.ok) {
    if (err_msg && err_msg_size > 0) {
      if (res.http_status == 401) {
        char dev_id[32];
        freq_device_id_get(dev_id, sizeof(dev_id));
        snprintf(err_msg, err_msg_size, "Unauthorized (401). Add MAC %s in Dashboard", dev_id);
      } else if (res.http_status > 0) {
        snprintf(err_msg, err_msg_size, "Server HTTP %ld: %s", res.http_status, res.error);
      } else {
        snprintf(err_msg, err_msg_size, "%s", res.error[0] ? res.error : "Connecting to network...");
      }
    }
    return false;
  }

  snprintf(cfg.mqtt_broker, sizeof(cfg.mqtt_broker), "%s", remote_mqtt.broker);
  snprintf(cfg.mqtt_user, sizeof(cfg.mqtt_user), "%s", remote_mqtt.username);
  snprintf(cfg.mqtt_password, sizeof(cfg.mqtt_password), "%s", remote_mqtt.password);

  // Cache working remote MQTT config in NVS so future boots or reconnects have credentials
  kiosk_config_save(&cfg);

  live_data_provider_start(cfg.server_url, cfg.api_key,
                           cfg.mqtt_broker, cfg.mqtt_user, cfg.mqtt_password);
  s_app.provider = live_data_provider_get();
  return true;
}

static void apply_provider(void) {
  kiosk_config_t cfg;
  memset(&cfg, 0, sizeof(cfg));
  if (!kiosk_config_load(&cfg)) {
    kiosk_config_defaults(&cfg);
  }

  /* Fetch remote credentials before starting MQTT. Previously we started the
   * cached client here and then try_fetch_and_apply_remote_mqtt() started a
   * second client immediately after saving fresh credentials. That raced the
   * esp-mqtt task ("handler already registered" / "Client has not connected")
   * and could corrupt the FreeRTOS heap. */
  char err_buf[128];
  if (try_fetch_and_apply_remote_mqtt(err_buf, sizeof(err_buf))) {
    s_app.mqtt_configured = true;
    return;
  }

  /* If the server is temporarily unavailable, use the last known-good MQTT
   * credentials and let the boot state retry remote configuration later. */
  live_data_provider_start(cfg.server_url, cfg.api_key,
                           cfg.mqtt_broker, cfg.mqtt_user, cfg.mqtt_password);
  s_app.provider = live_data_provider_get();
  s_app.mqtt_configured = (cfg.mqtt_broker[0] != '\0' &&
                           cfg.mqtt_user[0] != '\0' &&
                           cfg.mqtt_password[0] != '\0');
}

/* ---- setup / config ---- */

#ifdef ESP_PLATFORM
#include "esp_system.h"
#endif

static void handle_setup_done(void *user_data) {
  (void)user_data;
#ifdef ESP_PLATFORM
  esp_restart();
#else
  apply_provider();
  reset_to_idle();
#endif
}

/* Hidden long-press in the idle screen's top-left corner re-opens setup. */
static void idle_long_press_cb(lv_event_t *e) {
  (void)e;
  s_app.step = KIOSK_STEP_SETUP;
  render_current();
}

/* ---- scan ---- */

#ifdef ESP_PLATFORM
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
static QueueHandle_t s_rfid_queue = NULL;

typedef struct {
  const kiosk_data_provider_t *provider;
  char member_id[KIOSK_MAX_ID_LEN];
  char court_id[KIOSK_MAX_ID_LEN];
  game_type_t game_type;
  int32_t duration_min;
  char match_title[KIOSK_MAX_NAME_LEN];
} confirm_task_context_t;

static volatile bool s_confirm_task_running = false;
static volatile bool s_confirm_task_done = false;
static bool s_confirm_task_ok = false;
static booking_result_t s_confirm_task_result;
static kiosk_error_t s_confirm_task_error;

static void confirm_task(void *arg) {
  confirm_task_context_t *ctx = arg;
  booking_result_t result = {0};
  kiosk_error_t error = {0};
  bool ok = ctx->provider->join_queue(ctx->member_id, ctx->court_id,
                                      ctx->game_type, ctx->duration_min,
                                      ctx->match_title, &result, &error);
  s_confirm_task_result = result;
  s_confirm_task_error = error;
  s_confirm_task_ok = ok;
  s_confirm_task_done = true;
  s_confirm_task_running = false;
  free(ctx);
  vTaskDelete(NULL);
}
#endif

#ifndef ESP_PLATFORM
static char s_pending_rfid[32] = {0};
static volatile bool s_has_pending_rfid = false;
#endif

void ui_app_handle_scan(const char *rfid) {
#ifdef ESP_PLATFORM
    if (s_rfid_queue) {
        char buf[32];
        snprintf(buf, sizeof(buf), "%s", rfid);
        /* Can be called from an ISR context or task context depending on PN532 driver */
        if (xPortInIsrContext()) {
            BaseType_t xHigherPriorityTaskWoken = pdFALSE;
            xQueueSendFromISR(s_rfid_queue, buf, &xHigherPriorityTaskWoken);
            if (xHigherPriorityTaskWoken) portYIELD_FROM_ISR();
        } else {
            xQueueSend(s_rfid_queue, buf, 0);
        }
    }
#else
    snprintf(s_pending_rfid, sizeof(s_pending_rfid), "%s", rfid);
    s_has_pending_rfid = true;
#endif
}

void ui_app_force_render(void) {
    lv_obj_report_style_change(NULL);
}

/* ---- action handlers ---- */

static void handle_scan(void *user_data, const char *rfid) {
  (void)user_data;
  s_app.error.title[0] = '\0';
  s_app.error.message[0] = '\0';

  s_app.step = KIOSK_STEP_LOADING;
  render_current();
  lv_refr_now(NULL);

  freq_rest_result_t r = freq_rest_lookup_member(rfid, &s_app.member);
  if (!r.ok) {
    snprintf(s_app.error.title, sizeof(s_app.error.title), "RFID Read Failed");
    snprintf(s_app.error.message, sizeof(s_app.error.message), "Error: %.80s\n(%.32s)", r.error, rfid);
    s_app.step = KIOSK_STEP_ERROR;
    render_current();
    return;
  }

  switch (s_app.member.decision.type) {
    case RFID_DECISION_MEMBER_UNAVAILABLE:
      snprintf(s_app.error.title, sizeof(s_app.error.title), "Cannot Book");
      snprintf(s_app.error.message, sizeof(s_app.error.message), "%s", s_app.member.decision.reason);
      s_app.step = KIOSK_STEP_ERROR;
      break;
    case RFID_DECISION_ALREADY_QUEUED:
    case RFID_DECISION_ALREADY_ACTIVE:
      if (!s_app.member.decision.has_active_game && !s_app.member.decision.has_active_queue) {
        if (s_app.member.decision.type == RFID_DECISION_ALREADY_ACTIVE) {
          s_app.member.decision.has_active_game = true;
        } else {
          s_app.member.decision.has_active_queue = true;
        }
      }
      s_app.step = KIOSK_STEP_EXISTING_QUEUE;
      break;
    case RFID_DECISION_NO_ELIGIBLE_WINDOW:
      snprintf(s_app.error.title, sizeof(s_app.error.title), "Court Unavailable");
      snprintf(s_app.error.message, sizeof(s_app.error.message), "Court %s is reserved soon.", 
               s_app.member.decision.court_name[0] ? s_app.member.decision.court_name : "selected");
      s_app.step = KIOSK_STEP_ERROR;
      break;
    case RFID_DECISION_CHECK_IN_SCHEDULED:
      snprintf(s_app.selected_court.id, sizeof(s_app.selected_court.id), "%s", s_app.member.decision.court_id);
      snprintf(s_app.selected_court.name, sizeof(s_app.selected_court.name), "%s", s_app.member.decision.court_name[0] ? s_app.member.decision.court_name : "Assigned Court");
      s_app.duration_min = s_app.member.decision.duration;
      s_app.game_type = GAME_TYPE_1V1; // Default
      s_app.step = KIOSK_STEP_CONFIRM; // Jump to confirm
      break;
    case RFID_DECISION_PLAY_NOW:
      if (s_app.member.decision.capped) {
        snprintf(s_app.selected_court.id, sizeof(s_app.selected_court.id), "%s", s_app.member.decision.court_id);
        snprintf(s_app.selected_court.name, sizeof(s_app.selected_court.name), "%s", s_app.member.decision.court_name[0] ? s_app.member.decision.court_name : "Auto Selected");
        s_app.duration_min = s_app.member.decision.duration;
        s_app.step = KIOSK_STEP_SELECT_GAME; // Jump to game selection, skipping court & duration
      } else {
        s_app.step = KIOSK_STEP_SELECT_COURT;
      }
      break;
    default:
      snprintf(s_app.error.title, sizeof(s_app.error.title), "Unknown Decision");
      snprintf(s_app.error.message, sizeof(s_app.error.message), "Unrecognized decision type.");
      s_app.step = KIOSK_STEP_ERROR;
      break;
  }
  render_current();
}

static void handle_select_court(void *user_data, const court_option_t *court) {
  (void)user_data;
  s_app.selected_court = *court;
  s_app.step = KIOSK_STEP_SELECT_GAME;
  render_current();
}

static void handle_select_game_type(void *user_data, game_type_t game_type) {
  (void)user_data;
  s_app.game_type = game_type;
  if (s_app.member.decision.type == RFID_DECISION_PLAY_NOW && s_app.member.decision.capped) {
    s_app.step = KIOSK_STEP_CONFIRM; // skip duration
  } else {
    s_app.step = KIOSK_STEP_SELECT_DURATION;
  }
  render_current();
}

static void handle_select_duration(void *user_data, int32_t duration_min) {
  (void)user_data;
  s_app.duration_min = duration_min;
  s_app.step = KIOSK_STEP_CONFIRM;
  render_current();
}

static void finish_confirm_ui(bool ok, const booking_result_t *result, const kiosk_error_t *error) {
  if (!ok) {
    s_app.error = *error;
    s_app.step = KIOSK_STEP_ERROR;
  } else {
    s_app.result = *result;
    kiosk_products_config_t cfg;
    s_app.provider->get_products_config(&cfg);
    int32_t party_size = (s_app.game_type == GAME_TYPE_2V2) ? 4 : 2;
    s_app.result.credits_used = s_app.member.decision.type == RFID_DECISION_CHECK_IN_SCHEDULED
      ? 0
      : kiosk_get_cost(&cfg, s_app.duration_min, party_size);
    s_app.result.credits_remaining = s_app.member.balance - s_app.result.credits_used;
    s_app.step = KIOSK_STEP_SUCCESS;
    s_app.success_entered_at = time(NULL);
  }
  render_current();
}

static void handle_confirm(void *user_data) {
  (void)user_data;
  s_app.step = KIOSK_STEP_LOADING;
  render_current();
  lv_refr_now(NULL);

#ifdef ESP_PLATFORM
  if (s_confirm_task_running) return;
  confirm_task_context_t *ctx = calloc(1, sizeof(*ctx));
  if (!ctx) {
    snprintf(s_app.error.title, sizeof(s_app.error.title), "Booking Failed");
    snprintf(s_app.error.message, sizeof(s_app.error.message), "Not enough memory to start booking.");
    s_app.step = KIOSK_STEP_ERROR;
    render_current();
    return;
  }
  ctx->provider = s_app.provider;
  snprintf(ctx->member_id, sizeof(ctx->member_id), "%s", s_app.member.id);
  snprintf(ctx->court_id, sizeof(ctx->court_id), "%s", s_app.selected_court.id);
  ctx->game_type = s_app.game_type;
  ctx->duration_min = s_app.duration_min;
  snprintf(ctx->match_title, sizeof(ctx->match_title), "%s", s_app.match_title);
  s_confirm_task_done = false;
  s_confirm_task_running = true;
  if (xTaskCreate(confirm_task, "booking", 8192, ctx, 4, NULL) != pdPASS) {
    s_confirm_task_running = false;
    free(ctx);
    snprintf(s_app.error.title, sizeof(s_app.error.title), "Booking Failed");
    snprintf(s_app.error.message, sizeof(s_app.error.message), "Unable to start booking request.");
    s_app.step = KIOSK_STEP_ERROR;
    render_current();
  }
  return;
#else
  bool ok = s_app.provider->join_queue(s_app.member.id, s_app.selected_court.id, s_app.game_type,
                                        s_app.duration_min, s_app.match_title, &s_app.result, &s_app.error);
  finish_confirm_ui(ok, &s_app.result, &s_app.error);
#endif
}

static void handle_cancel_existing(void *user_data) {
  (void)user_data;
  s_app.step = KIOSK_STEP_LOADING;
  render_current();
  lv_refr_now(NULL);

  const char *entry_id = s_app.member.decision.entry_id[0] ? s_app.member.decision.entry_id : NULL;
  if (!s_app.provider->cancel_waiting(s_app.member.id, entry_id, &s_app.error)) {
    s_app.step = KIOSK_STEP_ERROR;
  } else {
    reset_to_idle();
    return;
  }
  render_current();
}

static void handle_end_game(void *user_data) {
  (void)user_data;
  s_app.step = KIOSK_STEP_LOADING;
  render_current();
  lv_refr_now(NULL);

  const char *game_id = s_app.member.decision.game_id[0] ? s_app.member.decision.game_id : NULL;
  if (!s_app.provider->end_game(s_app.member.id, game_id, &s_app.error)) {
    s_app.step = KIOSK_STEP_ERROR;
  } else {
    reset_to_idle();
    return;
  }
  render_current();
}

static void handle_book_another(void *user_data) {
  (void)user_data;
  s_app.step = KIOSK_STEP_SELECT_COURT;
  render_current();
}

static void handle_error_retry(void *user_data) {
  (void)user_data;
  reset_to_idle();
}

static void close_to_idle(void *user_data) {
  (void)user_data;
  reset_to_idle();
}

static void handle_back_step(void *user_data) {
  (void)user_data;
  if (s_app.step == KIOSK_STEP_SELECT_GAME) {
    if (s_app.member.decision.type == RFID_DECISION_PLAY_NOW && s_app.member.decision.capped) {
      reset_to_idle();
      return;
    }
    s_app.step = KIOSK_STEP_SELECT_COURT;
  }
  else if (s_app.step == KIOSK_STEP_SELECT_DURATION) {
    s_app.step = KIOSK_STEP_SELECT_GAME;
  }
  else if (s_app.step == KIOSK_STEP_CONFIRM) {
    if (s_app.member.decision.type == RFID_DECISION_CHECK_IN_SCHEDULED) {
      reset_to_idle();
      return;
    }
    if (s_app.member.decision.type == RFID_DECISION_PLAY_NOW && s_app.member.decision.capped) {
      s_app.step = KIOSK_STEP_SELECT_GAME;
    } else {
      s_app.step = KIOSK_STEP_SELECT_DURATION;
    }
  }
  render_current();
}

static void reset_to_idle(void) {
  memset(&s_app.member, 0, sizeof(s_app.member));
  memset(&s_app.selected_court, 0, sizeof(s_app.selected_court));
  memset(s_app.match_title, 0, sizeof(s_app.match_title));
      s_app.step = KIOSK_STEP_IDLE;
  render_current();
}

/* Formatted member name helper */
static void format_member_name(char *buf, size_t size) {
  if (s_app.member.first_name[0] || s_app.member.last_name[0]) {
    snprintf(buf, size, "%s %s", s_app.member.first_name, s_app.member.last_name);
  } else {
    buf[0] = '\0';
  }
}

/* ---- rendering ---- */

static void cancel_existing_click_cb(lv_event_t *e) {
  (void)e;
  handle_cancel_existing(NULL);
}

static void end_game_click_cb(lv_event_t *e) {
  (void)e;
  handle_end_game(NULL);
}

static void book_another_click_cb(lv_event_t *e) {
  (void)e;
  handle_book_another(NULL);
}

static void close_idle_click_cb(lv_event_t *e) {
  (void)e;
  reset_to_idle();
}

static lv_obj_t *build_existing_queue_screen(lv_obj_t *parent) {
  lv_obj_t *root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_set_size(root, lv_pct(100), lv_pct(100));
  lv_obj_set_flex_flow(root, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(root, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_all(root, 16, 0);
  lv_obj_set_style_pad_row(root, 10, 0);
  lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ELASTIC | LV_OBJ_FLAG_SCROLL_MOMENTUM | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_set_scrollbar_mode(root, LV_SCROLLBAR_MODE_OFF);

  lv_obj_t *title = lv_label_create(root);
  lv_label_set_text(title, "Active Booking Found");
  lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
  lv_obj_set_style_text_color(title, kiosk_theme_color_text_strong(), 0);

  lv_obj_t *sub = lv_label_create(root);
  if (s_app.member.decision.has_active_game && s_app.member.decision.has_active_queue) {
    lv_label_set_text(sub, "You have an ongoing match and a spot in the queue.");
  } else if (s_app.member.decision.has_active_game) {
    lv_label_set_text(sub, "You are currently playing in an active match.");
  } else {
    lv_label_set_text(sub, "You are currently on the waiting list.");
  }
  lv_obj_set_style_text_font(sub, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(sub, kiosk_theme_color_text_muted(), 0);

  /* Card for ongoing game */
  if (s_app.member.decision.has_active_game) {
    lv_obj_t *game_card = lv_obj_create(root);
    lv_obj_remove_style_all(game_card);
    lv_obj_set_width(game_card, lv_pct(95));
    lv_obj_set_height(game_card, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(game_card, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(game_card, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_all(game_card, 12, 0);
    lv_obj_set_style_radius(game_card, 8, 0);
    lv_obj_set_style_bg_color(game_card, kiosk_theme_color_panel(), 0);
    lv_obj_set_style_border_width(game_card, 1, 0);
    lv_obj_set_style_border_color(game_card, kiosk_theme_color_border(), 0);

    lv_obj_t *info = lv_obj_create(game_card);
    lv_obj_remove_style_all(info);
    lv_obj_set_flex_flow(info, LV_FLEX_FLOW_COLUMN);
    lv_obj_t *l1 = lv_label_create(info);
    lv_label_set_text(l1, "Ongoing Match");
    lv_obj_set_style_text_font(l1, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(l1, kiosk_theme_color_text_strong(), 0);
    lv_obj_t *l2 = lv_label_create(info);
    lv_label_set_text(l2, "Match in progress");
    lv_obj_set_style_text_font(l2, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(l2, kiosk_theme_color_text_muted(), 0);

    lv_obj_t *end_btn = lv_btn_create(game_card);
    lv_obj_add_style(end_btn, &kiosk_style_btn_secondary, 0);
    lv_obj_set_style_border_color(end_btn, KIOSK_COLOR_RED_500, 0);
    lv_obj_t *end_label = lv_label_create(end_btn);
    lv_label_set_text(end_label, LV_SYMBOL_STOP " End Game Early");
    lv_obj_set_style_text_color(end_label, KIOSK_COLOR_RED_500, 0);
    lv_obj_add_event_cb(end_btn, end_game_click_cb, LV_EVENT_CLICKED, NULL);
    kiosk_theme_pin_pressed(end_btn);
  }

  /* Card for queue ticket */
  if (s_app.member.decision.has_active_queue) {
    lv_obj_t *q_card = lv_obj_create(root);
    lv_obj_remove_style_all(q_card);
    lv_obj_set_width(q_card, lv_pct(95));
    lv_obj_set_height(q_card, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(q_card, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(q_card, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_all(q_card, 12, 0);
    lv_obj_set_style_radius(q_card, 8, 0);
    lv_obj_set_style_bg_color(q_card, kiosk_theme_color_panel(), 0);
    lv_obj_set_style_border_width(q_card, 1, 0);
    lv_obj_set_style_border_color(q_card, kiosk_theme_color_border(), 0);

    lv_obj_t *info = lv_obj_create(q_card);
    lv_obj_remove_style_all(info);
    lv_obj_set_flex_flow(info, LV_FLEX_FLOW_COLUMN);
    lv_obj_t *l1 = lv_label_create(info);
    lv_label_set_text(l1, "Waiting Queue");
    lv_obj_set_style_text_font(l1, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(l1, kiosk_theme_color_text_strong(), 0);
    lv_obj_t *l2 = lv_label_create(info);
    lv_label_set_text(l2, "Waiting for court to open");
    lv_obj_set_style_text_font(l2, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(l2, kiosk_theme_color_text_muted(), 0);

    lv_obj_t *cancel_btn = lv_btn_create(q_card);
    lv_obj_add_style(cancel_btn, &kiosk_style_btn_secondary, 0);
    lv_obj_set_style_border_color(cancel_btn, KIOSK_COLOR_RED_500, 0);
    lv_obj_t *cancel_label = lv_label_create(cancel_btn);
    lv_label_set_text(cancel_label, LV_SYMBOL_TRASH " Cancel Queue");
    lv_obj_set_style_text_color(cancel_label, KIOSK_COLOR_RED_500, 0);
    lv_obj_add_event_cb(cancel_btn, cancel_existing_click_cb, LV_EVENT_CLICKED, NULL);
    kiosk_theme_pin_pressed(cancel_btn);
  }

  /* Booking or Notice */
  if (s_app.member.decision.has_active_queue) {
    lv_obj_t *notice_box = lv_obj_create(root);
    lv_obj_remove_style_all(notice_box);
    lv_obj_set_width(notice_box, lv_pct(95));
    lv_obj_set_height(notice_box, LV_SIZE_CONTENT);
    lv_obj_set_style_pad_all(notice_box, 10, 0);
    lv_obj_set_style_radius(notice_box, 8, 0);
    lv_obj_set_style_bg_color(notice_box, kiosk_theme_color_panel(), 0);
    lv_obj_set_style_border_width(notice_box, 1, 0);
    lv_obj_set_style_border_color(notice_box, KIOSK_COLOR_AMBER_500, 0);

    lv_obj_t *notice_title = lv_label_create(notice_box);
    lv_label_set_text(notice_title, LV_SYMBOL_WARNING " Queue Limit Reached (Max 1 queue spot)");
    lv_obj_set_style_text_font(notice_title, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(notice_title, KIOSK_COLOR_AMBER_500, 0);
  } else {
    lv_obj_t *another_btn = lv_btn_create(root);
    lv_obj_add_style(another_btn, &kiosk_style_btn_primary, 0);
    lv_obj_add_style(another_btn, &kiosk_style_btn_primary, LV_STATE_PRESSED);
    lv_obj_set_width(another_btn, lv_pct(95));
    lv_obj_set_height(another_btn, 42);
    lv_obj_t *another_label = lv_label_create(another_btn);
    lv_label_set_text(another_label, LV_SYMBOL_PLUS " Book Another Match");
    lv_obj_center(another_label);
    lv_obj_add_event_cb(another_btn, book_another_click_cb, LV_EVENT_CLICKED, NULL);
    kiosk_theme_pin_pressed(another_btn);
  }

  lv_obj_t *close_btn = lv_btn_create(root);
  lv_obj_add_style(close_btn, &kiosk_style_btn_secondary, 0);
  lv_obj_set_width(close_btn, lv_pct(95));
  lv_obj_set_height(close_btn, 38);
  lv_obj_t *close_label = lv_label_create(close_btn);
  lv_label_set_text(close_label, "Done");
  lv_obj_center(close_label);
  lv_obj_add_event_cb(close_btn, close_idle_click_cb, LV_EVENT_CLICKED, NULL);
  kiosk_theme_pin_pressed(close_btn);

  return root;
}

static lv_obj_t *build_booting_screen(lv_obj_t *parent) {
  lv_obj_t *root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_add_style(root, &kiosk_style_screen_bg, 0);
  lv_obj_set_size(root, lv_pct(100), lv_pct(100));
  lv_obj_set_flex_flow(root, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(root, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

  /* Boot logo temporarily disabled for the same image-decode watchdog
   * isolation as the board logo. */
  lv_obj_t *title = lv_label_create(root);
  lv_label_set_text(title, "Starting Kiosk Terminal...");
  lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
  lv_obj_set_style_text_color(title, KIOSK_COLOR_ZINC_100, 0);
  lv_obj_set_style_pad_top(title, 24, 0);

  s_app.boot_sub_label = lv_label_create(root);
  lv_label_set_text(s_app.boot_sub_label, "Connecting to network & fetching server configuration...");
  lv_obj_set_style_text_font(s_app.boot_sub_label, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(s_app.boot_sub_label, KIOSK_COLOR_ZINC_400, 0);
  lv_obj_set_style_text_align(s_app.boot_sub_label, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_pad_top(s_app.boot_sub_label, 8, 0);

  char dev_id[32];
  freq_device_id_get(dev_id, sizeof(dev_id));
  lv_obj_t *dev_label = lv_label_create(root);
  lv_label_set_text_fmt(dev_label, "Device ID: %s", dev_id);
  lv_obj_set_style_text_font(dev_label, &lv_font_montserrat_12, 0);
  lv_obj_set_style_text_color(dev_label, KIOSK_COLOR_ZINC_500, 0);
  lv_obj_set_style_pad_top(dev_label, 16, 0);

  return root;
}

static void ensure_screen_root(void) {
  if (!s_screen_root) {
    lv_obj_t *scr = lv_scr_act();
    s_screen_root = lv_obj_create(scr);
    lv_obj_remove_style_all(s_screen_root);
    lv_obj_add_style(s_screen_root, &kiosk_style_screen_bg, 0);
    lv_obj_set_size(s_screen_root, lv_pct(100), lv_pct(100));
  }
}

static void render_current(void) {
  /* Page changes rebuild fixed booking regions in place. Cancel any residual
   * theme/widget animation before deleting the old tree so an earlier touch
   * state cannot continue while the next page is being constructed. */
  lv_anim_del_all();
  lv_timer_pause(_lv_disp_get_refr_timer(NULL));
  static kiosk_board_t board;

  ensure_screen_root();
  char member_name[64];

  bool needs_terminal = (s_app.step == KIOSK_STEP_LOADING ||
                         s_app.step == KIOSK_STEP_EXISTING_QUEUE ||
                         s_app.step == KIOSK_STEP_SELECT_COURT ||
                         s_app.step == KIOSK_STEP_SELECT_GAME ||
                         s_app.step == KIOSK_STEP_SELECT_DURATION ||
                         s_app.step == KIOSK_STEP_CONFIRM ||
                         s_app.step == KIOSK_STEP_SUCCESS ||
                         s_app.step == KIOSK_STEP_ERROR);

  if (needs_terminal) {
    if (!s_app.has_terminal_layout) {
      lv_obj_clean(s_screen_root);
      s_app.current_root = NULL;
      s_app.has_terminal_layout = false;
      s_app.terminal_layout = terminal_layout_create(s_screen_root);
      s_app.current_root = s_app.terminal_layout.root;
      s_app.has_terminal_layout = true;
    } else {
      lv_obj_clean(s_app.terminal_layout.content);
      lv_obj_clean(s_app.terminal_layout.sidebar);
    }
  } else {
    if (s_app.has_terminal_layout) {
      lv_obj_clean(s_screen_root);
      s_app.current_root = NULL;
      s_app.has_terminal_layout = false;
    } else if (s_app.current_root) {
      lv_obj_clean(s_screen_root);
      s_app.current_root = NULL;
    }
  }

  switch (s_app.step) {
    case KIOSK_STEP_SETUP: {
      s_app.current_root = setup_screen_create(s_screen_root, handle_setup_done, NULL);
      break;
    }
    case KIOSK_STEP_BOOTING: {
      s_app.current_root = build_booting_screen(s_screen_root);
      break;
    }
    case KIOSK_STEP_IDLE: {
      s_app.provider->get_board(&board);
      s_app.current_root = queue_board_create(s_screen_root, &board, handle_scan, NULL);
      lv_obj_t *corner = lv_obj_create(s_app.current_root);
      lv_obj_remove_style_all(corner);
      lv_obj_set_size(corner, 60, 60);
      lv_obj_align(corner, LV_ALIGN_TOP_LEFT, 0, 0);
      lv_obj_add_flag(corner, LV_OBJ_FLAG_CLICKABLE);
      lv_obj_add_event_cb(corner, idle_long_press_cb, LV_EVENT_LONG_PRESSED, NULL);
      break;
    }

    case KIOSK_STEP_EXISTING_QUEUE: {
      terminal_layout_set_sidebar(&s_app.terminal_layout, true);
      build_existing_queue_screen(s_app.terminal_layout.content);
      s_app.provider->get_board(&board);
      court_overview_create(s_app.terminal_layout.sidebar, board.courts, board.court_count);
      break;
    }
    case KIOSK_STEP_SELECT_COURT: {
      terminal_layout_set_sidebar(&s_app.terminal_layout, true);
      court_option_t options[KIOSK_MAX_COURTS];
      uint8_t count = 0;
      s_app.provider->get_court_options(options, &count);
      format_member_name(member_name, sizeof(member_name));
       step_select_court_create(s_app.terminal_layout.content,
                                 member_name, s_app.member.balance,
                                 options, count,
                                 handle_select_court,
                                 close_to_idle, NULL, NULL);
       s_app.provider->get_board(&board);
       court_overview_create(s_app.terminal_layout.sidebar, board.courts, board.court_count);
      break;
    }
    case KIOSK_STEP_SELECT_GAME: {
      terminal_layout_set_sidebar(&s_app.terminal_layout, true);
      format_member_name(member_name, sizeof(member_name));
       step_select_game_type_create(s_app.terminal_layout.content,
                                    member_name, s_app.member.balance,
                                    handle_select_game_type,
                                    close_to_idle, NULL,
                                    handle_back_step, NULL, NULL);
      s_app.provider->get_board(&board);
      court_overview_create(s_app.terminal_layout.sidebar, board.courts, board.court_count);
      break;
    }
    case KIOSK_STEP_SELECT_DURATION: {
      terminal_layout_set_sidebar(&s_app.terminal_layout, true);
      kiosk_products_config_t cfg;
      s_app.provider->get_products_config(&cfg);
      format_member_name(member_name, sizeof(member_name));
      step_select_duration_create(s_app.terminal_layout.content,
                                   member_name, s_app.member.balance,
                                   &cfg,
                                   (s_app.game_type == GAME_TYPE_2V2) ? 4 : 2,
                                   s_app.member.decision.has_active_game,
                                   handle_select_duration,
                                   close_to_idle, NULL,
                                   handle_back_step, NULL, NULL);
      s_app.provider->get_board(&board);
      court_overview_create(s_app.terminal_layout.sidebar, board.courts, board.court_count);
      break;
    }
    case KIOSK_STEP_CONFIRM: {
      terminal_layout_set_sidebar(&s_app.terminal_layout, false);
      kiosk_products_config_t cfg;
      s_app.provider->get_products_config(&cfg);
      int32_t party_size = (s_app.game_type == GAME_TYPE_2V2) ? 4 : 2;
      bool is_check_in = (s_app.member.decision.type == RFID_DECISION_CHECK_IN_SCHEDULED);
      int32_t credits_required = is_check_in ? 0 : kiosk_get_cost(&cfg, s_app.duration_min, party_size);
      const char *game_label = (s_app.game_type == GAME_TYPE_2V2) ? "Doubles (2v2)" : "Singles (1v1)";
      format_member_name(member_name, sizeof(member_name));
      step_booking_confirm_create(s_app.terminal_layout.content,
                                   member_name, s_app.member.balance,
                                   s_app.selected_court.name,
                                   game_label,
                                   s_app.duration_min,
                                   credits_required,
                                   s_app.match_title, sizeof(s_app.match_title),
                                   is_check_in,
                                   s_app.member.decision.capped,
                                   handle_confirm,
                                   close_to_idle, NULL,
                                   handle_back_step, NULL, NULL);
      break;
    }
    case KIOSK_STEP_LOADING: {
      terminal_layout_set_sidebar(&s_app.terminal_layout, false);
      lv_obj_t *lbl = lv_label_create(s_app.terminal_layout.content);
      lv_label_set_text(lbl, "Loading...");
      lv_obj_set_style_text_font(lbl, &lv_font_montserrat_32, 0);
      lv_obj_set_style_text_color(lbl, kiosk_theme_color_text_strong(), 0);
      lv_obj_center(lbl);
      break;
    }
    case KIOSK_STEP_SUCCESS: {
      terminal_layout_set_sidebar(&s_app.terminal_layout, false);
      step_booking_success_create(s_app.terminal_layout.content, &s_app.result);
      break;
    }
    case KIOSK_STEP_ERROR: {
      terminal_layout_set_sidebar(&s_app.terminal_layout, false);
      step_error_create(s_app.terminal_layout.content, &s_app.error, handle_error_retry, NULL);
      break;
    }
    case KIOSK_STEP_COUNT:
      /* Sentinel only; never assigned as an active UI step. */
      break;
  }

  lv_timer_resume(_lv_disp_get_refr_timer(NULL));
}
/* ---- periodic refresh ---- */

static void send_refresh_recursive(lv_obj_t *obj) {
    if (!obj) return;
    /* Only timer labels need a one-second refresh. Sending LV_EVENT_REFRESH
     * to every object causes unnecessary invalidation/layout work and flashes
     * the single direct-mode framebuffer when multiple courts are active. */
    if (lv_obj_has_flag(obj, LV_OBJ_FLAG_USER_1)) {
        lv_event_send(obj, LV_EVENT_REFRESH, NULL);
    }
    uint32_t count = lv_obj_get_child_cnt(obj);
    for(uint32_t i = 0; i < count; i++) {
        send_refresh_recursive(lv_obj_get_child(obj, i));
    }
}

static uint32_t s_last_board_version = 0;
static bool s_last_court_active[KIOSK_MAX_COURTS];
static bool s_have_court_activity = false;
#ifdef ESP_PLATFORM
static volatile bool s_queue_advance_running = false;
static uint32_t s_last_queue_advance_tick = 0;
static void queue_advance_task(void *arg) {
    (void)arg;
    freq_rest_result_t result = freq_rest_advance_queue();
    if (result.ok) {
        printf("queue: advance request accepted (HTTP %ld)\n", result.http_status);
    } else {
        printf("queue: advance request failed (HTTP %ld): %s\n",
               result.http_status, result.error);
    }
    s_queue_advance_running = false;
    vTaskDelete(NULL);
}
#endif

static void on_tick(lv_timer_t *timer) {
  (void)timer;

#ifdef ESP_PLATFORM
  char buf[32];
  if (s_rfid_queue && xQueueReceive(s_rfid_queue, buf, 0) == pdTRUE) {
      lv_disp_trig_activity(NULL);
      handle_scan(NULL, buf);
  }
#else
  if (s_has_pending_rfid) {
      s_has_pending_rfid = false;
      lv_disp_trig_activity(NULL);
      handle_scan(NULL, s_pending_rfid);
  }
#endif

  /* Court lights follow the live board: ON while any court has an active
   * game window, OFF otherwise. Edge-triggered so the relay only switches
   * on real transitions. Runs on every tick in every step. */
  if (s_app.provider) {
    static kiosk_board_t lights_board;
    static bool lights_on = false;
    static bool lights_known = false;
    s_app.provider->get_board(&lights_board);
    bool any_active = false;
    for (uint8_t i = 0; i < lights_board.court_count; i++) {
      if (court_is_active(&lights_board.courts[i])) { any_active = true; break; }
    }
    if (!lights_known || any_active != lights_on) {
      lights_known = true;
      lights_on = any_active;
      relay_set(any_active);
      printf("[lights] courts active: %s -> relay %s\n",
             any_active ? "yes" : "no", any_active ? "ON" : "OFF");
    }
  }

#ifdef ESP_PLATFORM
  if (s_app.step == KIOSK_STEP_LOADING && s_confirm_task_done) {
    s_confirm_task_done = false;
    finish_confirm_ui(s_confirm_task_ok, &s_confirm_task_result, &s_confirm_task_error);
    return;
  }
#endif

  bool is_booking_step = (s_app.step == KIOSK_STEP_LOADING ||
                          s_app.step == KIOSK_STEP_EXISTING_QUEUE ||
                          s_app.step == KIOSK_STEP_SELECT_COURT ||
                          s_app.step == KIOSK_STEP_SELECT_GAME ||
                          s_app.step == KIOSK_STEP_SELECT_DURATION ||
                          s_app.step == KIOSK_STEP_CONFIRM ||
                          s_app.step == KIOSK_STEP_ERROR);

  if (is_booking_step && lv_disp_get_inactive_time(NULL) > 30000) {
      reset_to_idle();
      return;
  }

  if (s_app.step == KIOSK_STEP_BOOTING) {
    if (s_app.provider && s_app.provider->is_ready()) {
      s_app.step = KIOSK_STEP_IDLE;
      s_app.boot_sub_label = NULL;
      render_current();
      return;
    }

    uint32_t now_tick = lv_tick_get();

    // If MQTT is not ready, retry fetching remote config every 2 seconds
    if (!s_app.mqtt_configured && (now_tick - s_app.last_config_retry_tick >= 2000)) {
      s_app.last_config_retry_tick = now_tick;
      char err_detail[128] = {0};
      if (try_fetch_and_apply_remote_mqtt(err_detail, sizeof(err_detail))) {
        s_app.mqtt_configured = true;
        if (s_app.boot_sub_label) {
          lv_label_set_text(s_app.boot_sub_label, "Configuration received! Connecting to queue board...");
        }
      } else if (err_detail[0] != '\0' && s_app.boot_sub_label) {
        lv_label_set_text(s_app.boot_sub_label, err_detail);
      }
    }

    // After 30 seconds of booting without success, fall back to setup screen
    if (now_tick - s_app.boot_start_tick > 30000) {
      s_app.step = KIOSK_STEP_SETUP;
      s_app.boot_sub_label = NULL;
      render_current();
      return;
    }
  } else if (s_app.step == KIOSK_STEP_IDLE) {
    uint32_t current_ver = s_app.provider->get_board_version();
    bool board_changed = (current_ver != s_last_board_version);
    s_last_board_version = current_ver;

    // The server remains authoritative, but the kiosk can safely update its
    // local presentation when a scheduled game window expires. This avoids
    // leaving a court card at 00:00 until the next MQTT publication.
    kiosk_board_t board;
    s_app.provider->get_board(&board);
    bool local_activity_changed = !s_have_court_activity;
    bool has_expired_game_on_server = false;
    bool has_available_court = false;
    for (uint8_t i = 0; i < board.court_count && i < KIOSK_MAX_COURTS; i++) {
        bool active = court_is_active(&board.courts[i]);
        if (!active) {
            has_available_court = true;
            if (board.courts[i].start_time > 0) {
                has_expired_game_on_server = true;
            }
        }
        if (s_have_court_activity && active != s_last_court_active[i]) {
            local_activity_changed = true;
        }
        s_last_court_active[i] = active;
    }
    s_have_court_activity = true;

    if (board_changed || local_activity_changed) {
        render_current();
    } else {
        send_refresh_recursive(s_app.current_root);
    }
#ifdef ESP_PLATFORM
    /* A transition can be missed while booting or offline. Reconcile whenever
     * an expired game is stuck on the server, or a queued player exists. */
    uint32_t now_tick = lv_tick_get();
    bool advance_cooldown_elapsed = (now_tick - s_last_queue_advance_tick) >= 10000;
    if ((has_expired_game_on_server || (board.queue_count > 0 && has_available_court)) &&
        advance_cooldown_elapsed && !s_queue_advance_running) {
        s_last_queue_advance_tick = now_tick;
        s_queue_advance_running = true;
        xTaskCreate(queue_advance_task, "queue_advance", 6144, NULL, 4, NULL);
    }
#endif
  } else if (s_app.step == KIOSK_STEP_SUCCESS) {
    if (time(NULL) - s_app.success_entered_at >= 4) {
      reset_to_idle();
    }
  }
}

void ui_app_init(void) {
  kiosk_theme_init();
  memset(&s_app, 0, sizeof(s_app));
  apply_provider();
  
#ifdef ESP_PLATFORM
  s_rfid_queue = xQueueCreate(5, 32);
#endif

  kiosk_config_t cfg;
  bool valid_config = false;
  if (kiosk_config_exists() && kiosk_config_load(&cfg)) {
    if (strlen(cfg.wifi_ssid) > 0) {
      valid_config = true;
    }
  }

  s_app.boot_start_tick = lv_tick_get();
  s_app.last_config_retry_tick = 0;
  s_app.step = valid_config ? KIOSK_STEP_BOOTING : KIOSK_STEP_SETUP;
  render_current();
  lv_timer_create(on_tick, 1000, NULL);
}
