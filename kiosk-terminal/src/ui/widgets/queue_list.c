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
  lv_obj_set_height(list, 0);
  lv_obj_set_flex_grow(list, 1);
  lv_obj_set_flex_flow(list, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(list, 8, 0);
  lv_obj_clear_flag(list, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ELASTIC | LV_OBJ_FLAG_SCROLL_MOMENTUM | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_set_scrollbar_mode(list, LV_SCROLLBAR_MODE_OFF);

  if (count == 0) {
    set_label(list, "No one waiting", &lv_font_montserrat_14, kiosk_theme_color_text_muted());
    return list;
  }

  /* Match the web queue board's scan-friendly column hierarchy while keeping
   * every header and row inside fixed rectangles. */
  lv_obj_t *list_header = lv_obj_create(list);
  lv_obj_remove_style_all(list_header);
  lv_obj_set_width(list_header, lv_pct(100));
  lv_obj_set_height(list_header, 18);
  lv_obj_set_layout(list_header, 0);

  lv_obj_t *player_header = lv_label_create(list_header);
  lv_label_set_text(player_header, "PLAYER / MATCH");
  lv_obj_set_style_text_font(player_header, &lv_font_montserrat_12, 0);
  lv_obj_set_style_text_color(player_header, kiosk_theme_color_text_muted(), 0);
  lv_obj_set_size(player_header, 150, 18);
  lv_obj_set_pos(player_header, 40, 0);

  lv_obj_t *court_header = lv_label_create(list_header);
  lv_label_set_text(court_header, "COURT / TIME");
  lv_obj_set_style_text_font(court_header, &lv_font_montserrat_12, 0);
  lv_obj_set_style_text_color(court_header, kiosk_theme_color_text_muted(), 0);
  lv_obj_set_size(court_header, 105, 18);
  lv_obj_set_pos(court_header, 190, 0);

  lv_obj_t *schedule_header = lv_label_create(list_header);
  lv_label_set_text(schedule_header, "SCHEDULE / WAIT");
  lv_obj_set_style_text_font(schedule_header, &lv_font_montserrat_12, 0);
  lv_obj_set_style_text_color(schedule_header, kiosk_theme_color_text_muted(), 0);
  lv_obj_set_size(schedule_header, 130, 18);
  lv_obj_set_pos(schedule_header, 300, 0);

  for (uint8_t i = 0; i < count; i++) {
    const queue_row_t *q = &rows[i];
    lv_obj_t *row = lv_obj_create(list);
    lv_obj_set_width(row, lv_pct(100));
    /* Fixed row geometry prevents long names/titles from reflowing the queue
     * panel when an MQTT snapshot replaces the data. */
    lv_obj_set_height(row, 84);
    lv_obj_set_style_bg_color(row, kiosk_theme_color_panel(), 0);
    lv_obj_set_style_bg_opa(row, KIOSK_GLASS_ROW_OPA, 0);
    lv_obj_set_style_border_width(row, 0, 0);
    lv_obj_set_style_radius(row, 6, 0);
    lv_obj_set_style_pad_ver(row, 6, 0);
    lv_obj_set_style_pad_hor(row, 12, 0);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(row, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_column(row, 10, 0);

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
    lv_obj_set_height(name_col, 44);
    lv_obj_set_width(name_col, 0);
    lv_obj_set_flex_grow(name_col, 1);
    lv_obj_set_layout(name_col, 0);
    lv_obj_clear_flag(name_col, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_t *name_label = lv_label_create(name_col);
    lv_label_set_text(name_label, name_buf);
    lv_obj_set_style_text_font(name_label, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(name_label, kiosk_theme_color_text_strong(), 0);
    lv_obj_set_width(name_label, lv_pct(100));
    lv_obj_set_height(name_label, 22);
    lv_obj_set_pos(name_label, 0, 0);
    lv_label_set_long_mode(name_label, LV_LABEL_LONG_DOT);
    /* Always reserve the title line, including when no title is present. */
    lv_obj_t *mt = lv_label_create(name_col);
    lv_label_set_text(mt, q->match_title[0] ? q->match_title : "");
    lv_obj_set_style_text_font(mt, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(mt, kiosk_theme_color_text_muted(), 0);
    lv_label_set_long_mode(mt, LV_LABEL_LONG_DOT);
    lv_obj_set_width(mt, lv_pct(100));
    lv_obj_set_height(mt, 18);
    lv_obj_set_pos(mt, 0, 22);

    lv_obj_t *meta_col = lv_obj_create(row);
    lv_obj_remove_style_all(meta_col);
    lv_obj_set_width(meta_col, 126);
    lv_obj_set_height(meta_col, 66);
    lv_obj_set_layout(meta_col, 0);
    lv_obj_clear_flag(meta_col, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *type_badge = lv_obj_create(meta_col);
    lv_obj_remove_style_all(type_badge);
    lv_obj_set_size(type_badge, 126, 18);
    lv_obj_set_pos(type_badge, 0, 0);
    lv_obj_set_style_bg_color(type_badge, kiosk_theme_color_bg(), 0);
    lv_obj_set_style_bg_opa(type_badge, LV_OPA_COVER, 0);
    lv_obj_set_style_radius(type_badge, 4, 0);
    lv_obj_set_style_pad_hor(type_badge, 6, 0);
    lv_obj_set_style_pad_ver(type_badge, 2, 0);
    lv_obj_t *type_label = lv_label_create(type_badge);
    lv_label_set_text(type_label, q->match_type);
    lv_obj_set_style_text_font(type_label, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(type_label, kiosk_theme_color_text(), 0);
    lv_obj_set_width(type_label, 114);
    lv_obj_set_height(type_label, 14);
    lv_label_set_long_mode(type_label, LV_LABEL_LONG_CLIP);
    lv_obj_align(type_label, LV_ALIGN_LEFT_MID, 6, 0);

    char court_buf[40];
    snprintf(court_buf, sizeof(court_buf), "%s · %dm", q->court_name[0] ? q->court_name : "Any", (int)q->duration_min);
    lv_obj_t *court_label = lv_label_create(meta_col);
    lv_label_set_text(court_label, court_buf);
    lv_obj_set_style_text_font(court_label, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(court_label, kiosk_theme_color_text_muted(), 0);
    lv_obj_set_width(court_label, 126);
    lv_obj_set_height(court_label, 14);
    lv_obj_set_pos(court_label, 0, 18);
    lv_label_set_long_mode(court_label, LV_LABEL_LONG_CLIP);

    char wait_buf[32];
    snprintf(wait_buf, sizeof(wait_buf), "Wait: %s", q->estimated_wait);
    lv_obj_t *wait_label = lv_label_create(meta_col);
    lv_label_set_text(wait_label, wait_buf);
    lv_obj_set_style_text_font(wait_label, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(wait_label, kiosk_theme_color_text_muted(), 0);
    lv_obj_set_width(wait_label, 126);
    lv_obj_set_height(wait_label, 14);
    lv_obj_set_pos(wait_label, 0, 34);
    lv_label_set_long_mode(wait_label, LV_LABEL_LONG_CLIP);

    char actual_time_buf[32];
    if (q->estimated_start_time > 0) {
      struct tm tm_info;
      localtime_r(&q->estimated_start_time, &tm_info);
      strftime(actual_time_buf, sizeof(actual_time_buf), "ETA: %I:%M %p", &tm_info);
    } else {
      snprintf(actual_time_buf, sizeof(actual_time_buf), "ETA: Soon");
    }
    lv_obj_t *eta_label = lv_label_create(meta_col);
    lv_label_set_text(eta_label, actual_time_buf);
    lv_obj_set_style_text_font(eta_label, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(eta_label, kiosk_theme_color_text_muted(), 0);
    lv_obj_set_width(eta_label, 126);
    lv_obj_set_height(eta_label, 14);
    lv_obj_set_pos(eta_label, 0, 50);
    lv_label_set_long_mode(eta_label, LV_LABEL_LONG_CLIP);
  }

  return list;
}
