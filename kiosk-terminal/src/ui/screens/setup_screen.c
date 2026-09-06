#include "setup_screen.h"
#include "../theme/kiosk_theme.h"
#include "../assets/branding.h"
#include "../../data/kiosk_config.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>
#include "../../net/wifi_scanner.h"
#include "../../net/nfc_reader.h"
#include "../../net/freq_rest_client.h"

#define SETUP_FIELD_COUNT 3
#define INPUT_CELL_COUNT 48
#define INPUT_CELL_WIDTH 20

typedef struct {
  const char *label;
  bool password;
  size_t offset;
  size_t size;
} field_desc_t;

static const field_desc_t FIELDS[SETUP_FIELD_COUNT] = {
  { "WiFi Network (SSID)", false, offsetof(kiosk_config_t, wifi_ssid),     KIOSK_CONFIG_SSID_LEN },
  { "WiFi Password",       true,  offsetof(kiosk_config_t, wifi_password), KIOSK_CONFIG_PASS_LEN },
  { "Server URL",          false, offsetof(kiosk_config_t, server_url),    KIOSK_CONFIG_URL_LEN  },
};

static void format_mac_address(const char *raw, char *out, size_t out_size) {
  if (!raw || !out || out_size == 0) return;
  if (strlen(raw) == 12) {
    snprintf(out, out_size, "%.2s:%.2s:%.2s:%.2s:%.2s:%.2s",
             raw, raw + 2, raw + 4, raw + 6, raw + 8, raw + 10);
  } else {
    snprintf(out, out_size, "%s", raw);
  }
}

typedef struct {
  lv_obj_t *ta[SETUP_FIELD_COUNT];
  lv_obj_t *input_modal;
  lv_obj_t *editing_ta;
  lv_obj_t *input_cells[INPUT_CELL_COUNT];
  char input_cell_text[INPUT_CELL_COUNT][2];
  size_t input_page_start;
  char input_text[KIOSK_CONFIG_URL_LEN];
  size_t input_text_size;
  bool input_password;
  lv_obj_t *scan_msgbox;
  lv_obj_t *scan_list;
  lv_obj_t *root;
  setup_done_cb_t on_done;
  void *user_data;
  uint32_t instance_id;
} setup_ctx_t;

static void free_ctx_cb(lv_event_t *e) {
  setup_ctx_t *ctx = lv_event_get_user_data(e);
  if (ctx->input_modal) {
    lv_obj_del(ctx->input_modal);
  }
  if (ctx->scan_msgbox) {
    lv_msgbox_close(ctx->scan_msgbox);
  }
  free(ctx);
}

static const char *KEYS_LOWER[] = {
  "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "\n",
  "a", "s", "d", "f", "g", "h", "j", "k", "l", "\n",
  "z", "x", "c", "v", "b", "n", "m", "\n",
  "ABC", "SPACE", "BKSP", "123", "CANCEL", "OK", ""
};

static const char *KEYS_UPPER[] = {
  "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "\n",
  "A", "S", "D", "F", "G", "H", "J", "K", "L", "\n",
  "Z", "X", "C", "V", "B", "N", "M", "\n",
  "abc", "SPACE", "BKSP", "123", "CANCEL", "OK", ""
};

static const char *KEYS_SYMBOLS[] = {
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "\n",
  "@", ".", "/", ":", "-", "_", "?", "&", "=", "\n",
  "+", "*", "#", "%", "!", "~", "\\", "\n",
  "ABC", "SPACE", "BKSP", "abc", "CANCEL", "OK", ""
};

static void close_input_modal(setup_ctx_t *ctx) {
  if (!ctx->input_modal) return;
  lv_obj_del(ctx->input_modal);
  ctx->input_modal = NULL;
  memset(ctx->input_cells, 0, sizeof(ctx->input_cells));
  memset(ctx->input_cell_text, 0, sizeof(ctx->input_cell_text));
  ctx->input_page_start = 0;
  ctx->editing_ta = NULL;
  lv_obj_clear_flag(ctx->root, LV_OBJ_FLAG_HIDDEN);
}

static void static_keyboard_event_cb(lv_event_t *e) {
  setup_ctx_t *ctx = lv_event_get_user_data(e);
  lv_obj_t *kb = lv_event_get_target(e);
  uint16_t btn = lv_btnmatrix_get_selected_btn(kb);
  const char *key = lv_btnmatrix_get_btn_text(kb, btn);
  if (!key || !ctx->input_cells[0]) return;

  if (strcmp(key, "ABC") == 0) {
    lv_btnmatrix_set_map(kb, KEYS_UPPER);
  } else if (strcmp(key, "abc") == 0) {
    lv_btnmatrix_set_map(kb, KEYS_LOWER);
  } else if (strcmp(key, "123") == 0) {
    lv_btnmatrix_set_map(kb, KEYS_SYMBOLS);
  } else if (strcmp(key, "SPACE") == 0) {
    size_t length = strlen(ctx->input_text);
    if (length + 1 < ctx->input_text_size) {
      ctx->input_text[length] = ' ';
      ctx->input_text[length + 1] = '\0';
    }
  } else if (strcmp(key, "BKSP") == 0) {
    size_t length = strlen(ctx->input_text);
    if (length > 0) ctx->input_text[length - 1] = '\0';
  } else if (strcmp(key, "OK") == 0) {
    if (ctx->editing_ta) {
      lv_textarea_set_text(ctx->editing_ta, ctx->input_text);
    }
    close_input_modal(ctx);
  } else if (strcmp(key, "CANCEL") == 0) {
    close_input_modal(ctx);
  } else {
    size_t length = strlen(ctx->input_text);
    size_t key_length = strlen(key);
    if (length + key_length < ctx->input_text_size) {
      strncat(ctx->input_text, key, ctx->input_text_size - length - 1);
    }
  }

  /* Keep the edit buffer private while the keyboard is active.  The target
   * field is updated atomically when OK is pressed, avoiding redraws for every
   * keystroke (and preventing typed text from flickering on the single buffer). */
}

static void field_focus_cb(lv_event_t *e) {
  setup_ctx_t *ctx = lv_event_get_user_data(e);
  lv_obj_t *target_ta = lv_event_get_target(e);

  if (ctx->input_modal) return;

  lv_obj_add_flag(ctx->root, LV_OBJ_FLAG_HIDDEN);

  ctx->editing_ta = target_ta;
  ctx->input_modal = lv_obj_create(lv_scr_act());
  lv_obj_remove_style_all(ctx->input_modal);
  lv_obj_set_size(ctx->input_modal, lv_pct(100), lv_pct(100));
  lv_obj_set_style_bg_color(ctx->input_modal, kiosk_theme_color_bg(), 0);
  lv_obj_set_style_bg_opa(ctx->input_modal, LV_OPA_COVER, 0);
  lv_obj_clear_flag(ctx->input_modal, LV_OBJ_FLAG_SCROLLABLE);

  /* Opaque header fills area above text area */
  lv_obj_t *hdr = lv_obj_create(ctx->input_modal);
  lv_obj_remove_style_all(hdr);
  lv_obj_set_width(hdr, lv_pct(100));
  lv_obj_set_height(hdr, 40);
  lv_obj_align(hdr, LV_ALIGN_TOP_MID, 0, 0);
  lv_obj_set_style_bg_color(hdr, kiosk_theme_color_bg(), 0);
  lv_obj_set_style_bg_opa(hdr, LV_OPA_COVER, 0);
  lv_obj_clear_flag(hdr, LV_OBJ_FLAG_SCROLLABLE);

  int field_index = 0;
  while (field_index < SETUP_FIELD_COUNT && ctx->ta[field_index] != target_ta) {
    field_index++;
  }
  ctx->input_text_size = field_index < SETUP_FIELD_COUNT
      ? FIELDS[field_index].size
      : sizeof(ctx->input_text);
  ctx->input_password = field_index < SETUP_FIELD_COUNT && FIELDS[field_index].password;
  snprintf(ctx->input_text, sizeof(ctx->input_text), "%s",
           lv_textarea_get_text(target_ta));

  /* Fixed, non-interactive display: no cursor, focus state, scrolling,
   * password reveal timer, or textarea animation participates while typing. */
  lv_obj_t *input_box = lv_obj_create(ctx->input_modal);
  lv_obj_remove_style_all(input_box);
  lv_obj_set_width(input_box, lv_pct(100));
  lv_obj_set_height(input_box, 44);
  lv_obj_align(input_box, LV_ALIGN_TOP_MID, 0, 40);
  lv_obj_set_style_pad_hor(input_box, 20, 0);
  lv_obj_set_style_bg_color(input_box, kiosk_theme_color_bg(), 0);
  lv_obj_set_style_bg_opa(input_box, LV_OPA_COVER, 0);
  lv_obj_set_style_text_color(input_box, kiosk_theme_color_text_strong(), 0);
  lv_obj_set_style_border_color(input_box, kiosk_theme_color_primary(), 0);
  lv_obj_set_style_border_width(input_box, 2, 0);
  lv_obj_clear_flag(input_box, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);

  memset(ctx->input_cells, 0, sizeof(ctx->input_cells));
  memset(ctx->input_cell_text, 0, sizeof(ctx->input_cell_text));
  ctx->input_page_start = 0;

  for (size_t i = 0; i < INPUT_CELL_COUNT; i++) {
    lv_obj_t *cell = lv_label_create(input_box);
    ctx->input_cells[i] = cell;
    lv_obj_set_size(cell, INPUT_CELL_WIDTH, 44);
    lv_obj_set_pos(cell, i * INPUT_CELL_WIDTH, 0);
    lv_label_set_long_mode(cell, LV_LABEL_LONG_CLIP);
    lv_obj_set_style_text_align(cell, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_color(cell, kiosk_theme_color_text_strong(), 0);
    lv_obj_set_style_pad_all(cell, 0, 0);
    lv_obj_set_style_anim_time(cell, 0, 0);
    lv_obj_clear_flag(cell, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_label_set_text_static(cell, ctx->input_cell_text[i]);
  }
  /* Do not repaint the preview for each key; commit the buffered text on OK. */

  lv_obj_t *kb = lv_btnmatrix_create(ctx->input_modal);
  lv_btnmatrix_set_map(kb, KEYS_LOWER);
  /* The target panel is 1024x600. Use a hard geometry rectangle so no flex,
   * percentage, or pressed-state recalculation can move the matrix. */
  lv_obj_set_size(kb, 1024, 360);
  lv_obj_set_style_min_height(kb, 360, 0);
  lv_obj_set_style_max_height(kb, 360, 0);
  lv_obj_set_pos(kb, 0, 240);
  lv_obj_clear_flag(kb, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_add_flag(kb, LV_OBJ_FLAG_IGNORE_LAYOUT);
  
  kiosk_theme_style_keyboard(kb);

  lv_obj_add_event_cb(kb, static_keyboard_event_cb, LV_EVENT_VALUE_CHANGED, ctx);
}

static void wifi_list_btn_cb(lv_event_t *e) {
  lv_obj_t *btn = lv_event_get_target(e);
  setup_ctx_t *ctx = lv_event_get_user_data(e);
  const char *ssid = lv_list_get_btn_text(ctx->scan_list, btn);
  if (ssid) {
    lv_textarea_set_text(ctx->ta[0], ssid);
  }
  lv_msgbox_close(ctx->scan_msgbox);
  ctx->scan_msgbox = NULL;
  ctx->scan_list = NULL;
}

typedef struct {
  setup_ctx_t *ctx;
  kiosk_wifi_ap_t *results;
  uint16_t count;
  uint32_t instance_id;
} scan_result_data_t;

static uint32_t s_setup_instance_id = 0;

static void async_scan_result_cb(void *arg) {
  scan_result_data_t *data = arg;
  setup_ctx_t *ctx = data->ctx;

  if (data->instance_id != s_setup_instance_id) {
     if (data->results) free(data->results);
     free(data);
     return;
  }

  if (!ctx->scan_msgbox || !ctx->scan_list) {
     if (data->results) free(data->results);
     free(data);
     return;
  }

  lv_obj_clean(ctx->scan_list);

  if (data->count == 0) {
    lv_obj_t *label = lv_label_create(ctx->scan_list);
    lv_label_set_text(label, "No networks found.");
  } else {
    for (int i = 0; i < data->count; i++) {
      lv_obj_t *btn = lv_list_add_btn(ctx->scan_list, LV_SYMBOL_WIFI, data->results[i].ssid);
      kiosk_theme_disable_transitions(btn);
      lv_obj_add_event_cb(btn, wifi_list_btn_cb, LV_EVENT_CLICKED, ctx);
    }
  }

  if (data->results) free(data->results);
  free(data);
}

static void wifi_scan_result_cb(kiosk_wifi_ap_t *results, uint16_t count, void *user_data) {
  scan_result_data_t *data = malloc(sizeof(scan_result_data_t));
  setup_ctx_t *ctx = user_data;
  data->ctx = ctx;
  data->instance_id = ctx->instance_id;
  data->count = count;
  if (count > 0 && results) {
     data->results = malloc(sizeof(kiosk_wifi_ap_t) * count);
     memcpy(data->results, results, sizeof(kiosk_wifi_ap_t) * count);
  } else {
     data->results = NULL;
  }
  lv_async_call(async_scan_result_cb, data);
}

static void scan_btn_cb(lv_event_t *e) {
  setup_ctx_t *ctx = lv_event_get_user_data(e);

  ctx->scan_msgbox = lv_msgbox_create(NULL, "Available Networks", "", NULL, true);
  kiosk_theme_disable_transitions(lv_msgbox_get_close_btn(ctx->scan_msgbox));
  lv_obj_center(ctx->scan_msgbox);

  ctx->scan_list = lv_list_create(ctx->scan_msgbox);
  lv_obj_set_scrollbar_mode(ctx->scan_list, LV_SCROLLBAR_MODE_OFF);
  lv_obj_set_size(ctx->scan_list, 300, 200);

  lv_obj_t *label = lv_label_create(ctx->scan_list);
  lv_label_set_text(label, "Scanning...");

  kiosk_wifi_scan_start(wifi_scan_result_cb, ctx);
}

static void save_cb(lv_event_t *e) {
  setup_ctx_t *ctx = lv_event_get_user_data(e);
  kiosk_config_t cfg;
  if (!kiosk_config_load(&cfg)) {
    kiosk_config_defaults(&cfg);
  }
  for (int i = 0; i < SETUP_FIELD_COUNT; i++) {
    char *dest = (char *)&cfg + FIELDS[i].offset;
    snprintf(dest, FIELDS[i].size, "%s", lv_textarea_get_text(ctx->ta[i]));
  }
  kiosk_config_save(&cfg);
  if (ctx->on_done) ctx->on_done(ctx->user_data);
}

static void reset_cb(lv_event_t *e) {
  setup_ctx_t *ctx = lv_event_get_user_data(e);
  kiosk_config_t defaults;
  kiosk_config_defaults(&defaults);

  for (int i = 0; i < SETUP_FIELD_COUNT; i++) {
    const char *val = (const char *)&defaults + FIELDS[i].offset;
    lv_textarea_set_text(ctx->ta[i], val);
  }
}

lv_obj_t *setup_screen_create(lv_obj_t *parent, setup_done_cb_t on_done, void *user_data) {
  s_setup_instance_id++;
  setup_ctx_t *ctx = malloc(sizeof(setup_ctx_t));
  memset(ctx, 0, sizeof(*ctx));
  ctx->on_done = on_done;
  ctx->user_data = user_data;
  ctx->instance_id = s_setup_instance_id;

  kiosk_config_t existing;
  if (!kiosk_config_load(&existing)) kiosk_config_defaults(&existing);
  bool have_existing = true;

  lv_obj_t *root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_clear_flag(parent, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_add_style(root, &kiosk_style_screen_bg, 0);
  lv_obj_set_size(root, lv_pct(100), lv_pct(100));
  lv_obj_add_event_cb(root, free_ctx_cb, LV_EVENT_DELETE, ctx);
  ctx->root = root;

  lv_obj_set_flex_flow(root, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(root, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

  lv_obj_t *top_bar = lv_obj_create(root);
  lv_obj_remove_style_all(top_bar);
  lv_obj_set_width(top_bar, lv_pct(100));
  lv_obj_set_height(top_bar, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(top_bar, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(top_bar, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_hor(top_bar, 15, 0);
  lv_obj_set_style_pad_top(top_bar, 15, 0);
  lv_obj_clear_flag(top_bar, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);

  char device_id[32];
  char mac_address[24];
  freq_device_id_get(device_id, sizeof(device_id));
  format_mac_address(device_id, mac_address, sizeof(mac_address));
  lv_obj_t *device_status = lv_label_create(top_bar);
  lv_label_set_text_fmt(device_status, "MAC Address: %s", mac_address);
  lv_obj_set_style_text_font(device_status, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(device_status, KIOSK_COLOR_ZINC_300, 0);

  lv_obj_t *nfc_status = lv_label_create(top_bar);
  bool nfc_ok = nfc_reader_is_online();
  lv_label_set_text_fmt(nfc_status, "NFC: %s", nfc_ok ? "OK" : "Offline");
  lv_obj_set_style_text_color(nfc_status, nfc_ok ? KIOSK_COLOR_EMERALD_400 : KIOSK_COLOR_RED_400, 0);

  lv_obj_t *title_col = lv_obj_create(root);
  lv_obj_remove_style_all(title_col);
  lv_obj_set_size(title_col, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(title_col, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(title_col, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_top(title_col, 6, 0);
  lv_obj_clear_flag(title_col, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);

  lv_obj_t *logo = lv_img_create(title_col);
  lv_img_set_src(logo, &img_logo_secondary);

  lv_obj_t *title = lv_label_create(title_col);
  lv_label_set_text(title, "Terminal Setup");
  lv_obj_set_style_text_font(title, &lv_font_montserrat_16, 0);
  lv_obj_set_style_text_color(title, KIOSK_COLOR_ZINC_400, 0);
  lv_obj_set_style_pad_top(title, 4, 0);

  lv_obj_t *form = lv_obj_create(root);
  lv_obj_remove_style_all(form);
  lv_obj_set_width(form, lv_pct(100));
  lv_obj_set_flex_grow(form, 1);
  lv_obj_set_style_pad_top(form, 12, 0);

  lv_obj_set_flex_flow(form, LV_FLEX_FLOW_ROW_WRAP);
  lv_obj_set_flex_align(form, LV_FLEX_ALIGN_SPACE_EVENLY, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
  lv_obj_set_style_pad_hor(form, 20, 0);
  lv_obj_clear_flag(form, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);

  for (int i = 0; i < SETUP_FIELD_COUNT; i++) {
    lv_obj_t *field_col = lv_obj_create(form);
    lv_obj_remove_style_all(field_col);
    lv_obj_set_width(field_col, lv_pct(48));
    lv_obj_set_height(field_col, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(field_col, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_bottom(field_col, 8, 0);
    lv_obj_clear_flag(field_col, LV_OBJ_FLAG_SCROLL_ON_FOCUS);

    lv_obj_t *label = lv_label_create(field_col);
    lv_label_set_text(label, FIELDS[i].label);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(label, KIOSK_COLOR_ZINC_400, 0);

    lv_obj_t *ta = lv_textarea_create(field_col);
    lv_textarea_set_one_line(ta, true);
    lv_textarea_set_password_mode(ta, FIELDS[i].password);
    lv_obj_set_width(ta, lv_pct(100));
    lv_obj_set_height(ta, 44);
    lv_obj_set_style_min_height(ta, 44, 0);
    lv_obj_set_style_max_height(ta, 44, 0);
    lv_textarea_set_max_length(ta, FIELDS[i].size - 1);
    lv_obj_set_style_bg_color(ta, KIOSK_COLOR_ZINC_800, 0);
    lv_obj_set_style_text_color(ta, KIOSK_COLOR_ZINC_100, 0);
    lv_obj_set_style_border_color(ta, KIOSK_COLOR_ZINC_700, 0);
    lv_obj_set_style_border_width(ta, 1, 0);
    lv_obj_set_style_radius(ta, 6, 0);
    lv_obj_clear_flag(ta, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
    lv_obj_set_style_anim_time(ta, 0, LV_PART_CURSOR);
    lv_obj_set_style_bg_opa(ta, LV_OPA_TRANSP, LV_PART_CURSOR);
    lv_obj_set_style_border_width(ta, 0, LV_PART_CURSOR);
    kiosk_theme_disable_transitions(ta);
    if (have_existing) {
      const char *val = (const char *)&existing + FIELDS[i].offset;
      if (val[0]) lv_textarea_set_text(ta, val);
    }
    lv_obj_add_event_cb(ta, field_focus_cb, LV_EVENT_FOCUSED, ctx);
    lv_obj_add_event_cb(ta, field_focus_cb, LV_EVENT_CLICKED, ctx);
    ctx->ta[i] = ta;
  }

  /* Scan button row for SSID */
  lv_obj_t *ssid_col = lv_obj_get_parent(ctx->ta[0]);
  lv_obj_t *ssid_row = lv_obj_create(ssid_col);
  lv_obj_remove_style_all(ssid_row);
  lv_obj_set_width(ssid_row, lv_pct(100));
  lv_obj_set_height(ssid_row, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(ssid_row, LV_FLEX_FLOW_ROW);
  lv_obj_set_style_pad_column(ssid_row, 8, 0);

  lv_obj_set_parent(ctx->ta[0], ssid_row);
  lv_obj_set_flex_grow(ctx->ta[0], 1);
  lv_obj_set_width(ctx->ta[0], 0);

  lv_obj_t *scan_btn = lv_btn_create(ssid_row);
  lv_obj_add_style(scan_btn, &kiosk_style_btn_secondary, 0);
  lv_obj_add_style(scan_btn, &kiosk_style_btn_secondary, LV_STATE_PRESSED);
  lv_obj_set_width(scan_btn, 80);
  lv_obj_set_style_min_height(scan_btn, 40, 0);
  lv_obj_t *scan_label = lv_label_create(scan_btn);
  lv_label_set_text(scan_label, "Scan");
  lv_obj_center(scan_label);
  lv_obj_add_event_cb(scan_btn, scan_btn_cb, LV_EVENT_CLICKED, ctx);

  /* Buttons column */
  lv_obj_t *btn_col = lv_obj_create(form);
  lv_obj_remove_style_all(btn_col);
  lv_obj_set_width(btn_col, lv_pct(48));
  lv_obj_set_height(btn_col, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(btn_col, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(btn_col, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_clear_flag(btn_col, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);

  lv_obj_t *spacer = lv_label_create(btn_col);
  lv_label_set_text(spacer, "");
  lv_obj_set_style_text_font(spacer, &lv_font_montserrat_14, 0);

  lv_obj_t *btn_row = lv_obj_create(btn_col);
  lv_obj_remove_style_all(btn_row);
  lv_obj_set_width(btn_row, lv_pct(100));
  lv_obj_set_height(btn_row, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(btn_row, LV_FLEX_FLOW_ROW);
  lv_obj_set_style_pad_column(btn_row, 8, 0);

  lv_obj_t *reset_btn = lv_btn_create(btn_row);
  lv_obj_add_style(reset_btn, &kiosk_style_btn_secondary, 0);
  lv_obj_add_style(reset_btn, &kiosk_style_btn_secondary, LV_STATE_PRESSED);
  lv_obj_set_flex_grow(reset_btn, 1);
  lv_obj_set_style_min_height(reset_btn, KIOSK_MIN_TOUCH_PX, 0);

  lv_obj_t *reset_label = lv_label_create(reset_btn);
  lv_label_set_text(reset_label, "Defaults");
  lv_obj_set_style_text_font(reset_label, &lv_font_montserrat_14, 0);
  lv_obj_center(reset_label);
  lv_obj_add_event_cb(reset_btn, reset_cb, LV_EVENT_CLICKED, ctx);

  lv_obj_t *save_btn = lv_btn_create(btn_row);
  lv_obj_add_style(save_btn, &kiosk_style_btn_primary, 0);
  lv_obj_add_style(save_btn, &kiosk_style_btn_primary, LV_STATE_PRESSED);
  lv_obj_set_flex_grow(save_btn, 1);
  lv_obj_set_style_min_height(save_btn, KIOSK_MIN_TOUCH_PX, 0);

  lv_obj_t *save_label = lv_label_create(save_btn);
  lv_label_set_text(save_label, "Save");
  lv_obj_set_style_text_font(save_label, &lv_font_montserrat_14, 0);
  lv_obj_center(save_label);
  lv_obj_add_event_cb(save_btn, save_cb, LV_EVENT_CLICKED, ctx);

  return root;
}
