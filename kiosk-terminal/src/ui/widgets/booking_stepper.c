#include "booking_stepper.h"
#include "../theme/kiosk_theme.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *STEP_LABELS[] = {"Court", "Game Type", "Duration", "Confirm"};

typedef struct {
  void (*cb)(void *);
  void *user_data;
} cancel_closure_t;

void free_closure_cb(lv_event_t *e) {
  free(lv_event_get_user_data(e));
}

static void cancel_click_cb(lv_event_t *e) {
  cancel_closure_t *c = lv_event_get_user_data(e);
  if (c->cb) c->cb(c->user_data);
}

lv_obj_t *booking_stepper_create(lv_obj_t *parent, int current_step,
                                  const char *member_name, int32_t balance,
                                  void (*on_cancel)(void *), void *cancel_user_data) {
  lv_obj_t *root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_set_width(root, lv_pct(100));
  lv_obj_set_height(root, 76);
  lv_obj_set_layout(root, 0);
  lv_obj_set_style_pad_all(root, 0, 0);
  lv_obj_set_style_pad_bottom(root, 8, 0);
  lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_set_scrollbar_mode(root, LV_SCROLLBAR_MODE_OFF);

  /* Member info header card */
  lv_obj_t *header = lv_obj_create(root);
  lv_obj_remove_style_all(header);
  lv_obj_set_width(header, lv_pct(100));
  lv_obj_set_height(header, 42);
  lv_obj_set_pos(header, 0, 0);
  lv_obj_set_style_bg_color(header, kiosk_theme_color_panel(), 0);
  lv_obj_set_style_bg_opa(header, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(header, kiosk_theme_color_border(), 0);
  lv_obj_set_style_border_width(header, 1, 0);
  lv_obj_set_style_radius(header, 8, 0);
  lv_obj_set_style_pad_all(header, 6, 0);
  lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_clear_flag(header, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_set_scrollbar_mode(header, LV_SCROLLBAR_MODE_OFF);

  /* Left side: user icon + name + balance */
  lv_obj_t *info_col = lv_obj_create(header);
  lv_obj_remove_style_all(info_col);
  lv_obj_set_height(info_col, LV_SIZE_CONTENT);
  lv_obj_set_flex_grow(info_col, 1);
  lv_obj_set_flex_flow(info_col, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(info_col, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(info_col, 8, 0);
  lv_obj_clear_flag(info_col, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *avatar = lv_obj_create(info_col);
  lv_obj_remove_style_all(avatar);
  lv_obj_set_size(avatar, 28, 28);
  lv_obj_set_style_bg_color(avatar, kiosk_theme_color_primary(), 0);
  lv_obj_set_style_bg_opa(avatar, LV_OPA_10, 0);
  lv_obj_set_style_border_color(avatar, kiosk_theme_color_primary(), 0);
  lv_obj_set_style_border_width(avatar, 1, 0);
  lv_obj_set_style_border_opa(avatar, LV_OPA_20, 0);
  lv_obj_set_style_radius(avatar, 14, 0);
  lv_obj_t *avatar_label = lv_label_create(avatar);
  char initial[2] = { member_name && member_name[0] ? member_name[0] : '?', '\0' };
  lv_label_set_text(avatar_label, initial);
  lv_obj_set_style_text_font(avatar_label, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(avatar_label, kiosk_theme_color_primary(), 0);
  lv_obj_center(avatar_label);

  lv_obj_t *name_col = lv_obj_create(info_col);
  lv_obj_remove_style_all(name_col);
  lv_obj_set_height(name_col, LV_SIZE_CONTENT);
  lv_obj_set_flex_grow(name_col, 1);
  lv_obj_set_flex_flow(name_col, LV_FLEX_FLOW_COLUMN);
  lv_obj_clear_flag(name_col, LV_OBJ_FLAG_SCROLLABLE);

  if (member_name && member_name[0]) {
    lv_obj_t *name_label = lv_label_create(name_col);
    lv_label_set_text(name_label, member_name);
    lv_obj_set_style_text_font(name_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(name_label, kiosk_theme_color_text_strong(), 0);
  }

  if (balance >= 0) {
    char bal_buf[32];
    snprintf(bal_buf, sizeof(bal_buf), "Balance: P%d", (int)balance);
    lv_obj_t *bal_label = lv_label_create(name_col);
    lv_label_set_text(bal_label, bal_buf);
    lv_obj_set_style_text_font(bal_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(bal_label, kiosk_theme_color_success(), 0);
  }

  /* Cancel booking button */
  if (on_cancel) {
    lv_obj_t *cancel_btn = lv_btn_create(header);
    lv_obj_remove_style_all(cancel_btn);
    lv_obj_set_style_bg_color(cancel_btn, kiosk_theme_color_bg(), 0);
    lv_obj_set_style_bg_opa(cancel_btn, LV_OPA_COVER, 0);
    lv_obj_set_style_radius(cancel_btn, 6, 0);
    lv_obj_set_size(cancel_btn, LV_SIZE_CONTENT, 28);
    lv_obj_set_style_pad_hor(cancel_btn, 8, 0);
    lv_obj_t *cancel_label = lv_label_create(cancel_btn);
    lv_label_set_text(cancel_label, LV_SYMBOL_CLOSE " Cancel");
  lv_obj_set_style_text_font(cancel_label, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(cancel_label, kiosk_theme_color_text_muted(), 0);
    lv_obj_center(cancel_label);

    cancel_closure_t *cl = malloc(sizeof(cancel_closure_t));
    cl->cb = on_cancel;
    cl->user_data = cancel_user_data;
    lv_obj_add_event_cb(cancel_btn, cancel_click_cb, LV_EVENT_CLICKED, cl);
    lv_obj_add_event_cb(cancel_btn, free_closure_cb, LV_EVENT_DELETE, cl);
    kiosk_theme_pin_pressed(cancel_btn);
  }

  /* Step progress row */
  lv_obj_t *steps_row = lv_obj_create(root);
  lv_obj_remove_style_all(steps_row);
  lv_obj_set_width(steps_row, lv_pct(100));
  lv_obj_set_height(steps_row, 26);
  lv_obj_set_pos(steps_row, 0, 50);
  lv_obj_set_flex_flow(steps_row, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(steps_row, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_top(steps_row, 6, 0);
  lv_obj_clear_flag(steps_row, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ON_FOCUS);
  lv_obj_set_scrollbar_mode(steps_row, LV_SCROLLBAR_MODE_OFF);

  for (int i = 0; i < 4; i++) {
    bool done = i < current_step;
    bool active = i == current_step;

    lv_obj_t *step_col = lv_obj_create(steps_row);
    lv_obj_remove_style_all(step_col);
    lv_obj_set_flex_grow(step_col, (i < 3) ? 1 : 0);
    lv_obj_set_height(step_col, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(step_col, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(step_col, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_clear_flag(step_col, LV_OBJ_FLAG_SCROLLABLE);

    /* Step dot */
    lv_obj_t *dot = lv_obj_create(step_col);
    lv_obj_remove_style_all(dot);
    lv_obj_set_size(dot, 24, 24);
    lv_obj_set_style_radius(dot, 12, 0);

    if (done) {
      lv_obj_set_style_bg_color(dot, kiosk_theme_color_primary(), 0);
      lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0);
      lv_obj_set_style_border_width(dot, 0, 0);
      lv_obj_t *check = lv_label_create(dot);
      lv_label_set_text(check, LV_SYMBOL_OK);
      lv_obj_set_style_text_font(check, &lv_font_montserrat_14, 0);
      lv_obj_set_style_text_color(check, kiosk_theme_color_bg(), 0);
      lv_obj_center(check);
    } else if (active) {
      lv_obj_set_style_bg_color(dot, kiosk_theme_color_bg(), 0);
      lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0);
      lv_obj_set_style_border_color(dot, kiosk_theme_color_primary(), 0);
      lv_obj_set_style_border_width(dot, 2, 0);
      lv_obj_t *num = lv_label_create(dot);
      char n[2] = {(char)('1' + i), 0};
      lv_label_set_text(num, n);
      lv_obj_set_style_text_font(num, &lv_font_montserrat_14, 0);
      lv_obj_set_style_text_color(num, kiosk_theme_color_primary(), 0);
      lv_obj_center(num);
    } else {
      lv_obj_set_style_bg_color(dot, kiosk_theme_color_bg(), 0);
      lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0);
      lv_obj_set_style_border_color(dot, kiosk_theme_color_border(), 0);
      lv_obj_set_style_border_width(dot, 2, 0);
      lv_obj_t *num = lv_label_create(dot);
      char n[2] = {(char)('1' + i), 0};
      lv_label_set_text(num, n);
      lv_obj_set_style_text_font(num, &lv_font_montserrat_14, 0);
      lv_obj_set_style_text_color(num, kiosk_theme_color_text_muted(), 0);
      lv_obj_center(num);
    }

    /* Step label */
    lv_obj_t *label = lv_label_create(step_col);
    lv_label_set_text(label, STEP_LABELS[i]);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_14, 0);
    if (done) {
      lv_obj_set_style_text_color(label, kiosk_theme_color_primary(), 0);
    } else if (active) {
      lv_obj_set_style_text_color(label, kiosk_theme_color_text_strong(), 0);
    } else {
      lv_obj_set_style_text_color(label, kiosk_theme_color_text_muted(), 0);
    }
    lv_obj_set_style_pad_left(label, 4, 0);

    /* Connector line (not after last) */
    if (i < 3) {
      lv_obj_t *connector = lv_obj_create(step_col);
      lv_obj_remove_style_all(connector);
      lv_obj_set_flex_grow(connector, 1);
      lv_obj_set_height(connector, 2);
      lv_obj_set_style_bg_color(connector, done ? kiosk_theme_color_primary() : kiosk_theme_color_border(), 0);
      lv_obj_set_style_bg_opa(connector, LV_OPA_COVER, 0);
      lv_obj_set_style_radius(connector, 1, 0);
      lv_obj_set_style_pad_hor(connector, 4, 0);
    }
  }

  return root;
}
