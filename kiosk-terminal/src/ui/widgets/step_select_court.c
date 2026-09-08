#include "step_select_court.h"
#include "booking_stepper.h"
#include "../theme/kiosk_theme.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  court_option_t court;
  step_select_court_cb_t cb;
  void *user_data;
} court_btn_closure_t;

static void click_cb(lv_event_t *e) {
  court_btn_closure_t *c = lv_event_get_user_data(e);
  c->cb(c->user_data, &c->court);
}



static const char *status_icon_for(const char *status) {
  if (strcmp(status, "Available") == 0) return LV_SYMBOL_OK;
  if (strcmp(status, "Playing") == 0) return LV_SYMBOL_PLAY;
  if (strcmp(status, "Reserved") == 0) return LV_SYMBOL_BELL;
  if (strcmp(status, "Maintenance") == 0) return LV_SYMBOL_WARNING;
  return LV_SYMBOL_CLOSE;
}

static lv_color_t status_color_for(const char *status) {
  if (strcmp(status, "Available") == 0) return kiosk_theme_color_success();
  if (strcmp(status, "Playing") == 0) return kiosk_theme_color_warning();
  if (strcmp(status, "Reserved") == 0) return kiosk_theme_color_primary();
  if (strcmp(status, "Maintenance") == 0) return kiosk_theme_color_danger();
  return kiosk_theme_color_text_muted();
}

static const char *status_label_for(const char *status) {
  if (strcmp(status, "Available") == 0) return "Book now & start immediately";
  if (strcmp(status, "Playing") == 0) return "Tap to queue up next";
  if (strcmp(status, "Reserved") == 0) return "Tap to queue up next";
  if (strcmp(status, "Maintenance") == 0) return "Court temporarily offline";
  return "Court is closed";
}

static lv_obj_t *make_tile(lv_obj_t *parent, const char *name, const char *badge_text,
                            lv_color_t badge_color, const char *icon, const char *desc,
                            bool disabled) {
  lv_obj_t *tile = lv_btn_create(parent);
  lv_obj_add_style(tile, &kiosk_style_tile, 0);
  lv_obj_add_style(tile, &kiosk_style_tile, LV_STATE_PRESSED);
  lv_obj_set_width(tile, lv_pct(48));
  lv_obj_set_height(tile, 140);
  lv_obj_set_style_pad_all(tile, 12, 0);
  lv_obj_set_flex_flow(tile, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(tile, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
  lv_obj_set_style_pad_row(tile, 6, 0);

  if (disabled) {
    lv_obj_add_state(tile, LV_STATE_DISABLED);
    lv_obj_set_style_bg_opa(tile, LV_OPA_30, LV_STATE_DISABLED);
  }

  lv_obj_t *top = lv_obj_create(tile);
  lv_obj_remove_style_all(top);
  lv_obj_set_width(top, lv_pct(100));
  lv_obj_set_height(top, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(top, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(top, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_clear_flag(top, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *left = lv_obj_create(top);
  lv_obj_remove_style_all(left);
  lv_obj_set_height(left, LV_SIZE_CONTENT);
  lv_obj_set_flex_grow(left, 1);
  lv_obj_set_flex_flow(left, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(left, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(left, 6, 0);
  lv_obj_clear_flag(left, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *icon_label = lv_label_create(left);
  lv_label_set_text(icon_label, icon);
  lv_obj_set_style_text_font(icon_label, &lv_font_montserrat_16, 0);
  lv_obj_set_style_text_color(icon_label, badge_color, 0);

  lv_obj_t *name_label = lv_label_create(left);
  lv_label_set_text(name_label, name);
  lv_obj_set_style_text_font(name_label, &lv_font_montserrat_16, 0);
  lv_obj_set_style_text_color(name_label, kiosk_theme_color_text_strong(), 0);

  lv_obj_t *badge = lv_obj_create(top);
  lv_obj_remove_style_all(badge);
  lv_obj_set_size(badge, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
  lv_obj_set_style_bg_color(badge, badge_color, 0);
  lv_obj_set_style_bg_opa(badge, LV_OPA_20, 0);
  lv_obj_set_style_radius(badge, 4, 0);
  lv_obj_set_style_pad_hor(badge, 6, 0);
  lv_obj_set_style_pad_ver(badge, 2, 0);
  lv_obj_t *badge_label = lv_label_create(badge);
  lv_label_set_text(badge_label, badge_text);
  lv_obj_set_style_text_font(badge_label, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(badge_label, badge_color, 0);

  lv_obj_t *desc_label = lv_label_create(tile);
  lv_label_set_text(desc_label, desc);
  lv_obj_set_style_text_font(desc_label, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(desc_label, kiosk_theme_color_text_muted(), 0);

  return tile;
}

lv_obj_t *step_select_court_create(lv_obj_t *parent,
                                    const char *member_name, int32_t balance,
                                    const court_option_t *courts, uint8_t count,
                                    step_select_court_cb_t on_select,
                                    void (*on_cancel)(void *), void *cancel_user_data,
                                    void *user_data) {
  lv_obj_t *root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_set_size(root, lv_pct(100), lv_pct(100));
  lv_obj_set_flex_flow(root, LV_FLEX_FLOW_COLUMN);
  lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE);

  booking_stepper_create(root, 0, member_name, balance, on_cancel, cancel_user_data);

  lv_obj_t *scroll = lv_obj_create(root);
  lv_obj_remove_style_all(scroll);
  lv_obj_set_width(scroll, lv_pct(100));
  lv_obj_set_flex_grow(scroll, 1);
  lv_obj_set_flex_flow(scroll, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_all(scroll, 12, 0);
  lv_obj_set_style_pad_row(scroll, 8, 0);
  lv_obj_add_flag(scroll, LV_OBJ_FLAG_SCROLLABLE); lv_obj_clear_flag(scroll, LV_OBJ_FLAG_SCROLL_ELASTIC | LV_OBJ_FLAG_SCROLL_MOMENTUM);
  lv_obj_set_scrollbar_mode(scroll, LV_SCROLLBAR_MODE_AUTO);

  lv_obj_t *title = lv_label_create(scroll);
  lv_label_set_text(title, "Choose a Court");
  lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(title, kiosk_theme_color_text_muted(), 0);

  lv_obj_t *grid = lv_obj_create(scroll);
  lv_obj_remove_style_all(grid);
  lv_obj_set_width(grid, lv_pct(100));
  lv_obj_set_flex_grow(grid, 1);
  lv_obj_set_flex_flow(grid, LV_FLEX_FLOW_ROW_WRAP);
  lv_obj_set_style_pad_column(grid, 8, 0);
  lv_obj_set_style_pad_row(grid, 8, 0);

  /* Any Court tile */
  court_btn_closure_t *any_closure = malloc(sizeof(court_btn_closure_t));
  memset(&any_closure->court, 0, sizeof(any_closure->court));
  snprintf(any_closure->court.name, sizeof(any_closure->court.name), "Any Court");
  snprintf(any_closure->court.status, sizeof(any_closure->court.status), "Available");
  any_closure->cb = on_select;
  any_closure->user_data = user_data;

  lv_obj_t *any_tile = lv_btn_create(grid);
  lv_obj_add_style(any_tile, &kiosk_style_tile, 0);
  lv_obj_add_style(any_tile, &kiosk_style_tile, LV_STATE_PRESSED);
  lv_obj_set_width(any_tile, lv_pct(48));
  lv_obj_set_height(any_tile, 140);
  lv_obj_set_style_pad_all(any_tile, 12, 0);
  lv_obj_set_style_border_color(any_tile, kiosk_theme_color_primary(), 0);
  lv_obj_set_style_border_opa(any_tile, LV_OPA_40, 0);
  lv_obj_set_style_border_width(any_tile, 2, 0);
  lv_obj_set_style_radius(any_tile, 8, 0);
  lv_obj_set_flex_flow(any_tile, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(any_tile, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
  lv_obj_set_style_pad_row(any_tile, 4, 0);

  lv_obj_t *any_top = lv_obj_create(any_tile);
  lv_obj_remove_style_all(any_top);
  lv_obj_set_width(any_top, lv_pct(100));
  lv_obj_set_height(any_top, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(any_top, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(any_top, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_clear_flag(any_top, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_t *any_left = lv_obj_create(any_top);
  lv_obj_remove_style_all(any_left);
  lv_obj_set_height(any_left, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(any_left, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(any_left, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(any_left, 6, 0);
  lv_obj_clear_flag(any_left, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_t *any_icon = lv_label_create(any_left);
  lv_label_set_text(any_icon, LV_SYMBOL_PLAY);
  lv_obj_set_style_text_font(any_icon, &lv_font_montserrat_16, 0);
  lv_obj_set_style_text_color(any_icon, kiosk_theme_color_primary(), 0);
  lv_obj_t *any_name = lv_label_create(any_left);
  lv_label_set_text(any_name, "Any Court");
  lv_obj_set_style_text_font(any_name, &lv_font_montserrat_16, 0);
  lv_obj_set_style_text_color(any_name, kiosk_theme_color_text_strong(), 0);
  lv_obj_t *any_badge = lv_obj_create(any_top);
  lv_obj_remove_style_all(any_badge);
  lv_obj_set_size(any_badge, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
  lv_obj_set_style_bg_color(any_badge, kiosk_theme_color_primary(), 0);
  lv_obj_set_style_bg_opa(any_badge, LV_OPA_10, 0);
  lv_obj_set_style_radius(any_badge, 4, 0);
  lv_obj_set_style_border_color(any_badge, kiosk_theme_color_primary(), 0);
  lv_obj_set_style_border_width(any_badge, 1, 0);
  lv_obj_set_style_border_opa(any_badge, LV_OPA_20, 0);
  lv_obj_set_style_pad_hor(any_badge, 6, 0);
  lv_obj_set_style_pad_ver(any_badge, 2, 0);
  lv_obj_t *any_badge_label = lv_label_create(any_badge);
  lv_label_set_text(any_badge_label, "Auto");
  lv_obj_set_style_text_font(any_badge_label, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(any_badge_label, kiosk_theme_color_primary(), 0);
  lv_obj_t *any_desc = lv_label_create(any_tile);
  lv_label_set_text(any_desc, "System picks first available court");
  lv_obj_set_style_text_font(any_desc, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(any_desc, kiosk_theme_color_text_muted(), 0);
  lv_obj_t *any_rec = lv_label_create(any_tile);
  lv_label_set_text(any_rec, "Recommended for fastest play");
  lv_obj_set_style_text_font(any_rec, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(any_rec, kiosk_theme_color_primary(), 0);
  lv_obj_add_event_cb(any_tile, click_cb, LV_EVENT_CLICKED, any_closure);
  lv_obj_add_event_cb(any_tile, free_closure_cb, LV_EVENT_DELETE, any_closure);

  for (uint8_t i = 0; i < count; i++) {
    const court_option_t *c = &courts[i];
    bool closed = strcmp(c->status, "Maintenance") == 0 || strcmp(c->status, "Closed") == 0;
    lv_color_t badge_color = status_color_for(c->status);
    const char *badge_text = c->status;
    const char *icon = status_icon_for(c->status);
    const char *desc = status_label_for(c->status);

    court_btn_closure_t *closure = malloc(sizeof(court_btn_closure_t));
    closure->court = *c;
    closure->cb = on_select;
    closure->user_data = user_data;

    lv_obj_t *tile = make_tile(grid, c->name, badge_text, badge_color, icon, desc, closed);
    if (!closed) {
      lv_obj_add_event_cb(tile, click_cb, LV_EVENT_CLICKED, closure);
    }
    lv_obj_add_event_cb(tile, free_closure_cb, LV_EVENT_DELETE, closure);
  }

  return root;
}
