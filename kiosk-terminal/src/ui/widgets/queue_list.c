#include "queue_list.h"
#include "../theme/kiosk_theme.h"
#include <stdio.h>

static void set_label(lv_obj_t *parent, const char *text, const lv_font_t *font, lv_color_t color) {
  lv_obj_t *label = lv_label_create(parent);
  lv_label_set_text(label, text);
  lv_obj_set_style_text_font(label, font, 0);
  lv_obj_set_style_text_color(label, color, 0);
}

lv_obj_t *queue_list_create(lv_obj_t *parent, const queue_row_t *rows, uint8_t count) {
  lv_obj_t *list = lv_obj_create(parent);
  lv_obj_remove_style_all(list);
  lv_obj_set_width(list, lv_pct(100));
  lv_obj_set_height(list, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(list, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(list, 8, 0);

  if (count == 0) {
    set_label(list, "No one waiting", &lv_font_montserrat_14, kiosk_theme_color_text_muted());
    return list;
  }

  for (uint8_t i = 0; i < count; i++) {
    const queue_row_t *q = &rows[i];
    lv_obj_t *row = lv_obj_create(list);
    lv_obj_set_width(row, lv_pct(100));
    /* Fixed row geometry prevents long names/titles from reflowing the queue
     * panel when an MQTT snapshot replaces the data. */
    lv_obj_set_height(row, 76);
    lv_obj_set_style_bg_color(row, kiosk_theme_color_panel(), 0);
    lv_obj_set_style_bg_opa(row, KIOSK_GLASS_ROW_OPA, 0);
    lv_obj_set_style_border_width(row, 0, 0);
    lv_obj_set_style_radius(row, 6, 0);
    lv_obj_set_style_pad_all(row, 12, 0);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(row, 12, 0);

    lv_obj_t *badge = lv_obj_create(row);
    lv_obj_set_size(badge, 28, 28);
    lv_obj_set_style_radius(badge, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(badge, 0, 0);
    lv_obj_set_style_bg_color(badge, q->position == 1 ? kiosk_theme_color_primary() : kiosk_theme_color_bg(), 0);
    lv_obj_set_style_bg_opa(badge, LV_OPA_COVER, 0);
    lv_obj_set_flex_align(badge, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    char pos_buf[4];
    snprintf(pos_buf, sizeof(pos_buf), "%d", (int)q->position);
    set_label(badge, pos_buf, &lv_font_montserrat_14,
              q->position == 1 ? kiosk_theme_color_text_strong() : kiosk_theme_color_text());

    char name_buf[64];
    snprintf(name_buf, sizeof(name_buf), "%s %s", q->first_name, q->last_name);

    /* Name + optional match title stacked vertically */
    lv_obj_t *name_col = lv_obj_create(row);
    lv_obj_remove_style_all(name_col);
    lv_obj_set_height(name_col, LV_SIZE_CONTENT);
    lv_obj_set_width(name_col, 0);
    lv_obj_set_flex_grow(name_col, 1);
    lv_obj_set_flex_flow(name_col, LV_FLEX_FLOW_COLUMN);
    lv_obj_clear_flag(name_col, LV_OBJ_FLAG_SCROLLABLE);
    set_label(name_col, name_buf, &lv_font_montserrat_16, kiosk_theme_color_text_strong());
    lv_obj_t *name_label = lv_obj_get_child(name_col, 0);
    lv_obj_set_width(name_label, lv_pct(100));
    lv_obj_set_height(name_label, 22);
    lv_label_set_long_mode(name_label, LV_LABEL_LONG_DOT);
    if (q->match_title[0] != '\0') {
      lv_obj_t *mt = lv_label_create(name_col);
      lv_label_set_text(mt, q->match_title);
      lv_obj_set_style_text_font(mt, &lv_font_montserrat_14, 0);
      lv_obj_set_style_text_color(mt, kiosk_theme_color_text_muted(), 0);
      lv_label_set_long_mode(mt, LV_LABEL_LONG_DOT);
      lv_obj_set_width(mt, lv_pct(100));
    }

    lv_obj_t *meta_col = lv_obj_create(row);
    lv_obj_remove_style_all(meta_col);
    lv_obj_set_width(meta_col, 122);
    lv_obj_set_height(meta_col, 68);
    lv_obj_set_flex_flow(meta_col, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(meta_col, 2, 0);

    lv_obj_t *type_badge = lv_obj_create(meta_col);
    lv_obj_remove_style_all(type_badge);
    lv_obj_set_size(type_badge, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_style_bg_color(type_badge, kiosk_theme_color_bg(), 0);
    lv_obj_set_style_bg_opa(type_badge, LV_OPA_COVER, 0);
    lv_obj_set_style_radius(type_badge, 4, 0);
    lv_obj_set_style_pad_hor(type_badge, 6, 0);
    lv_obj_set_style_pad_ver(type_badge, 2, 0);
    set_label(type_badge, q->match_type, &lv_font_montserrat_14, kiosk_theme_color_text());

    char court_buf[40];
    snprintf(court_buf, sizeof(court_buf), "%s · %dm", q->court_name[0] ? q->court_name : "Any", (int)q->duration_min);
    set_label(meta_col, court_buf, &lv_font_montserrat_14, kiosk_theme_color_text_muted());

    char wait_buf[32];
    snprintf(wait_buf, sizeof(wait_buf), "Wait: %s", q->estimated_wait);
    set_label(meta_col, wait_buf, &lv_font_montserrat_14, kiosk_theme_color_text_muted());

    char actual_time_buf[32];
    struct tm *timeinfo = localtime(&q->estimated_start_time);
    strftime(actual_time_buf, sizeof(actual_time_buf), "ETA: %I:%M %p", timeinfo);
    set_label(meta_col, actual_time_buf, &lv_font_montserrat_14, kiosk_theme_color_text_muted());
  }

  return list;
}
