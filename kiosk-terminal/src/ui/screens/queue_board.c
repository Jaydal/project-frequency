#include "queue_board.h"
#include "../theme/kiosk_theme.h"
#include "../assets/branding.h"
#include "../widgets/court_status_card.h"
#include "../widgets/queue_list.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "../../net/nfc_reader.h"

lv_obj_t *queue_board_create(lv_obj_t *parent, const kiosk_board_t *board,
                              queue_board_scan_cb_t on_scan, void *user_data) {
  lv_obj_t *root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_add_style(root, &kiosk_style_screen_bg, 0);
  kiosk_theme_disable_transitions(root);
  lv_obj_set_size(root, lv_pct(100), lv_pct(100));
  lv_obj_set_style_pad_all(root, 16, 0);
  /* Keep the screen as a fixed coordinate space.  Making the root a flex
   * column causes the top controls to consume/recalculate height whenever a
   * live label changes, which is visible as a full-screen flicker. */

  /* Top-right status: NFC only. Theme and relay controls are intentionally
   * not exposed on the kiosk screen. */
  lv_obj_t *top_right = lv_obj_create(root);
  lv_obj_remove_style_all(top_right);
  lv_obj_set_size(top_right, 32, 32);
  lv_obj_set_flex_flow(top_right, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(top_right, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(top_right, 16, 0);
  lv_obj_align(top_right, LV_ALIGN_TOP_RIGHT, 0, 0);

  lv_obj_t *nfc_status = lv_obj_create(top_right);
  lv_obj_remove_style_all(nfc_status);
  lv_obj_set_size(nfc_status, 12, 12);
  lv_obj_set_style_bg_color(nfc_status,
                            nfc_reader_is_online() ? kiosk_theme_color_success()
                                                   : kiosk_theme_color_danger(), 0);
  lv_obj_set_style_bg_opa(nfc_status, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(nfc_status, LV_RADIUS_CIRCLE, 0);
  lv_obj_clear_flag(nfc_status, LV_OBJ_FLAG_CLICKABLE | LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *brand = lv_label_create(root);
  lv_label_set_text(brand, "Courts");
  lv_obj_set_style_text_font(brand, &lv_font_montserrat_16, 0);
  lv_obj_set_style_text_color(brand, kiosk_theme_color_text_muted(), 0);
  lv_obj_set_size(brand, 240, 22);
  lv_obj_align(brand, LV_ALIGN_TOP_LEFT, 0, 0);

  lv_obj_t *brand_subtitle = lv_label_create(root);
  lv_label_set_text(brand_subtitle, "Tap your RFID card to book as a member");
  lv_obj_set_style_text_font(brand_subtitle, &lv_font_montserrat_12, 0);
  lv_obj_set_style_text_color(brand_subtitle, kiosk_theme_color_text_muted(), 0);
  lv_obj_set_size(brand_subtitle, 360, 18);
  lv_obj_align(brand_subtitle, LV_ALIGN_TOP_LEFT, 0, 22);

  /* Bottom brand overlay: takes no layout space so court/queue columns can
   * grow over it when bookings become active. */
  lv_obj_t *logo = lv_img_create(root);
  lv_img_set_src(logo, &img_logo_hero);
  lv_obj_align(logo, LV_ALIGN_BOTTOM_MID, 0, -8);
  lv_obj_add_flag(logo, LV_OBJ_FLAG_IGNORE_LAYOUT);
  lv_obj_clear_flag(logo, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_move_background(logo);

  /* Court + Queue columns fill remaining space */
  lv_obj_t *columns = lv_obj_create(root);
  lv_obj_remove_style_all(columns);
  kiosk_theme_disable_transitions(columns);
  lv_obj_set_width(columns, lv_pct(100));
  lv_obj_set_height(columns, 520);
  lv_obj_set_pos(columns, 0, 48);
  lv_obj_set_flex_flow(columns, LV_FLEX_FLOW_ROW);
  lv_obj_set_style_pad_column(columns, 16, 0);

  lv_obj_t *left = lv_obj_create(columns);
  lv_obj_remove_style_all(left);
  kiosk_theme_disable_transitions(left);
  lv_obj_set_width(left, lv_pct(56));
  lv_obj_set_height(left, 520);
  /* Keep the courts in the familiar single vertical stack. Each card has a
   * compact fixed footprint so up to three courts fit without scrolling. */
  lv_obj_set_flex_flow(left, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(left, 6, 0);
  lv_obj_clear_flag(left, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ELASTIC | LV_OBJ_FLAG_SCROLL_MOMENTUM | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_set_scrollbar_mode(left, LV_SCROLLBAR_MODE_OFF);

  lv_obj_t *courts_title = lv_label_create(left);
  lv_label_set_text(courts_title, "Courts");
  lv_obj_set_style_text_font(courts_title, &lv_font_montserrat_16, 0);
  lv_obj_set_style_text_color(courts_title, kiosk_theme_color_text_muted(), 0);
  lv_obj_set_width(courts_title, lv_pct(100));
  lv_obj_set_height(courts_title, 22);

  for (uint8_t i = 0; i < board->court_count; i++) {
    court_status_card_create(left, &board->courts[i], i);
  }

  lv_obj_t *right = lv_obj_create(columns);
  lv_obj_remove_style_all(right);
  kiosk_theme_disable_transitions(right);
  lv_obj_set_flex_grow(right, 1);
  lv_obj_set_height(right, 520);
  lv_obj_set_flex_flow(right, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(right, 12, 0);

  lv_obj_t *queue_panel = lv_obj_create(right);
  lv_obj_add_style(queue_panel, &kiosk_style_glass_bg, 0);
  kiosk_theme_disable_transitions(queue_panel);
  lv_obj_set_width(queue_panel, lv_pct(100));
  lv_obj_set_flex_grow(queue_panel, 1);
  lv_obj_set_flex_flow(queue_panel, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(queue_panel, 10, 0);
  lv_obj_clear_flag(queue_panel, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_scrollbar_mode(queue_panel, LV_SCROLLBAR_MODE_OFF);

  char queue_title[24];
  snprintf(queue_title, sizeof(queue_title), "QUEUE (%d)", board->queue_count);
   lv_obj_t *queue_title_label = lv_label_create(queue_panel);
   lv_label_set_text(queue_title_label, queue_title);
   lv_obj_set_style_text_font(queue_title_label, &lv_font_montserrat_14, 0);
   lv_obj_set_style_text_color(queue_title_label, kiosk_theme_color_text_muted(), 0);
   lv_obj_set_width(queue_title_label, lv_pct(100));
   lv_obj_set_height(queue_title_label, 20);
   lv_label_set_long_mode(queue_title_label, LV_LABEL_LONG_CLIP);

  queue_list_create(queue_panel, board->queue, board->queue_count);

  return root;
}
