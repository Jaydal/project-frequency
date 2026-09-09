#include "step_error.h"
#include "booking_stepper.h"
#include "../theme/kiosk_theme.h"
#include <stdlib.h>

typedef struct {
  step_error_cb_t cb;
  void *user_data;
} error_closure_t;

static void run_cb(lv_event_t *e) {
  error_closure_t *c = lv_event_get_user_data(e);
  c->cb(c->user_data);
}

lv_obj_t *step_error_create(lv_obj_t *parent, const kiosk_error_t *error, step_error_cb_t on_retry,
                             void *user_data) {
  lv_obj_t *root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_set_size(root, lv_pct(100), lv_pct(100));
  lv_obj_set_layout(root, 0);
  lv_obj_set_style_pad_all(root, 24, 0);

  lv_obj_t *icon = lv_label_create(root);
  lv_label_set_text(icon, LV_SYMBOL_WARNING);
  lv_obj_set_style_text_font(icon, &lv_font_montserrat_32, 0);
  lv_obj_set_style_text_color(icon, KIOSK_COLOR_RED_400, 0);
  lv_obj_set_size(icon, 40, 40);
  lv_obj_align(icon, LV_ALIGN_TOP_MID, 0, 120);

  lv_obj_t *title = lv_label_create(root);
  lv_label_set_text(title, error->title);
  lv_obj_set_style_text_font(title, &lv_font_montserrat_16, 0);
  lv_obj_set_style_text_color(title, KIOSK_COLOR_ZINC_100, 0);
  lv_obj_set_size(title, 700, 24);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 172);
  lv_obj_set_style_text_align(title, LV_TEXT_ALIGN_CENTER, 0);

  lv_obj_t *message = lv_label_create(root);
  lv_label_set_text(message, error->message);
  lv_obj_set_style_text_font(message, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(message, KIOSK_COLOR_ZINC_500, 0);
  lv_obj_set_style_text_align(message, LV_TEXT_ALIGN_CENTER, 0);
  lv_label_set_long_mode(message, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(message, lv_pct(80));
  lv_obj_set_height(message, 64);
  lv_obj_align(message, LV_ALIGN_TOP_MID, 0, 208);

  lv_obj_t *retry_btn = lv_btn_create(root);
  lv_obj_add_style(retry_btn, &kiosk_style_btn_secondary, 0);
  lv_obj_add_style(retry_btn, &kiosk_style_btn_secondary, LV_STATE_PRESSED);
  lv_obj_set_size(retry_btn, 300, 56);
  lv_obj_align(retry_btn, LV_ALIGN_TOP_MID, 0, 300);
  lv_obj_t *retry_label = lv_label_create(retry_btn);
  lv_label_set_text(retry_label, "Try Again");
  lv_obj_center(retry_label);
  kiosk_theme_pin_pressed(retry_btn);

  error_closure_t *closure = malloc(sizeof(error_closure_t));
  closure->cb = on_retry;
  closure->user_data = user_data;
  lv_obj_add_event_cb(retry_btn, run_cb, LV_EVENT_CLICKED, closure);
  lv_obj_add_event_cb(retry_btn, free_closure_cb, LV_EVENT_DELETE, closure);

  return root;
}
