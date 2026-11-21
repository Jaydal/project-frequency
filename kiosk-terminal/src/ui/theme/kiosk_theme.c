#include "kiosk_theme.h"
#include <stdio.h>

lv_style_t kiosk_style_card_available;
lv_style_t kiosk_style_card_preparing;
lv_style_t kiosk_style_card_in_game;
lv_style_t kiosk_style_screen_bg;
lv_style_t kiosk_style_panel_bg;
lv_style_t kiosk_style_glass_bg;
lv_style_t kiosk_style_btn_primary;
lv_style_t kiosk_style_btn_secondary;
lv_style_t kiosk_style_tile;

static bool current_is_dark = true;

static void apply_theme_colors(void) {
  lv_color_t bg_color = current_is_dark ? KIOSK_COLOR_BLACK : KIOSK_COLOR_ZINC_100;
  lv_color_t panel_color = current_is_dark ? KIOSK_COLOR_ZINC_900 : KIOSK_COLOR_WHITE;
  lv_color_t text_color = current_is_dark ? KIOSK_COLOR_ZINC_300 : KIOSK_COLOR_ZINC_800;
  lv_color_t text_color_strong = current_is_dark ? KIOSK_COLOR_WHITE : KIOSK_COLOR_BLACK;
  lv_color_t border_color = current_is_dark ? KIOSK_COLOR_ZINC_700 : KIOSK_COLOR_ZINC_300;
  
  lv_color_t btn_sec_bg = current_is_dark ? KIOSK_COLOR_ZINC_800 : KIOSK_COLOR_ZINC_200;
  
  /* Primary color is now Blue 500 */
  lv_color_t primary_color = KIOSK_COLOR_BLUE_500;
  lv_color_t primary_text = KIOSK_COLOR_WHITE;

  /* Card left-border accents */
  lv_style_set_bg_color(&kiosk_style_card_available, panel_color);
  lv_style_set_border_color(&kiosk_style_card_available, current_is_dark ? KIOSK_COLOR_ZINC_600 : KIOSK_COLOR_ZINC_400);

  lv_style_set_bg_color(&kiosk_style_card_preparing, panel_color);
  lv_style_set_border_color(&kiosk_style_card_preparing, KIOSK_COLOR_AMBER_400);

  lv_style_set_bg_color(&kiosk_style_card_in_game, panel_color);
  lv_style_set_border_color(&kiosk_style_card_in_game, KIOSK_COLOR_EMERALD_400);

  /* Global Screen Background */
  lv_style_set_bg_color(&kiosk_style_screen_bg, bg_color);
  lv_style_set_text_color(&kiosk_style_screen_bg, text_color_strong);

  /* Panel */
  lv_style_set_bg_color(&kiosk_style_panel_bg, panel_color);
  lv_style_set_text_color(&kiosk_style_panel_bg, text_color);

  /* Frosted glass panel: same surface as a panel, but see-through so the
   * bottom brand logo stays visible behind the queue column. */
  lv_style_set_bg_color(&kiosk_style_glass_bg, panel_color);
  lv_style_set_text_color(&kiosk_style_glass_bg, text_color);
  lv_style_set_border_color(&kiosk_style_glass_bg, border_color);

  /* Primary Button (Blue) */
  lv_style_set_bg_color(&kiosk_style_btn_primary, primary_color);
  lv_style_set_text_color(&kiosk_style_btn_primary, primary_text);

  /* Secondary Button */
  lv_style_set_bg_color(&kiosk_style_btn_secondary, btn_sec_bg);
  lv_style_set_text_color(&kiosk_style_btn_secondary, text_color);

  /* Tile */
  lv_style_set_bg_color(&kiosk_style_tile, panel_color);
  lv_style_set_border_color(&kiosk_style_tile, border_color);
  lv_style_set_text_color(&kiosk_style_tile, text_color);
  
  /* Tell LVGL to redraw everything using the modified styles */
  lv_obj_report_style_change(NULL);
}

static void init_card_style(lv_style_t *style, lv_color_t border_color) {
  lv_style_init(style);
  lv_style_set_bg_opa(style, LV_OPA_COVER);
  lv_style_set_border_side(style, LV_BORDER_SIDE_LEFT);
  lv_style_set_border_width(style, 4);
  lv_style_set_radius(style, 8);
  lv_style_set_pad_all(style, 12);
}

void kiosk_theme_init(void) {
  init_card_style(&kiosk_style_card_available, KIOSK_COLOR_ZINC_600);
  init_card_style(&kiosk_style_card_preparing, KIOSK_COLOR_AMBER_400);
  init_card_style(&kiosk_style_card_in_game, KIOSK_COLOR_EMERALD_400);

  lv_style_init(&kiosk_style_screen_bg);
  lv_style_set_bg_opa(&kiosk_style_screen_bg, LV_OPA_COVER);
  lv_style_set_border_width(&kiosk_style_screen_bg, 0);
  lv_style_set_radius(&kiosk_style_screen_bg, 0);
  lv_style_set_pad_all(&kiosk_style_screen_bg, 0);

  lv_style_init(&kiosk_style_panel_bg);
  lv_style_set_bg_opa(&kiosk_style_panel_bg, LV_OPA_COVER);
  lv_style_set_radius(&kiosk_style_panel_bg, 8);
  lv_style_set_pad_all(&kiosk_style_panel_bg, 12);
  lv_style_set_border_width(&kiosk_style_panel_bg, 0);

  lv_style_init(&kiosk_style_glass_bg);
  lv_style_set_bg_opa(&kiosk_style_glass_bg, KIOSK_GLASS_PANEL_OPA);
  lv_style_set_border_width(&kiosk_style_glass_bg, 1);
  lv_style_set_border_opa(&kiosk_style_glass_bg, LV_OPA_40);
  lv_style_set_radius(&kiosk_style_glass_bg, 8);
  lv_style_set_pad_all(&kiosk_style_glass_bg, 12);

  lv_style_init(&kiosk_style_btn_primary);
  lv_style_set_bg_opa(&kiosk_style_btn_primary, LV_OPA_COVER);
  lv_style_set_radius(&kiosk_style_btn_primary, 8);
  lv_style_set_min_height(&kiosk_style_btn_primary, KIOSK_PRIMARY_TOUCH_PX);

  lv_style_init(&kiosk_style_btn_secondary);
  lv_style_set_bg_opa(&kiosk_style_btn_secondary, LV_OPA_COVER);
  lv_style_set_radius(&kiosk_style_btn_secondary, 8);
  lv_style_set_min_height(&kiosk_style_btn_secondary, KIOSK_MIN_TOUCH_PX);

  lv_style_init(&kiosk_style_tile);
  lv_style_set_bg_opa(&kiosk_style_tile, LV_OPA_COVER);
  lv_style_set_border_width(&kiosk_style_tile, 1);
  lv_style_set_radius(&kiosk_style_tile, 8);
  lv_style_set_pad_all(&kiosk_style_tile, 12);
  lv_style_set_min_height(&kiosk_style_tile, KIOSK_MIN_TOUCH_PX);
  
  /* Disable all animations on our global styles to prevent tearing */
  static lv_style_transition_dsc_t global_no_trans;
  static const lv_style_prop_t global_no_props[] = {0};
  lv_style_transition_dsc_init(&global_no_trans, global_no_props, lv_anim_path_linear, 0, 0, NULL);
  
  lv_style_set_transition(&kiosk_style_btn_primary, &global_no_trans);
  lv_style_set_anim_time(&kiosk_style_btn_primary, 0);
  lv_style_set_border_width(&kiosk_style_btn_primary, 0);
  
  lv_style_set_transition(&kiosk_style_btn_secondary, &global_no_trans);
  lv_style_set_anim_time(&kiosk_style_btn_secondary, 0);
  lv_style_set_border_width(&kiosk_style_btn_secondary, 0);

  lv_style_set_transition(&kiosk_style_tile, &global_no_trans);
  lv_style_set_anim_time(&kiosk_style_tile, 0);

  lv_style_t *styles[] = { &kiosk_style_btn_primary, &kiosk_style_btn_secondary, &kiosk_style_tile };
  for (int i = 0; i < 3; i++) {
    lv_style_set_transform_width(styles[i], 0);
    lv_style_set_transform_height(styles[i], 0);
    lv_style_set_transform_zoom(styles[i], 256);
    lv_style_set_translate_y(styles[i], 0);
    lv_style_set_translate_x(styles[i], 0);
    lv_style_set_shadow_width(styles[i], 0);
    lv_style_set_outline_width(styles[i], 0);
  }
  
  apply_theme_colors();
}

void kiosk_theme_set_mode(bool is_dark) {
  current_is_dark = is_dark;
  apply_theme_colors();
}

bool kiosk_theme_is_dark(void) {
  return current_is_dark;
}

lv_color_t kiosk_theme_color_bg(void) { return current_is_dark ? KIOSK_COLOR_BLACK : KIOSK_COLOR_ZINC_100; }
lv_color_t kiosk_theme_color_panel(void) { return current_is_dark ? KIOSK_COLOR_ZINC_900 : KIOSK_COLOR_WHITE; }
lv_color_t kiosk_theme_color_text(void) { return current_is_dark ? KIOSK_COLOR_ZINC_300 : KIOSK_COLOR_ZINC_800; }
lv_color_t kiosk_theme_color_text_muted(void) { return current_is_dark ? KIOSK_COLOR_ZINC_500 : KIOSK_COLOR_ZINC_400; }
lv_color_t kiosk_theme_color_text_strong(void) { return current_is_dark ? KIOSK_COLOR_WHITE : KIOSK_COLOR_BLACK; }
lv_color_t kiosk_theme_color_border(void) { return current_is_dark ? KIOSK_COLOR_ZINC_700 : KIOSK_COLOR_ZINC_300; }
lv_color_t kiosk_theme_color_primary(void) { return KIOSK_COLOR_BLUE_500; }
lv_color_t kiosk_theme_color_success(void) { return KIOSK_COLOR_EMERALD_400; }
lv_color_t kiosk_theme_color_warning(void) { return KIOSK_COLOR_AMBER_400; }
lv_color_t kiosk_theme_color_danger(void) { return KIOSK_COLOR_RED_400; }

void kiosk_format_time(char *buf, size_t buf_size, int32_t seconds) {
  if (seconds < 0) seconds = 0;
  int32_t m = seconds / 60;
  int32_t s = seconds % 60;
  snprintf(buf, buf_size, "%02d:%02d", (int)m, (int)s);
}

void kiosk_theme_style_keyboard(lv_obj_t *kb) {
  /* Remove inherited state styles before the caller sets coordinates.
   * A single style per part keeps press/focus out of layout. */
  lv_obj_remove_style_all(kb);
  lv_obj_clear_flag(kb, LV_OBJ_FLAG_CLICK_FOCUSABLE | LV_OBJ_FLAG_SCROLL_CHAIN);
  lv_obj_set_style_bg_opa(kb, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_bg_color(kb, kiosk_theme_color_bg(), LV_PART_MAIN);
  lv_obj_set_style_pad_all(kb, 4, LV_PART_MAIN);
  lv_obj_set_style_pad_row(kb, 4, LV_PART_MAIN);
  lv_obj_set_style_pad_column(kb, 4, LV_PART_MAIN);

  lv_obj_set_style_bg_opa(kb, LV_OPA_COVER, LV_PART_ITEMS);
  lv_obj_set_style_bg_color(kb, kiosk_theme_color_bg(), LV_PART_ITEMS);
  lv_obj_set_style_text_color(kb, kiosk_theme_color_text_strong(), LV_PART_ITEMS);
  lv_obj_set_style_border_color(kb, kiosk_theme_color_border(), LV_PART_ITEMS);
  lv_obj_set_style_border_width(kb, 1, LV_PART_ITEMS);
  lv_obj_set_style_radius(kb, 4, LV_PART_ITEMS);

  /* Commit the final key on release, including mode keys, OK and Cancel.
   * All three maps have the same button count, so LVGL 8 keeps these flags. */
  lv_btnmatrix_set_btn_ctrl_all(kb, LV_BTNMATRIX_CTRL_CLICK_TRIG | LV_BTNMATRIX_CTRL_NO_REPEAT);
}

void kiosk_theme_style_modal_ta(lv_obj_t *ta) {
  /* Disable blinking cursor animation to prevent screen tearing. The focused
   * selector must be overridden too: lv_keyboard_set_textarea() focuses this
   * textarea after the base cursor style is configured. */
  lv_obj_set_style_anim_time(ta, 0, LV_PART_CURSOR);
  lv_obj_set_style_anim_time(ta, 0, LV_PART_CURSOR | LV_STATE_FOCUSED);
  
  /* HIDE the cursor entirely! Drawing and erasing the cursor block on every keystroke causes tearing 
     in single-buffer direct mode. Focus is already indicated by the blue border on the text area. */
  lv_obj_set_style_bg_opa(ta, LV_OPA_TRANSP, LV_PART_CURSOR);
  lv_obj_set_style_border_width(ta, 0, LV_PART_CURSOR);
  lv_obj_set_style_bg_opa(ta, LV_OPA_TRANSP, LV_PART_CURSOR | LV_STATE_FOCUSED);
  lv_obj_set_style_border_width(ta, 0, LV_PART_CURSOR | LV_STATE_FOCUSED);
  
  /* Normal state */
  lv_obj_set_style_bg_opa(ta, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_color(ta, kiosk_theme_color_bg(), 0);
  lv_obj_set_style_text_color(ta, kiosk_theme_color_text_strong(), 0);
  lv_obj_set_style_border_color(ta, kiosk_theme_color_border(), 0);
  lv_obj_set_style_border_width(ta, 2, 0); /* Make default 2px so it matches focused state */
  lv_obj_set_style_radius(ta, 0, 0);
  lv_obj_set_style_shadow_width(ta, 0, 0);
  lv_obj_set_style_outline_width(ta, 0, 0);
  
  /* Focused state */
  lv_obj_set_style_border_color(ta, kiosk_theme_color_primary(), LV_STATE_FOCUSED);
  lv_obj_set_style_border_width(ta, 2, LV_STATE_FOCUSED);
}

/* A drag moves only overflowing content and stops at finger release. */
void kiosk_theme_vertical_list(lv_obj_t *list) {
  lv_obj_add_flag(list, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_scroll_dir(list, LV_DIR_VER);
  lv_obj_clear_flag(list, LV_OBJ_FLAG_SCROLL_ELASTIC | LV_OBJ_FLAG_SCROLL_MOMENTUM |
                          LV_OBJ_FLAG_SCROLL_CHAIN | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_set_scrollbar_mode(list, LV_SCROLLBAR_MODE_AUTO);
}

void kiosk_theme_disable_transitions(lv_obj_t *obj) {
  /* The project and hardware sdkconfig set the default transition duration to
   * zero. Do not register per-object transition descriptors here: creating
   * those descriptors while constructing a booking page can block the LVGL
   * task long enough to trip the ESP32 task watchdog. */
  lv_obj_set_style_anim_time(obj, 0, 0);
  lv_obj_set_style_transform_width(obj, 0, LV_STATE_PRESSED);
  lv_obj_set_style_transform_height(obj, 0, LV_STATE_PRESSED);
  lv_obj_set_style_transform_zoom(obj, 256, LV_STATE_PRESSED);
  lv_obj_set_style_translate_y(obj, 0, LV_STATE_PRESSED);
  lv_obj_set_style_translate_x(obj, 0, LV_STATE_PRESSED);
  lv_obj_set_style_shadow_width(obj, 0, LV_STATE_PRESSED);
  lv_obj_set_style_outline_width(obj, 0, LV_STATE_PRESSED);

  lv_obj_set_style_anim_time(obj, 0, LV_PART_ITEMS);
  lv_obj_set_style_transform_width(obj, 0, LV_PART_ITEMS | LV_STATE_PRESSED);
  lv_obj_set_style_transform_height(obj, 0, LV_PART_ITEMS | LV_STATE_PRESSED);
  lv_obj_set_style_transform_zoom(obj, 256, LV_PART_ITEMS | LV_STATE_PRESSED);
  lv_obj_set_style_translate_y(obj, 0, LV_PART_ITEMS | LV_STATE_PRESSED);
  lv_obj_set_style_translate_x(obj, 0, LV_PART_ITEMS | LV_STATE_PRESSED);
  lv_obj_set_style_transform_width(obj, 0, LV_STATE_FOCUSED);
  lv_obj_set_style_transform_height(obj, 0, LV_STATE_FOCUSED);
  lv_obj_set_style_transform_zoom(obj, 256, LV_STATE_FOCUSED);
  lv_obj_set_style_translate_y(obj, 0, LV_STATE_FOCUSED);
  lv_obj_set_style_translate_x(obj, 0, LV_STATE_FOCUSED);
  lv_obj_set_style_transform_width(obj, 0, LV_PART_ITEMS | LV_STATE_FOCUSED);
  lv_obj_set_style_transform_height(obj, 0, LV_PART_ITEMS | LV_STATE_FOCUSED);
  lv_obj_set_style_transform_zoom(obj, 256, LV_PART_ITEMS | LV_STATE_FOCUSED);
  lv_obj_set_style_translate_y(obj, 0, LV_PART_ITEMS | LV_STATE_FOCUSED);
  lv_obj_set_style_translate_x(obj, 0, LV_PART_ITEMS | LV_STATE_FOCUSED);
  lv_obj_set_style_shadow_width(obj, 0, LV_PART_ITEMS | LV_STATE_PRESSED);
  lv_obj_set_style_outline_width(obj, 0, LV_PART_ITEMS | LV_STATE_PRESSED);

  /* Neutralize the default theme's state effects on ordinary interactive
   * widgets too. The keyboard has explicit item styling above, but switches,
   * buttons, text fields, and containers can still inherit a pressed/focused
   * transition or color filter from the default theme. */
  const lv_style_selector_t states[] = {
    LV_STATE_PRESSED,
    LV_STATE_FOCUSED,
    LV_STATE_CHECKED,
  };
  for (size_t i = 0; i < sizeof(states) / sizeof(states[0]); i++) {
    lv_style_selector_t selector = states[i];
    lv_obj_set_style_anim_time(obj, 0, selector);
    lv_obj_set_style_color_filter_opa(obj, LV_OPA_TRANSP, selector);
    lv_obj_set_style_transform_width(obj, 0, selector);
    lv_obj_set_style_transform_height(obj, 0, selector);
    lv_obj_set_style_transform_zoom(obj, 256, selector);
    lv_obj_set_style_translate_x(obj, 0, selector);
    lv_obj_set_style_translate_y(obj, 0, selector);
    lv_obj_set_style_shadow_width(obj, 0, selector);
    lv_obj_set_style_outline_width(obj, 0, selector);

    lv_obj_set_style_anim_time(obj, 0, LV_PART_KNOB | selector);
    lv_obj_set_style_color_filter_opa(obj, LV_OPA_TRANSP, LV_PART_KNOB | selector);
    lv_obj_set_style_transform_width(obj, 0, LV_PART_KNOB | selector);
    lv_obj_set_style_transform_height(obj, 0, LV_PART_KNOB | selector);
    lv_obj_set_style_transform_zoom(obj, 256, LV_PART_KNOB | selector);
    lv_obj_set_style_translate_x(obj, 0, LV_PART_KNOB | selector);
    lv_obj_set_style_translate_y(obj, 0, LV_PART_KNOB | selector);

    lv_obj_set_style_anim_time(obj, 0, LV_PART_INDICATOR | selector);
    lv_obj_set_style_color_filter_opa(obj, LV_OPA_TRANSP, LV_PART_INDICATOR | selector);
  }
}

void kiosk_theme_pin_pressed(lv_obj_t *obj) {
  /* Pin the PRESSED state to be pixel-identical to the normal state.
   * In single-buffer direct mode the panel scans the one live framebuffer
   * that LVGL also redraws in place. If pressing a button changes any pixel,
   * that region is redrawn mid-scan and tears. Making the pressed state
   * visually identical means the press redraw writes the same pixels, so
   * there is nothing visible to tear. */
  lv_color_t bg = lv_obj_get_style_bg_color(obj, 0);
  lv_color_t text = lv_obj_get_style_text_color(obj, 0);
  lv_opa_t bg_opa = lv_obj_get_style_bg_opa(obj, 0);
  lv_border_side_t border_side = lv_obj_get_style_border_side(obj, 0);
  lv_coord_t border_width = lv_obj_get_style_border_width(obj, 0);
  lv_opa_t border_opa = lv_obj_get_style_border_opa(obj, 0);
  lv_obj_set_style_bg_color(obj, bg, LV_STATE_PRESSED);
  lv_obj_set_style_bg_opa(obj, bg_opa, LV_STATE_PRESSED);
  lv_obj_set_style_text_color(obj, text, LV_STATE_PRESSED);
  lv_obj_set_style_border_side(obj, border_side, LV_STATE_PRESSED);
  lv_obj_set_style_border_width(obj, border_width, LV_STATE_PRESSED);
  lv_obj_set_style_border_opa(obj, border_opa, LV_STATE_PRESSED);
  lv_obj_set_style_border_color(obj, lv_obj_get_style_border_color(obj, 0), LV_STATE_PRESSED);
  lv_obj_set_style_color_filter_opa(obj, LV_OPA_TRANSP, LV_STATE_PRESSED);
  lv_obj_set_style_anim_time(obj, 0, LV_STATE_PRESSED);
  /* LVGL's default button theme darkens pressed buttons with a color filter.
   * Disable it so touch changes no pixels or apparent component size. */
  lv_obj_set_style_color_filter_opa(obj, LV_OPA_TRANSP, LV_STATE_PRESSED);
  lv_obj_set_style_transform_width(obj, 0, LV_STATE_PRESSED);
  lv_obj_set_style_transform_height(obj, 0, LV_STATE_PRESSED);
  lv_obj_set_style_transform_zoom(obj, 256, LV_STATE_PRESSED);
  lv_obj_set_style_translate_x(obj, 0, LV_STATE_PRESSED);
  lv_obj_set_style_translate_y(obj, 0, LV_STATE_PRESSED);
  lv_obj_set_style_shadow_width(obj, 0, LV_STATE_PRESSED);
  lv_obj_set_style_outline_width(obj, 0, LV_STATE_PRESSED);
}
