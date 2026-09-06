#include "terminal_layout.h"
#include "../theme/kiosk_theme.h"
#include "../assets/branding.h"
#include <stdlib.h>

terminal_layout_t terminal_layout_create(lv_obj_t *parent) {
  terminal_layout_t layout = { 0 };

  layout.root = lv_obj_create(parent);
  lv_obj_remove_style_all(layout.root);
  lv_obj_add_style(layout.root, &kiosk_style_screen_bg, 0);
  lv_obj_set_size(layout.root, lv_pct(100), lv_pct(100));
  lv_obj_set_flex_flow(layout.root, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(layout.root, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

  lv_obj_t *card = lv_obj_create(layout.root);
  lv_obj_set_style_bg_color(card, kiosk_theme_color_bg(), 0);
  lv_obj_set_style_bg_opa(card, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(card, kiosk_theme_color_border(), 0);
  lv_obj_set_style_border_width(card, 1, 0);
  lv_obj_set_style_radius(card, 16, 0);
  lv_obj_set_style_pad_all(card, 0, 0);
  lv_obj_set_size(card, 820, 492);
  lv_obj_set_flex_flow(card, LV_FLEX_FLOW_ROW);
  lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);

  /* Large centered watermark behind content */
  lv_obj_t *watermark = lv_img_create(card);
  lv_img_set_src(watermark, &img_logo_watermark);
  lv_obj_set_style_opa(watermark, KIOSK_WATERMARK_OPA, 0);
  lv_obj_align(watermark, LV_ALIGN_CENTER, 0, 0);
  lv_obj_clear_flag(watermark, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_flag(watermark, LV_OBJ_FLAG_IGNORE_LAYOUT);
  lv_obj_move_background(watermark);

  layout.content = lv_obj_create(card);
  lv_obj_remove_style_all(layout.content);
  lv_obj_set_style_bg_color(layout.content, kiosk_theme_color_bg(), 0);
  lv_obj_set_style_bg_opa(layout.content, KIOSK_GLASS_FORM_OPA, 0);
  lv_obj_set_height(layout.content, lv_pct(100));
  lv_obj_set_flex_grow(layout.content, 1);
  lv_obj_clear_flag(layout.content, LV_OBJ_FLAG_SCROLLABLE);

  layout.divider = lv_obj_create(card);
  lv_obj_remove_style_all(layout.divider);
  lv_obj_set_size(layout.divider, 1, lv_pct(100));
  lv_obj_set_style_bg_color(layout.divider, kiosk_theme_color_border(), 0);
  lv_obj_set_style_bg_opa(layout.divider, LV_OPA_COVER, 0);

  layout.sidebar = lv_obj_create(card);
  lv_obj_remove_style_all(layout.sidebar);
  lv_obj_set_style_bg_color(layout.sidebar, kiosk_theme_color_bg(), 0);
  lv_obj_set_style_bg_opa(layout.sidebar, KIOSK_GLASS_FORM_OPA, 0);
  lv_obj_set_size(layout.sidebar, 210, lv_pct(100));
  lv_obj_clear_flag(layout.sidebar, LV_OBJ_FLAG_SCROLLABLE);

  return layout;
}

void terminal_layout_set_sidebar(terminal_layout_t *layout, bool show_sidebar) {
  if (show_sidebar) {
    lv_obj_clear_flag(layout->divider, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(layout->sidebar, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(layout->divider, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(layout->sidebar, LV_OBJ_FLAG_HIDDEN);
  }
}
