#include "step_select_game_type.h"
#include "booking_stepper.h"
#include "../theme/kiosk_theme.h"
#include <stdlib.h>

typedef struct {
  game_type_t game_type;
  step_select_game_type_cb_t cb;
  void *user_data;
} game_type_closure_t;

static void click_cb(lv_event_t *e) {
  game_type_closure_t *c = lv_event_get_user_data(e);
  c->cb(c->user_data, c->game_type);
}

static void back_cb(lv_event_t *e) {
  back_closure_t *c = lv_event_get_user_data(e);
  if (c->cb) c->cb(c->user_data);
}

static lv_obj_t *make_tile(lv_obj_t *parent, const char *big, const char *sub, const char *desc) {
  lv_obj_t *tile = lv_btn_create(parent);
  lv_obj_add_style(tile, &kiosk_style_tile, 0);
  lv_obj_add_style(tile, &kiosk_style_tile, LV_STATE_PRESSED);
  lv_obj_set_width(tile, lv_pct(45));
  lv_obj_set_height(tile, 140);
  lv_obj_set_style_pad_all(tile, 12, 0);
  lv_obj_set_flex_flow(tile, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(tile, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
  lv_obj_set_style_pad_row(tile, 4, 0);

  lv_obj_t *top = lv_obj_create(tile);
  lv_obj_remove_style_all(top);
  lv_obj_set_width(top, lv_pct(100));
  lv_obj_set_height(top, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(top, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(top, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_clear_flag(top, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *big_label = lv_label_create(top);
  lv_label_set_text(big_label, big);
  lv_obj_set_style_text_font(big_label, &lv_font_montserrat_20, 0);
  lv_obj_set_style_text_color(big_label, kiosk_theme_color_text_strong(), 0);

  lv_obj_t *sub_label = lv_label_create(top);
  lv_label_set_text(sub_label, sub);
  lv_obj_set_style_text_font(sub_label, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(sub_label, kiosk_theme_color_primary(), 0);

  if (desc) {
    lv_obj_t *desc_label = lv_label_create(tile);
    lv_label_set_text(desc_label, desc);
    lv_obj_set_style_text_font(desc_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(desc_label, kiosk_theme_color_text_muted(), 0);
  }

  return tile;
}

lv_obj_t *step_select_game_type_create(lv_obj_t *parent,
                                        const char *member_name, int32_t balance,
                                        step_select_game_type_cb_t on_select,
                                        void (*on_cancel)(void *), void *cancel_user_data,
                                        void (*on_back)(void *), void *back_user_data,
                                        void *user_data) {
  lv_obj_t *root = lv_obj_create(parent);
  lv_obj_remove_style_all(root);
  lv_obj_set_size(root, lv_pct(100), lv_pct(100));
  lv_obj_set_flex_flow(root, LV_FLEX_FLOW_COLUMN);
  lv_obj_clear_flag(root, LV_OBJ_FLAG_SCROLLABLE);

  booking_stepper_create(root, 1, member_name, balance, on_cancel, cancel_user_data);

  lv_obj_t *scroll = lv_obj_create(root); lv_obj_set_scrollbar_mode(scroll, LV_SCROLLBAR_MODE_AUTO); lv_obj_add_flag(scroll, LV_OBJ_FLAG_SCROLLABLE); lv_obj_clear_flag(scroll, LV_OBJ_FLAG_SCROLL_ELASTIC | LV_OBJ_FLAG_SCROLL_MOMENTUM);
  lv_obj_remove_style_all(scroll);
  lv_obj_set_width(scroll, lv_pct(100));
  lv_obj_set_flex_grow(scroll, 1);
  lv_obj_set_flex_flow(scroll, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_all(scroll, 12, 0);
  lv_obj_set_style_pad_row(scroll, 8, 0);

  lv_obj_t *title = lv_label_create(scroll);
  lv_label_set_text(title, "Select Game Format");
  lv_obj_set_style_text_font(title, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(title, kiosk_theme_color_text_muted(), 0);

  lv_obj_t *row = lv_obj_create(scroll);
  lv_obj_remove_style_all(row);
  lv_obj_set_width(row, lv_pct(100));
  lv_obj_set_flex_grow(row, 1);
  lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(row, LV_FLEX_ALIGN_SPACE_EVENLY, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

  lv_obj_t *t1 = make_tile(row, "1 vs 1", "Singles", "2 players  o  1 credit rate");
  game_type_closure_t *c1 = malloc(sizeof(game_type_closure_t));
  c1->game_type = GAME_TYPE_1V1;
  c1->cb = on_select;
  c1->user_data = user_data;
  lv_obj_add_event_cb(t1, click_cb, LV_EVENT_CLICKED, c1);
  lv_obj_add_event_cb(t1, free_closure_cb, LV_EVENT_DELETE, c1);

  lv_obj_t *t2 = make_tile(row, "2 vs 2", "Doubles", "4 players  o  Split or single pay");
  game_type_closure_t *c2 = malloc(sizeof(game_type_closure_t));
  c2->game_type = GAME_TYPE_2V2;
  c2->cb = on_select;
  c2->user_data = user_data;
  lv_obj_add_event_cb(t2, click_cb, LV_EVENT_CLICKED, c2);
  lv_obj_add_event_cb(t2, free_closure_cb, LV_EVENT_DELETE, c2);

  /* Back button */
  lv_obj_t *back_btn = lv_btn_create(scroll);
  lv_obj_add_style(back_btn, &kiosk_style_btn_secondary, 0);
  lv_obj_add_style(back_btn, &kiosk_style_btn_secondary, LV_STATE_PRESSED);
  lv_obj_set_width(back_btn, lv_pct(100));
  lv_obj_t *back_label = lv_label_create(back_btn);
  lv_label_set_text(back_label, LV_SYMBOL_LEFT " Back to Court Selection");
  lv_obj_center(back_label);

  back_closure_t *exit_cl = malloc(sizeof(back_closure_t));
  exit_cl->cb = on_back;
  exit_cl->user_data = back_user_data;
  lv_obj_add_event_cb(back_btn, back_cb, LV_EVENT_CLICKED, exit_cl);
  lv_obj_add_event_cb(back_btn, free_closure_cb, LV_EVENT_DELETE, exit_cl);

  return root;
}
