#include "court_overview.h"
#include "../theme/kiosk_theme.h"
#include <stdio.h>

static void set_label(lv_obj_t *parent, const char *text, const lv_font_t *font, lv_color_t color) {
  lv_obj_t *label = lv_label_create(parent);
  lv_label_set_text(label, text);
  lv_obj_set_style_text_font(label, font, 0);
  lv_obj_set_style_text_color(label, color, 0);
}

lv_obj_t *court_overview_create(lv_obj_t *parent, const court_status_t *courts, uint8_t count) {
  lv_obj_t *panel = lv_obj_create(parent);
  lv_obj_remove_style_all(panel);
  lv_obj_set_size(panel, lv_pct(100), lv_pct(100));
  lv_obj_set_flex_flow(panel, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_all(panel, 12, 0);
  lv_obj_set_style_pad_row(panel, 6, 0);
  lv_obj_set_scrollbar_mode(panel, LV_SCROLLBAR_MODE_AUTO);
  lv_obj_add_flag(panel, LV_OBJ_FLAG_SCROLLABLE); lv_obj_clear_flag(panel, LV_OBJ_FLAG_SCROLL_ELASTIC | LV_OBJ_FLAG_SCROLL_MOMENTUM);

  set_label(panel, "COURTS", &lv_font_montserrat_14, kiosk_theme_color_text_muted());

  for (uint8_t i = 0; i < count; i++) {
    const court_status_t *c = &courts[i];
    int32_t elapsed = court_elapsed_sec(c);
    int32_t prep_sec = kiosk_effective_prep_sec(c->duration_min, c->prep_time_sec);
    court_phase_t phase = court_is_active(c) ? kiosk_phase_for_elapsed(elapsed, prep_sec) : COURT_PHASE_AVAILABLE;

    lv_obj_t *row = lv_obj_create(panel);
    lv_obj_set_width(row, lv_pct(100));
    lv_obj_set_height(row, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_color(row, kiosk_theme_color_panel(), 0);
    lv_obj_set_style_bg_opa(row, LV_OPA_50, 0);
    lv_obj_set_style_border_width(row, 0, 0);
    lv_obj_set_style_radius(row, 4, 0);
    lv_obj_set_style_pad_hor(row, 8, 0);
    lv_obj_set_style_pad_ver(row, 6, 0);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    lv_obj_t *left = lv_obj_create(row);
    lv_obj_remove_style_all(left);
    lv_obj_set_size(left, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(left, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(left, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(left, 6, 0);

    lv_obj_t *dot = lv_obj_create(left);
    lv_obj_set_size(dot, 6, 6);
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(dot, 0, 0);
    lv_color_t dot_color = !court_is_active(c) ? kiosk_theme_color_text_muted()
                          : (phase == COURT_PHASE_PREPARING ? kiosk_theme_color_warning() : kiosk_theme_color_success());
    lv_obj_set_style_bg_color(dot, dot_color, 0);
    lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0);

    set_label(left, c->name, &lv_font_montserrat_14, kiosk_theme_color_text());

    if (court_is_active(c)) {
      char time_buf[8];
      kiosk_format_time(time_buf, sizeof(time_buf), elapsed);
      set_label(row, time_buf, &lv_font_montserrat_14, kiosk_theme_color_text_muted());
    }
  }

  return panel;
}
