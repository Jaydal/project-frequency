#pragma once

#include "lvgl.h"
#include "../../data/kiosk_model.h"

typedef struct {
  lv_obj_t *nfc_status;
  lv_obj_t *court_column;
  lv_obj_t *cards[KIOSK_MAX_COURTS];
  lv_obj_t *timers[KIOSK_MAX_COURTS];
  court_phase_t phases[KIOSK_MAX_COURTS];
  lv_obj_t *queue_title;
  lv_obj_t *queue_list;
} queue_board_view_t;

lv_obj_t *queue_board_create(lv_obj_t *parent, const kiosk_board_t *board, queue_board_view_t *view);
void queue_board_update(queue_board_view_t *view, const kiosk_board_t *previous, const kiosk_board_t *board);
