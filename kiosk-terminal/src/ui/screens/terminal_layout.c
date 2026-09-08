#include "terminal_layout.h"
#include "../theme/kiosk_theme.h"
#include <stdlib.h>

terminal_layout_t terminal_layout_create(lv_obj_t *parent) {
  terminal_layout_t layout = { 0 };

  /* 1. Full-screen page root (1024x600) with solid opaque background */
  layout.root = lv_obj_create(parent);
  lv_obj_remove_style_all(layout.root);
  lv_obj_set_size(layout.root, lv_pct(100), lv_pct(100));
  lv_obj_set_style_bg_color(layout.root, kiosk_theme_color_bg(), 0);
  lv_obj_set_style_bg_opa(layout.root, LV_OPA_COVER, 0);
  lv_obj_set_style_pad_all(layout.root, 0, 0);
  lv_obj_set_flex_flow(layout.root, LV_FLEX_FLOW_ROW);
  lv_obj_clear_flag(layout.root, LV_OBJ_FLAG_SCROLLABLE);

  /* 2. Main content area - takes remaining width, 100% height, solid opaque background */
  layout.content = lv_obj_create(layout.root);
  lv_obj_remove_style_all(layout.content);
  lv_obj_set_height(layout.content, lv_pct(100));
  lv_obj_set_flex_grow(layout.content, 1);
  lv_obj_set_style_bg_color(layout.content, kiosk_theme_color_bg(), 0);
  lv_obj_set_style_bg_opa(layout.content, LV_OPA_COVER, 0);
  lv_obj_set_style_pad_hor(layout.content, 20, 0);
  lv_obj_set_style_pad_ver(layout.content, 14, 0);
  lv_obj_clear_flag(layout.content, LV_OBJ_FLAG_SCROLLABLE);

  /* 3. Vertical divider */
  layout.divider = lv_obj_create(layout.root);
  lv_obj_remove_style_all(layout.divider);
  lv_obj_set_size(layout.divider, 1, lv_pct(100));
  lv_obj_set_style_bg_color(layout.divider, kiosk_theme_color_border(), 0);
  lv_obj_set_style_bg_opa(layout.divider, LV_OPA_COVER, 0);

  /* 4. Right sidebar for court overview - 270px width, 100% height, solid panel background */
  layout.sidebar = lv_obj_create(layout.root);
  lv_obj_remove_style_all(layout.sidebar);
  lv_obj_set_size(layout.sidebar, 270, lv_pct(100));
  lv_obj_set_style_bg_color(layout.sidebar, kiosk_theme_color_panel(), 0);
  lv_obj_set_style_bg_opa(layout.sidebar, LV_OPA_COVER, 0);
  lv_obj_set_style_pad_all(layout.sidebar, 12, 0);
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

