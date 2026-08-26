#include "ui_app.h"
#include "lvgl.h"
#include <stdio.h>
#include <string.h>
#include <time.h>

#include "../data/kiosk_data_provider.h"
#include "../data/kiosk_config.h"
#include "../data/live/live_data_provider.h"
#include "theme/kiosk_theme.h"
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
  KIOSK_STEP_IDLE,
  KIOSK_STEP_EXISTING_QUEUE,
  KIOSK_STEP_SELECT_COURT,
  KIOSK_STEP_SELECT_GAME,
  KIOSK_STEP_SELECT_DURATION,
  KIOSK_STEP_CONFIRM,
  KIOSK_STEP_SUCCESS,
  KIOSK_STEP_ERROR,

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
} ui_app_state_t;

static ui_app_state_t s_app;
static lv_obj_t *s_screen_root = NULL;

const kiosk_data_provider_t *kiosk_data_provider_get(void) {
  return s_app.provider;
}

static void render_current(void);
static void reset_to_idle(void);

/* ---- provider selection ---- */

static void apply_provider(void) {
  kiosk_config_t cfg;
  memset(&cfg, 0, sizeof(cfg));
  kiosk_config_load(&cfg);
  live_data_provider_start(cfg.server_url, cfg.api_key,
                           cfg.mqtt_broker, cfg.mqtt_user, cfg.mqtt_password);
  s_app.provider = live_data_provider_get();
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
static QueueHandle_t s_rfid_queue = NULL;
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
  if (!s_app.provider->lookup_member(rfid, &s_app.member)) {
    snprintf(s_app.error.title, sizeof(s_app.error.title), "RFID Read Failed");
    snprintf(s_app.error.message, sizeof(s_app.error.message), "Error looking up %s", rfid);
    s_app.step = KIOSK_STEP_ERROR;
    render_current();
    return;
  }

  member_state_t state = s_app.provider->check_member_state(s_app.member.id, &s_app.error);
  switch (state) {
    case MEMBER_STATE_HAS_WAITING: s_app.step = KIOSK_STEP_EXISTING_QUEUE; break;
    case MEMBER_STATE_ALREADY_PLAYING:
      snprintf(s_app.error.title, sizeof(s_app.error.title), "Already Playing");
      snprintf(s_app.error.message, sizeof(s_app.error.message), "You are already in an active game.");
      s_app.step = KIOSK_STEP_ERROR;
      break;
    case MEMBER_STATE_NONE:
    default: s_app.step = KIOSK_STEP_SELECT_COURT; break;
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
  s_app.step = KIOSK_STEP_SELECT_DURATION;
  render_current();
}

static void handle_select_duration(void *user_data, int32_t duration_min) {
  (void)user_data;
  s_app.duration_min = duration_min;
  s_app.step = KIOSK_STEP_CONFIRM;
  render_current();
}

static void handle_confirm(void *user_data) {
  (void)user_data;
  bool ok = s_app.provider->join_queue(s_app.member.id, s_app.selected_court.id, s_app.game_type,
                                        s_app.duration_min, s_app.match_title, &s_app.result, &s_app.error);
  if (!ok) {
    s_app.step = KIOSK_STEP_ERROR;
  } else {
    kiosk_products_config_t cfg;
    s_app.provider->get_products_config(&cfg);
    int32_t party_size = (s_app.game_type == GAME_TYPE_2V2) ? 4 : 2;
    s_app.result.credits_used = kiosk_get_cost(&cfg, s_app.duration_min, party_size);
    s_app.result.credits_remaining = s_app.member.balance - s_app.result.credits_used;
    s_app.step = KIOSK_STEP_SUCCESS;
    s_app.success_entered_at = time(NULL);
  }
  render_current();
}

static void handle_cancel_existing(void *user_data) {
  (void)user_data;
  s_app.provider->cancel_waiting(s_app.member.id);
  s_app.step = KIOSK_STEP_SELECT_COURT;
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
  if (s_app.step == KIOSK_STEP_SELECT_GAME) s_app.step = KIOSK_STEP_SELECT_COURT;
  else if (s_app.step == KIOSK_STEP_SELECT_DURATION) s_app.step = KIOSK_STEP_SELECT_GAME;
  else if (s_app.step == KIOSK_STEP_CONFIRM) s_app.step = KIOSK_STEP_SELECT_DURATION;
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

static void book_another_click_cb(lv_event_t *e) {
  (void)e;
  handle_book_another(NULL);
}

static lv_obj_t *build_existing_queue_screen(lv_obj_t *parent) {
  lv_obj_t *root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_set_size(root, lv_pct(100), lv_pct(100));
  lv_obj_set_flex_flow(root, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(root, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_all(root, 24, 0);
  
  lv_obj_t *icon_box = lv_obj_create(root);
  lv_obj_remove_style_all(icon_box);
  lv_obj_set_size(icon_box, 80, 80);
  lv_obj_set_style_radius(icon_box, 40, 0);
  lv_obj_set_style_bg_color(icon_box, kiosk_theme_color_primary(), 0);
  lv_obj_set_style_bg_opa(icon_box, LV_OPA_10, 0);
  lv_obj_set_style_border_width(icon_box, 1, 0);
  lv_obj_set_style_border_color(icon_box, kiosk_theme_color_primary(), 0);
  lv_obj_set_style_border_opa(icon_box, LV_OPA_30, 0);

  lv_obj_t *icon = lv_label_create(icon_box);
  lv_label_set_text(icon, LV_SYMBOL_BELL);
  lv_obj_set_style_text_font(icon, &lv_font_montserrat_32, 0);
  lv_obj_set_style_text_color(icon, kiosk_theme_color_primary(), 0);
  lv_obj_center(icon);

  lv_obj_t *title = lv_label_create(root);
  lv_label_set_text(title, "Active Booking Found");
  lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
  lv_obj_set_style_text_color(title, kiosk_theme_color_text_strong(), 0);
  lv_obj_set_style_pad_top(title, 20, 0);

  lv_obj_t *sub = lv_label_create(root);
  lv_label_set_text(sub, "You are already in the queue for a court.\\nWould you like to book another match or cancel your existing one?");
  lv_obj_set_style_text_font(sub, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(sub, kiosk_theme_color_text_muted(), 0);
  lv_obj_set_style_text_align(sub, LV_TEXT_ALIGN_CENTER, 0);
  lv_obj_set_style_pad_top(sub, 8, 0);
  lv_obj_set_style_pad_bottom(sub, 32, 0);

  lv_obj_t *btn_row = lv_obj_create(root);
  lv_obj_remove_style_all(btn_row);
  lv_obj_set_width(btn_row, lv_pct(80));
  lv_obj_set_height(btn_row, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(btn_row, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(btn_row, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(btn_row, 16, 0);

  lv_obj_t *cancel_btn = lv_btn_create(btn_row);
  lv_obj_add_style(cancel_btn, &kiosk_style_btn_secondary, 0);
  lv_obj_add_style(cancel_btn, &kiosk_style_btn_secondary, LV_STATE_PRESSED);
  lv_obj_set_style_border_color(cancel_btn, KIOSK_COLOR_RED_500, 0);
  lv_obj_set_style_bg_color(cancel_btn, KIOSK_COLOR_RED_500, LV_STATE_PRESSED);
  lv_obj_set_style_bg_opa(cancel_btn, LV_OPA_10, LV_STATE_PRESSED);
  lv_obj_set_flex_grow(cancel_btn, 1);
  lv_obj_t *cancel_label = lv_label_create(cancel_btn);
  lv_label_set_text(cancel_label, LV_SYMBOL_TRASH " Cancel Booking");
  lv_obj_set_style_text_color(cancel_label, KIOSK_COLOR_RED_500, 0);
  lv_obj_center(cancel_label);
  lv_obj_add_event_cb(cancel_btn, cancel_existing_click_cb, LV_EVENT_CLICKED, NULL);

  lv_obj_t *another_btn = lv_btn_create(btn_row);
  lv_obj_add_style(another_btn, &kiosk_style_btn_primary, 0);
  lv_obj_add_style(another_btn, &kiosk_style_btn_primary, LV_STATE_PRESSED);
  lv_obj_set_flex_grow(another_btn, 1);
  lv_obj_t *another_label = lv_label_create(another_btn);
  lv_label_set_text(another_label, LV_SYMBOL_PLUS " Book Another");
  lv_obj_center(another_label);
  lv_obj_add_event_cb(another_btn, book_another_click_cb, LV_EVENT_CLICKED, NULL);

  return root;
}
static lv_obj_t *build_booting_screen(lv_obj_t *parent) {
  lv_obj_t *root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_add_style(root, &kiosk_style_screen_bg, 0);
  lv_obj_set_size(root, lv_pct(100), lv_pct(100));
  lv_obj_set_flex_flow(root, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(root, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

  lv_obj_t *title = lv_label_create(root);
  lv_label_set_text(title, "Connecting to Network...");
  lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
  lv_obj_set_style_text_color(title, KIOSK_COLOR_ZINC_100, 0);
  lv_obj_set_style_pad_top(title, 24, 0);

  lv_obj_t *sub = lv_label_create(root);
  lv_label_set_text(sub, "Waiting for server connection & configuration...");
  lv_obj_set_style_text_font(sub, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(sub, KIOSK_COLOR_ZINC_400, 0);
  lv_obj_set_style_pad_top(sub, 8, 0);

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
  static kiosk_board_t board;

  ensure_screen_root();
  char member_name[64];

  bool needs_terminal = (s_app.step == KIOSK_STEP_EXISTING_QUEUE ||
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
      int32_t credits_required = kiosk_get_cost(&cfg, s_app.duration_min, party_size);
      const char *game_label = (s_app.game_type == GAME_TYPE_2V2) ? "Doubles (2v2)" : "Singles (1v1)";
      format_member_name(member_name, sizeof(member_name));
      step_booking_confirm_create(s_app.terminal_layout.content,
                                   member_name, s_app.member.balance,
                                   s_app.selected_court.name,
                                   game_label,
                                   s_app.duration_min,
                                   credits_required,
                                   handle_confirm,
                                   close_to_idle, NULL,
                                   handle_back_step, NULL, NULL);
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
  }
}

/* ---- periodic refresh ---- */

static void send_refresh_recursive(lv_obj_t *obj) {
    if (!obj) return;
    lv_event_send(obj, LV_EVENT_REFRESH, NULL);
    uint32_t count = lv_obj_get_child_cnt(obj);
    for(uint32_t i = 0; i < count; i++) {
        send_refresh_recursive(lv_obj_get_child(obj, i));
    }
}

static uint32_t s_last_board_version = 0;

static void on_tick(lv_timer_t *timer) {
  (void)timer;

#ifdef ESP_PLATFORM
  char buf[32];
  if (s_rfid_queue && xQueueReceive(s_rfid_queue, buf, 0) == pdTRUE) {
      handle_scan(NULL, buf);
  }
#else
  if (s_has_pending_rfid) {
      s_has_pending_rfid = false;
      handle_scan(NULL, s_pending_rfid);
  }
#endif

  bool is_booking_step = (s_app.step == KIOSK_STEP_EXISTING_QUEUE ||
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
    if (s_app.provider->is_ready()) {
  s_app.step = KIOSK_STEP_IDLE;
      render_current();
    } else if (lv_tick_get() > 15000) {
      s_app.step = KIOSK_STEP_SETUP;
      render_current();
    }
  } else if (s_app.step == KIOSK_STEP_IDLE) {
    uint32_t current_ver = s_app.provider->get_board_version();
    bool board_changed = (current_ver != s_last_board_version);
    s_last_board_version = current_ver;

    if (board_changed) {
        render_current();
    } else {
        send_refresh_recursive(s_app.current_root);
    }
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

  s_app.step = valid_config ? KIOSK_STEP_BOOTING : KIOSK_STEP_SETUP;
  render_current();
  lv_timer_create(on_tick, 1000, NULL);
}
