#pragma once

#include "lvgl.h"
#include "../../data/kiosk_model.h"

lv_obj_t *court_status_card_create(lv_obj_t *parent, const court_status_t *court,
                                   uint8_t court_idx, lv_obj_t **timer);
void court_status_card_tick(lv_obj_t *value_label, const court_status_t *court, uint8_t court_idx);
