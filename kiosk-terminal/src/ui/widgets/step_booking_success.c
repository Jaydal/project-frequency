#include "step_booking_success.h"
#include "../theme/kiosk_theme.h"
#include <stdio.h>

lv_obj_t *step_booking_success_create(lv_obj_t *parent, const booking_result_t *result) {
  lv_obj_t *root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_set_size(root, lv_pct(100), lv_pct(100));
  lv_obj_set_layout(root, 0);
  lv_obj_set_style_pad_all(root, 16, 0);

  lv_color_t accent = result->success ? KIOSK_COLOR_EMERALD_400 : KIOSK_COLOR_AMBER_400;

  lv_obj_t *icon = lv_label_create(root);
  lv_label_set_text(icon, LV_SYMBOL_OK);
  lv_obj_set_style_text_font(icon, &lv_font_montserrat_32, 0);
  lv_obj_set_style_text_color(icon, accent, 0);
  lv_obj_set_size(icon, 40, 40);
  lv_obj_align(icon, LV_ALIGN_TOP_MID, 0, 100);

  lv_obj_t *title = lv_label_create(root);
  lv_label_set_text(title, result->success ? "Booking Confirmed" : "In the Queue");
  lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
  lv_obj_set_style_text_color(title, KIOSK_COLOR_ZINC_100, 0);
  lv_obj_set_size(title, 700, 28);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 152);
  lv_obj_set_style_text_align(title, LV_TEXT_ALIGN_CENTER, 0);

  char sub_buf[64];
  if (result->success) {
    snprintf(sub_buf, sizeof(sub_buf), "%s . %d min", result->court_name, (int)result->duration_min);
  } else {
    snprintf(sub_buf, sizeof(sub_buf), "%d min requested", (int)result->duration_min);
  }
  lv_obj_t *sub = lv_label_create(root);
  lv_label_set_text(sub, sub_buf);
  lv_obj_set_style_text_font(sub, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(sub, KIOSK_COLOR_ZINC_400, 0);
  lv_obj_set_size(sub, 700, 20);
  lv_obj_align(sub, LV_ALIGN_TOP_MID, 0, 188);
  lv_obj_set_style_text_align(sub, LV_TEXT_ALIGN_CENTER, 0);

  lv_obj_t *panel = lv_obj_create(root);
  lv_obj_add_style(panel, &kiosk_style_panel_bg, 0);
  lv_obj_set_width(panel, lv_pct(70));
  lv_obj_set_size(panel, 560, 96);
  lv_obj_align(panel, LV_ALIGN_TOP_MID, 0, 224);
  lv_obj_set_layout(panel, 0);

  lv_obj_t *used_row = lv_obj_create(panel);
  lv_obj_remove_style_all(used_row);
  lv_obj_set_width(used_row, lv_pct(100));
  lv_obj_set_height(used_row, LV_SIZE_CONTENT);
   lv_obj_set_pos(used_row, 0, 8);
  lv_obj_set_flex_flow(used_row, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(used_row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_t *used_label = lv_label_create(used_row);
  lv_label_set_text(used_label, "Used");
  lv_obj_set_style_text_color(used_label, KIOSK_COLOR_ZINC_500, 0);
  char used_buf[16];
  snprintf(used_buf, sizeof(used_buf), "-P%d", (int)result->credits_used);
  lv_obj_t *used_value = lv_label_create(used_row);
  lv_label_set_text(used_value, used_buf);
  lv_obj_set_style_text_color(used_value, KIOSK_COLOR_RED_400, 0);

  lv_obj_t *rem_row = lv_obj_create(panel);
  lv_obj_remove_style_all(rem_row);
  lv_obj_set_width(rem_row, lv_pct(100));
  lv_obj_set_height(rem_row, LV_SIZE_CONTENT);
   lv_obj_set_pos(rem_row, 0, 48);
  lv_obj_set_flex_flow(rem_row, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(rem_row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_t *rem_label = lv_label_create(rem_row);
  lv_label_set_text(rem_label, "Remaining");
  lv_obj_set_style_text_color(rem_label, KIOSK_COLOR_ZINC_500, 0);
  char rem_buf[16];
  snprintf(rem_buf, sizeof(rem_buf), "P%d", (int)result->credits_remaining);
  lv_obj_t *rem_value = lv_label_create(rem_row);
  lv_label_set_text(rem_value, rem_buf);
  lv_obj_set_style_text_color(rem_value, KIOSK_COLOR_EMERALD_400, 0);

  lv_obj_t *footer = lv_label_create(root);
  lv_label_set_text(footer, "Returning to start screen...");
  lv_obj_set_style_text_font(footer, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(footer, KIOSK_COLOR_ZINC_600, 0);
  lv_obj_set_size(footer, 700, 20);
  lv_obj_align(footer, LV_ALIGN_TOP_MID, 0, 344);
  lv_obj_set_style_text_align(footer, LV_TEXT_ALIGN_CENTER, 0);

  return root;
}
