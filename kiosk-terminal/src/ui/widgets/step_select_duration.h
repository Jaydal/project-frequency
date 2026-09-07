#pragma once

#include "lvgl.h"
#include "../../data/kiosk_model.h"

/* Mirrors web/src/components/terminal/SelectDuration.tsx. */
typedef void (*step_select_duration_cb_t)(void *user_data, int32_t duration_min);

lv_obj_t *step_select_duration_create(lv_obj_t *parent,
                                       const char *member_name, int32_t balance,
                                       const kiosk_products_config_t *config,
                                       int32_t party_size,
                                       bool has_active_game,
                                       step_select_duration_cb_t on_select,
                                       void (*on_cancel)(void *), void *cancel_user_data,
                                       void (*on_back)(void *), void *back_user_data,
                                       void *user_data);
