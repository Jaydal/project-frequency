#pragma once

#include "lvgl.h"
#include "../../data/kiosk_model.h"

/* Mirrors web/src/components/terminal/CourtOverview.tsx — the booking
 * flow's compact sidebar court list. */
lv_obj_t *court_overview_create(lv_obj_t *parent, const court_status_t *courts, uint8_t count);

void court_overview_tick(lv_obj_t *panel, const court_status_t *courts, uint8_t count);
