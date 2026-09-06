#pragma once

#include "lvgl.h"
#include "../../data/kiosk_model.h"

typedef void (*step_confirm_cb_t)(void *user_data);

/* Mirrors web/src/components/terminal/ConfirmBooking.tsx.
 * match_title_buf: if non-NULL, widget writes the match title here on changes.
 * match_title_buf_size: size of match_title_buf.
 * on_busy_change: called with non-NULL user_data when busy state changes (for enabling/disabling).
 *   The callback receives a bool* (value = busy). Set to NULL if not needed.
 */
lv_obj_t *step_booking_confirm_create(lv_obj_t *parent,
                                       const char *member_name, int32_t balance,
                                       const char *court_name,
                                       const char *game_type_label,
                                       int32_t duration_min,
                                       int32_t credits_required,
                                       char *match_title_buf, size_t match_title_buf_size,
                                       bool is_check_in, bool is_capped,
                                       step_confirm_cb_t on_confirm,
                                       void (*on_cancel)(void *), void *cancel_user_data,
                                       void (*on_back)(void *), void *back_user_data,
                                       void *user_data);
