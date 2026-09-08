#include "step_booking_confirm.h"
#include "booking_stepper.h"
#include "../theme/kiosk_theme.h"
#include "../assets/branding.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define INPUT_CELL_COUNT 48
#define INPUT_CELL_WIDTH 20

typedef struct {
  step_confirm_cb_t on_confirm;
  void *user_data;
  lv_obj_t *confirm_btn;
  lv_obj_t *confirm_label;
  lv_obj_t *ta_match_title;
  lv_obj_t *root;
  lv_obj_t *input_modal;
  lv_obj_t *editing_ta;
  char *match_title_buf;
  size_t match_title_buf_size;
  lv_timer_t *confirm_timer;
  lv_obj_t *input_cells[INPUT_CELL_COUNT];
  char input_cell_text[INPUT_CELL_COUNT][2];
  char input_text[64];
  size_t input_page_start;
} confirm_ctx_t;

static void sync_match_title(confirm_ctx_t *ctx) {
  if (!ctx->match_title_buf || ctx->match_title_buf_size == 0) return;
  const char *text = lv_textarea_get_text(ctx->ta_match_title);
  snprintf(ctx->match_title_buf, ctx->match_title_buf_size, "%s", text ? text : "");
}

static void back_cb(lv_event_t *e) {
  back_closure_t *c = lv_event_get_user_data(e);
  if (c->cb) c->cb(c->user_data);
}

static void deferred_confirm_cb(lv_timer_t *t) {
  confirm_ctx_t *ctx = t->user_data;
  ctx->confirm_timer = NULL;
  ctx->on_confirm(ctx->user_data);
  lv_timer_del(t);
}

static void confirm_click_cb(lv_event_t *e) {
  confirm_ctx_t *ctx = lv_event_get_user_data(e);
  if (!ctx) return;
  /* Show processing state */
  lv_obj_add_state(ctx->confirm_btn, LV_STATE_DISABLED);
  lv_label_set_text(ctx->confirm_label, "Processing...");

  /* Call the confirm callback deferred so the state renders first */
  ctx->confirm_timer = lv_timer_create(deferred_confirm_cb, 50, ctx);
}

static void free_ctx_cb(lv_event_t *e) {
  confirm_ctx_t *ctx = lv_event_get_user_data(e);
  if (ctx->confirm_timer) {
    lv_timer_del(ctx->confirm_timer);
  }
  if (ctx->input_modal) {
    lv_obj_del(ctx->input_modal);
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

static void repaint_input_preview(confirm_ctx_t *ctx) {
  if (!ctx->input_modal) return;
  size_t len = strlen(ctx->input_text);

  if (len >= ctx->input_page_start + INPUT_CELL_COUNT) {
    ctx->input_page_start = len - INPUT_CELL_COUNT + 1;
  } else if (len < ctx->input_page_start) {
    ctx->input_page_start = 0;
  }

  for (size_t i = 0; i < INPUT_CELL_COUNT; i++) {
    size_t char_idx = ctx->input_page_start + i;
    if (char_idx < len) {
      ctx->input_cell_text[i][0] = ctx->input_text[char_idx];
      ctx->input_cell_text[i][1] = '\0';
    } else {
      ctx->input_cell_text[i][0] = '\0';
    }
    lv_label_set_text_static(ctx->input_cells[i], ctx->input_cell_text[i]);
  }
}

static void close_input_modal(confirm_ctx_t *ctx) {
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
  confirm_ctx_t *ctx = lv_event_get_user_data(e);
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
    if (length + 1 < sizeof(ctx->input_text)) {
      ctx->input_text[length] = ' ';
      ctx->input_text[length + 1] = '\0';
    }
  } else if (strcmp(key, "BKSP") == 0) {
    size_t length = strlen(ctx->input_text);
    if (length > 0) ctx->input_text[length - 1] = '\0';
  } else if (strcmp(key, "OK") == 0) {
    if (ctx->editing_ta) {
      lv_textarea_set_text(ctx->editing_ta, ctx->input_text);
      sync_match_title(ctx);
    }
    close_input_modal(ctx);
  } else if (strcmp(key, "CANCEL") == 0) {
    close_input_modal(ctx);
  } else {
    size_t length = strlen(ctx->input_text);
    size_t key_length = strlen(key);
    if (length + key_length < sizeof(ctx->input_text)) {
      strncat(ctx->input_text, key, sizeof(ctx->input_text) - length - 1);
    }
  }

  repaint_input_preview(ctx);
}

static void ta_event_cb(lv_event_t * e) {
  lv_event_code_t code = lv_event_get_code(e);
  lv_obj_t * target_ta = lv_event_get_target(e);
  confirm_ctx_t * ctx = lv_event_get_user_data(e);
  
  if (code == LV_EVENT_VALUE_CHANGED || code == LV_EVENT_READY || code == LV_EVENT_CANCEL) {
      sync_match_title(ctx);
  }

  if (code == LV_EVENT_FOCUSED) {
      if (ctx->input_modal) return;
      
      lv_obj_add_flag(ctx->root, LV_OBJ_FLAG_HIDDEN);
      
      ctx->editing_ta = target_ta;
      ctx->input_modal = lv_obj_create(lv_scr_act());
      lv_obj_remove_style_all(ctx->input_modal);
      lv_obj_set_size(ctx->input_modal, lv_pct(100), lv_pct(100));
      lv_obj_set_style_bg_color(ctx->input_modal, kiosk_theme_color_bg(), 0);
      lv_obj_set_style_bg_opa(ctx->input_modal, LV_OPA_COVER, 0);
      lv_obj_clear_flag(ctx->input_modal, LV_OBJ_FLAG_SCROLLABLE);

      /* Header */
      lv_obj_t *hdr = lv_obj_create(ctx->input_modal);
      lv_obj_remove_style_all(hdr);
      lv_obj_set_width(hdr, lv_pct(100));
      lv_obj_set_height(hdr, 40);
      lv_obj_align(hdr, LV_ALIGN_TOP_MID, 0, 0);
      lv_obj_set_style_bg_color(hdr, kiosk_theme_color_bg(), 0);
      lv_obj_set_style_bg_opa(hdr, LV_OPA_COVER, 0);
      lv_obj_clear_flag(hdr, LV_OBJ_FLAG_SCROLLABLE);

      lv_obj_t *hdr_label = lv_label_create(hdr);
      lv_label_set_text(hdr_label, "Match Title");
      lv_obj_set_style_text_font(hdr_label, &lv_font_montserrat_14, 0);
      lv_obj_set_style_text_color(hdr_label, kiosk_theme_color_text_muted(), 0);
      lv_obj_align(hdr_label, LV_ALIGN_BOTTOM_LEFT, 20, -4);

      snprintf(ctx->input_text, sizeof(ctx->input_text), "%s",
               lv_textarea_get_text(target_ta));

      /* Fixed, non-interactive display */
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

      /* Keyboard — fixed at bottom, not managed by flex */
      lv_obj_t *kb = lv_btnmatrix_create(ctx->input_modal);
      lv_btnmatrix_set_map(kb, KEYS_LOWER);
      lv_obj_set_size(kb, 1024, 360);
      lv_obj_set_style_min_height(kb, 360, 0);
      lv_obj_set_style_max_height(kb, 360, 0);
      lv_obj_set_pos(kb, 0, 240);
      lv_obj_clear_flag(kb, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
      lv_obj_add_flag(kb, LV_OBJ_FLAG_IGNORE_LAYOUT);

      kiosk_theme_style_keyboard(kb);

      lv_obj_add_event_cb(kb, static_keyboard_event_cb, LV_EVENT_VALUE_CHANGED, ctx);

      repaint_input_preview(ctx);
  }
}



lv_obj_t *step_booking_confirm_create(lv_obj_t *parent,
                                       const char *member_name, int32_t balance,
                                       const char *court_name,
                                       const char *game_type_label,
                                       int32_t duration_min,
                                       int32_t credits_required,
                                       char *match_title_buf, size_t match_title_buf_size,
                                       bool is_check_in, bool is_capped,
                                       step_confirm_cb_t on_confirm,
                                       void (*on_cancel)(void *), void *cancel_user_data,
                                       void (*on_back)(void *), void *back_user_data,
                                       void *user_data) {
  int32_t remaining = balance - credits_required;
  bool sufficient = balance >= credits_required;

  lv_obj_t *root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_set_size(root, lv_pct(100), lv_pct(100));
  lv_obj_set_flex_flow(root, LV_FLEX_FLOW_COLUMN);
  lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE);


  confirm_ctx_t *ctx = malloc(sizeof(confirm_ctx_t));
  memset(ctx, 0, sizeof(*ctx));
  ctx->on_confirm = on_confirm;
  ctx->user_data = user_data;
  ctx->root = root;
  ctx->ta_match_title = NULL;
  ctx->match_title_buf = match_title_buf;
  ctx->match_title_buf_size = match_title_buf_size;

  booking_stepper_create(root, 3, member_name, balance, on_cancel, cancel_user_data);

  lv_obj_add_event_cb(root, free_ctx_cb, LV_EVENT_DELETE, ctx);

  lv_obj_t *body = lv_obj_create(root);
  lv_obj_remove_style_all(body);
  lv_obj_set_width(body, lv_pct(100));
  lv_obj_set_flex_grow(body, 1);
  lv_obj_set_flex_flow(body, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_all(body, 6, 0);
  lv_obj_set_style_pad_row(body, 6, 0);
  lv_obj_clear_flag(body, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ELASTIC | LV_OBJ_FLAG_SCROLL_MOMENTUM | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_set_scrollbar_mode(body, LV_SCROLLBAR_MODE_OFF);

  lv_obj_t *header = lv_label_create(body);
  lv_label_set_text(header, is_check_in ? "Review Check-In Details" : "Review Booking Details");
  lv_obj_set_style_text_font(header, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(header, kiosk_theme_color_text_muted(), 0);

  /* Summary cards row */
  char dur_buf[32];
  if (is_capped) {
    snprintf(dur_buf, sizeof(dur_buf), "%d mins\n(Capped)", (int)duration_min);
  } else {
    snprintf(dur_buf, sizeof(dur_buf), "%d mins", (int)duration_min);
  }

  lv_obj_t *cards_row = lv_obj_create(body);
  lv_obj_remove_style_all(cards_row);
  lv_obj_set_width(cards_row, lv_pct(100));
  lv_obj_set_height(cards_row, 54);
  lv_obj_set_flex_flow(cards_row, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(cards_row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(cards_row, 6, 0);
  lv_obj_clear_flag(cards_row, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);

  for (int i = 0; i < 3; i++) {
    const char *lbl = NULL, *val = NULL;
    switch (i) {
      case 0: lbl = "Court"; val = court_name; break;
      case 1: lbl = "Format"; val = game_type_label; break;
      case 2: lbl = "Duration"; val = dur_buf; break;
    }
    lv_obj_t *card = lv_obj_create(cards_row);
    lv_obj_remove_style_all(card);
    lv_obj_set_style_bg_color(card, kiosk_theme_color_panel(), 0);
    lv_obj_set_style_bg_opa(card, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(card, kiosk_theme_color_border(), 0);
    lv_obj_set_style_border_width(card, 1, 0);
    lv_obj_set_style_radius(card, 8, 0);
    lv_obj_set_width(card, lv_pct(31));
    lv_obj_set_height(card, 54);
    lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(card, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_all(card, 6, 0);
    lv_obj_set_style_pad_row(card, 2, 0);
    lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);

    lv_obj_t *clbl = lv_label_create(card);
    lv_label_set_text(clbl, lbl);
    lv_obj_set_style_text_font(clbl, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(clbl, kiosk_theme_color_text_muted(), 0);

    lv_obj_t *cval = lv_label_create(card);
    lv_label_set_text(cval, val);
    lv_obj_set_style_text_font(cval, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(cval, kiosk_theme_color_text_strong(), 0);
  }

  /* Payment receipt */
  lv_obj_t *receipt = lv_obj_create(body);
  lv_obj_remove_style_all(receipt);
  lv_obj_set_style_bg_color(receipt, kiosk_theme_color_panel(), 0);
  lv_obj_set_style_bg_opa(receipt, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(receipt, sufficient ? kiosk_theme_color_success() : kiosk_theme_color_danger(), 0);
  lv_obj_set_style_border_width(receipt, 1, 0);
  lv_obj_set_style_border_opa(receipt, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(receipt, 8, 0);
  lv_obj_set_width(receipt, lv_pct(100));
  lv_obj_set_height(receipt, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(receipt, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_all(receipt, 8, 0);
  lv_obj_set_style_pad_row(receipt, 3, 0);
  lv_obj_clear_flag(receipt, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);

  /* Receipt header row: title on left, status on right */
  lv_obj_t *r_hdr = lv_obj_create(receipt);
  lv_obj_remove_style_all(r_hdr);
  lv_obj_set_width(r_hdr, lv_pct(100));
  lv_obj_set_height(r_hdr, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(r_hdr, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(r_hdr, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_clear_flag(r_hdr, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);

  lv_obj_t *receipt_title = lv_label_create(r_hdr);
  lv_label_set_text(receipt_title, "Payment Receipt");
  lv_obj_set_style_text_font(receipt_title, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(receipt_title, kiosk_theme_color_text(), 0);

  lv_obj_t *status_badge = lv_label_create(r_hdr);
  lv_label_set_text(status_badge, sufficient ? LV_SYMBOL_OK " Ready" : LV_SYMBOL_WARNING " Insufficient Credits");
  lv_obj_set_style_text_font(status_badge, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(status_badge, sufficient ? kiosk_theme_color_success() : kiosk_theme_color_danger(), 0);

  /* Separator */
  lv_obj_t *sep = lv_obj_create(receipt);
  lv_obj_remove_style_all(sep);
  lv_obj_set_width(sep, lv_pct(100));
  lv_obj_set_height(sep, 1);
  lv_obj_set_style_bg_color(sep, kiosk_theme_color_border(), 0);
  lv_obj_set_style_bg_opa(sep, LV_OPA_COVER, 0);

  /* Balance row */
  char bal_buf[16];
  snprintf(bal_buf, sizeof(bal_buf), "P%d", (int)balance);
  lv_obj_t *bal_row = lv_obj_create(receipt);
  lv_obj_remove_style_all(bal_row);
  lv_obj_set_width(bal_row, lv_pct(100));
  lv_obj_set_height(bal_row, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(bal_row, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(bal_row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_clear_flag(bal_row, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_t *bal_lbl = lv_label_create(bal_row);
  lv_label_set_text(bal_lbl, "Account Balance");
  lv_obj_set_style_text_font(bal_lbl, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(bal_lbl, kiosk_theme_color_text_muted(), 0);
  lv_obj_t *bal_val = lv_label_create(bal_row);
  lv_label_set_text(bal_val, bal_buf);
  lv_obj_set_style_text_font(bal_val, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(bal_val, kiosk_theme_color_text_strong(), 0);

  /* Cost row */
  char cost_buf[16];
  snprintf(cost_buf, sizeof(cost_buf), "-P%d", (int)credits_required);
  lv_obj_t *cost_row = lv_obj_create(receipt);
  lv_obj_remove_style_all(cost_row);
  lv_obj_set_width(cost_row, lv_pct(100));
  lv_obj_set_height(cost_row, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(cost_row, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(cost_row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_clear_flag(cost_row, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_t *cost_lbl = lv_label_create(cost_row);
  lv_label_set_text(cost_lbl, "Booking Cost");
  lv_obj_set_style_text_font(cost_lbl, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(cost_lbl, kiosk_theme_color_text_muted(), 0);
  lv_obj_t *cost_val = lv_label_create(cost_row);
  lv_label_set_text(cost_val, cost_buf);
  lv_obj_set_style_text_font(cost_val, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(cost_val, kiosk_theme_color_danger(), 0);

  /* Separator 2 */
  lv_obj_t *sep2 = lv_obj_create(receipt);
  lv_obj_remove_style_all(sep2);
  lv_obj_set_width(sep2, lv_pct(100));
  lv_obj_set_height(sep2, 1);
  lv_obj_set_style_bg_color(sep2, kiosk_theme_color_border(), 0);
  lv_obj_set_style_bg_opa(sep2, LV_OPA_COVER, 0);

  /* Remaining balance */
  char rem_buf[16];
  snprintf(rem_buf, sizeof(rem_buf), "P%d", (int)remaining);
  lv_obj_t *rem_row = lv_obj_create(receipt);
  lv_obj_remove_style_all(rem_row);
  lv_obj_set_width(rem_row, lv_pct(100));
  lv_obj_set_height(rem_row, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(rem_row, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(rem_row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_clear_flag(rem_row, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_t *rem_lbl = lv_label_create(rem_row);
  lv_label_set_text(rem_lbl, "Balance After Booking");
  lv_obj_set_style_text_font(rem_lbl, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(rem_lbl, kiosk_theme_color_text(), 0);
  lv_obj_t *rem_val = lv_label_create(rem_row);
  lv_label_set_text(rem_val, rem_buf);
  lv_obj_set_style_text_font(rem_val, &lv_font_montserrat_16, 0);
  lv_obj_set_style_text_color(rem_val, sufficient ? kiosk_theme_color_success() : kiosk_theme_color_danger(), 0);

  /* Match title input */
  lv_obj_t *match_title_col = lv_obj_create(body);
  lv_obj_remove_style_all(match_title_col);
  lv_obj_set_width(match_title_col, lv_pct(100));
  lv_obj_set_height(match_title_col, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(match_title_col, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(match_title_col, 2, 0);
  lv_obj_clear_flag(match_title_col, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);

  lv_obj_t *mt_label = lv_label_create(match_title_col);
  lv_label_set_text(mt_label, "Match Title (Optional)");
  lv_obj_set_style_text_font(mt_label, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(mt_label, kiosk_theme_color_text_muted(), 0);

  lv_obj_t *ta = lv_textarea_create(match_title_col);
  lv_textarea_set_one_line(ta, true);
  lv_textarea_set_max_length(ta, 64);
  lv_obj_set_height(ta, 38);
  lv_obj_clear_flag(ta, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_textarea_set_placeholder_text(ta, "e.g. Weekend Showdown");
  lv_obj_set_width(ta, lv_pct(100));
  lv_obj_set_style_anim_time(ta, 0, LV_PART_CURSOR);
  lv_obj_set_style_bg_opa(ta, LV_OPA_TRANSP, LV_PART_CURSOR);
  lv_obj_set_style_border_width(ta, 0, LV_PART_CURSOR);
  kiosk_theme_disable_transitions(ta);
  ctx->ta_match_title = ta;
  lv_obj_add_event_cb(ta, ta_event_cb, LV_EVENT_ALL, ctx);

  /* Action buttons */
  lv_obj_t *btn_row = lv_obj_create(body);
  lv_obj_remove_style_all(btn_row);
  lv_obj_set_width(btn_row, lv_pct(100));
  lv_obj_set_height(btn_row, 44);
  lv_obj_set_flex_flow(btn_row, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(btn_row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(btn_row, 8, 0);
  lv_obj_clear_flag(btn_row, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);

  lv_obj_t *back_btn = lv_btn_create(btn_row);
  lv_obj_add_style(back_btn, &kiosk_style_btn_secondary, 0);
  lv_obj_add_style(back_btn, &kiosk_style_btn_secondary, LV_STATE_PRESSED);
  lv_obj_set_width(back_btn, LV_SIZE_CONTENT);
  lv_obj_set_height(back_btn, 42);
  lv_obj_set_flex_grow(back_btn, 1);
  lv_obj_clear_flag(back_btn, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_t *back_label = lv_label_create(back_btn);
  lv_label_set_text(back_label, LV_SYMBOL_LEFT " Back");
  lv_obj_center(back_label);

  back_closure_t *exit_cl = malloc(sizeof(back_closure_t));
  exit_cl->cb = on_back;
  exit_cl->user_data = back_user_data;
  lv_obj_add_event_cb(back_btn, back_cb, LV_EVENT_CLICKED, exit_cl);
  lv_obj_add_event_cb(back_btn, free_closure_cb, LV_EVENT_DELETE, exit_cl);

  ctx->confirm_btn = lv_btn_create(btn_row);
  lv_obj_set_style_bg_color(ctx->confirm_btn, kiosk_theme_color_primary(), 0);
  lv_obj_set_flex_grow(ctx->confirm_btn, 2);
  lv_obj_set_height(ctx->confirm_btn, 42);
  lv_obj_clear_flag(ctx->confirm_btn, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  if (!sufficient) lv_obj_add_state(ctx->confirm_btn, LV_STATE_DISABLED);

  ctx->confirm_label = lv_label_create(ctx->confirm_btn);
  lv_label_set_text(ctx->confirm_label, is_check_in ? "Check In Now" : "Confirm & Book Match");
  lv_obj_center(ctx->confirm_label);
  lv_obj_add_event_cb(ctx->confirm_btn, confirm_click_cb, LV_EVENT_CLICKED, ctx);

  return root;
}
