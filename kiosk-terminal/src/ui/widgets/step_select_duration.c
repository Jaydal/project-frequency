#include "step_select_duration.h"
#include "booking_stepper.h"
#include "../theme/kiosk_theme.h"
#include <stdlib.h>
#include <stdio.h>

typedef struct {
  int32_t duration_min;
  step_select_duration_cb_t cb;
  void *user_data;
} duration_closure_t;

static void click_cb(lv_event_t *e) {
  duration_closure_t *c = lv_event_get_user_data(e);
  c->cb(c->user_data, c->duration_min);
}

static void back_cb(lv_event_t *e) {
  back_closure_t *c = lv_event_get_user_data(e);
  if (c->cb) c->cb(c->user_data);
}

static const char *duration_label(int32_t mins) {
  if (mins <= 15) return "Express Match";
  if (mins <= 30) return "Quick Match";
  if (mins <= 60) return "Standard Play";
  return "Extended Session";
}

lv_obj_t *step_select_duration_create(lv_obj_t *parent,
                                       const char *member_name, int32_t balance,
                                       const kiosk_products_config_t *config,
                                       int32_t party_size,
                                       bool has_active_game,
                                       step_select_duration_cb_t on_select,
                                       void (*on_cancel)(void *), void *cancel_user_data,
                                       void (*on_back)(void *), void *back_user_data,
                                       void *user_data) {
  lv_obj_t *root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_set_size(root, lv_pct(100), lv_pct(100));
  lv_obj_set_flex_flow(root, LV_FLEX_FLOW_COLUMN);
  lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE);

  booking_stepper_create(root, 2, member_name, balance, on_cancel, cancel_user_data);

  lv_obj_t *scroll = lv_obj_create(root);
  lv_obj_remove_style_all(scroll);
  lv_obj_set_width(scroll, lv_pct(100));
  lv_obj_set_flex_grow(scroll, 1);
  lv_obj_set_flex_flow(scroll, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_all(scroll, 12, 0);
  lv_obj_set_style_pad_row(scroll, 8, 0);
  lv_obj_set_scrollbar_mode(scroll, LV_SCROLLBAR_MODE_AUTO);
  lv_obj_add_flag(scroll, LV_OBJ_FLAG_SCROLLABLE); lv_obj_clear_flag(scroll, LV_OBJ_FLAG_SCROLL_ELASTIC | LV_OBJ_FLAG_SCROLL_MOMENTUM);

  lv_obj_t *title = lv_label_create(scroll);
  if (has_active_game) {
    lv_label_set_text(title, "Choose Match Duration (Max 1 hr while in game)");
  } else {
    lv_label_set_text(title, "Choose Match Duration");
  }
  lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(title, kiosk_theme_color_text_muted(), 0);

  lv_obj_t *grid = lv_obj_create(scroll);
  lv_obj_remove_style_all(grid);
  lv_obj_set_width(grid, lv_pct(100));
  lv_obj_set_flex_grow(grid, 1);
  lv_obj_set_flex_flow(grid, LV_FLEX_FLOW_ROW_WRAP);
  lv_obj_set_style_pad_column(grid, 8, 0);
  lv_obj_set_style_pad_row(grid, 8, 0);

  for (uint8_t i = 0; i < config->duration_count; i++) {
    int32_t d = config->durations_min[i];
    if (has_active_game && d > 60) {
      continue;
    }
    int32_t total = kiosk_get_cost(config, d, party_size);
    bool is_popular = (d == 60);
    const char *label = duration_label(d);

    lv_obj_t *tile = lv_btn_create(grid);
    lv_obj_add_style(tile, &kiosk_style_tile, 0);
    lv_obj_add_style(tile, &kiosk_style_tile, LV_STATE_PRESSED);
    lv_obj_set_width(tile, lv_pct(48));
    lv_obj_set_height(tile, 140);
    lv_obj_set_style_pad_all(tile, 12, 0);
    lv_obj_set_flex_flow(tile, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(tile, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
    lv_obj_set_style_pad_row(tile, 4, 0);

    lv_obj_t *top_row = lv_obj_create(tile);
    lv_obj_remove_style_all(top_row);
    lv_obj_set_width(top_row, lv_pct(100));
    lv_obj_set_height(top_row, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(top_row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(top_row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_clear_flag(top_row, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *left_group = lv_obj_create(top_row);
    lv_obj_remove_style_all(left_group);
    lv_obj_set_height(left_group, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(left_group, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(left_group, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(left_group, 4, 0);
    lv_obj_clear_flag(left_group, LV_OBJ_FLAG_SCROLLABLE);

    char dur_buf[8];
    snprintf(dur_buf, sizeof(dur_buf), "%d", (int)d);
    lv_obj_t *dur_label = lv_label_create(left_group);
    lv_label_set_text(dur_label, dur_buf);
    lv_obj_set_style_text_font(dur_label, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(dur_label, kiosk_theme_color_text_strong(), 0);

    lv_obj_t *min_label = lv_label_create(left_group);
    lv_label_set_text(min_label, "min");
    lv_obj_set_style_text_font(min_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(min_label, kiosk_theme_color_text_muted(), 0);

    if (is_popular) {
      lv_obj_set_style_border_color(tile, kiosk_theme_color_primary(), 0);
      lv_obj_set_style_border_opa(tile, LV_OPA_50, 0);
      lv_obj_set_style_bg_color(tile, kiosk_theme_color_primary(), 0);
      lv_obj_set_style_bg_opa(tile, LV_OPA_10, 0);

      lv_obj_t *pop_badge = lv_label_create(top_row);
      lv_label_set_text(pop_badge, "Popular");
      lv_obj_set_style_text_font(pop_badge, &lv_font_montserrat_14, 0);
      lv_obj_set_style_text_color(pop_badge, kiosk_theme_color_bg(), 0);
      lv_obj_set_style_bg_color(pop_badge, kiosk_theme_color_primary(), 0);
      lv_obj_set_style_bg_opa(pop_badge, LV_OPA_COVER, 0);
      lv_obj_set_style_radius(pop_badge, 4, 0);
      lv_obj_set_style_pad_hor(pop_badge, 6, 0);
      lv_obj_set_style_pad_ver(pop_badge, 2, 0);
    }

    lv_obj_t *bot_row = lv_obj_create(tile);
    lv_obj_remove_style_all(bot_row);
    lv_obj_set_width(bot_row, lv_pct(100));
    lv_obj_set_height(bot_row, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(bot_row, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(bot_row, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
    lv_obj_set_style_pad_row(bot_row, 2, 0);
    lv_obj_clear_flag(bot_row, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *desc_label = lv_label_create(bot_row);
    lv_label_set_text(desc_label, label);
    lv_obj_set_style_text_font(desc_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(desc_label, kiosk_theme_color_text_muted(), 0);

    char price_buf[16];
    snprintf(price_buf, sizeof(price_buf), "P%d", (int)total);
    lv_obj_t *price_label = lv_label_create(bot_row);
    lv_label_set_text(price_label, price_buf);
    lv_obj_set_style_text_font(price_label, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(price_label, kiosk_theme_color_primary(), 0);

    duration_closure_t *closure = malloc(sizeof(duration_closure_t));
    closure->duration_min = d;
    closure->cb = on_select;
    closure->user_data = user_data;
    lv_obj_add_event_cb(tile, click_cb, LV_EVENT_CLICKED, closure);
    lv_obj_add_event_cb(tile, free_closure_cb, LV_EVENT_DELETE, closure);
  }

  lv_obj_t *back_btn = lv_btn_create(scroll);
  lv_obj_add_style(back_btn, &kiosk_style_btn_secondary, 0);
  lv_obj_add_style(back_btn, &kiosk_style_btn_secondary, LV_STATE_PRESSED);
  lv_obj_set_width(back_btn, lv_pct(100));
  lv_obj_t *back_label = lv_label_create(back_btn);
  lv_label_set_text(back_label, LV_SYMBOL_LEFT " Back to Game Format");
  lv_obj_center(back_label);

  back_closure_t *exit_cl = malloc(sizeof(back_closure_t));
  exit_cl->cb = on_back;
  exit_cl->user_data = back_user_data;
  lv_obj_add_event_cb(back_btn, back_cb, LV_EVENT_CLICKED, exit_cl);
  lv_obj_add_event_cb(back_btn, free_closure_cb, LV_EVENT_DELETE, exit_cl);

  return root;
}
