#include "court_status_card.h"
#include "../theme/kiosk_theme.h"
#include <stdio.h>
#include "../../data/kiosk_data_provider.h"

static lv_obj_t *set_label(lv_obj_t *parent, const char *text, const lv_font_t *font, lv_color_t color) {
  lv_obj_t *label = lv_label_create(parent);
  lv_label_set_text(label, text);
  lv_obj_set_style_text_font(label, font, 0);
  lv_obj_set_style_text_color(label, color, 0);
  return label;
}

static void big_timer_refresh_cb(lv_event_t *e) {
  lv_obj_t *label = lv_event_get_target(e);
  uint8_t court_idx = (uint8_t)(uintptr_t)lv_event_get_user_data(e);
  
  kiosk_board_t board;
  kiosk_data_provider_get()->get_board(&board);
  if (court_idx >= board.court_count) return;
  const court_status_t *court = &board.courts[court_idx];
  
  if (!court_is_active(court)) return;
  
  int32_t elapsed = court_elapsed_sec(court);
  int32_t prep_sec = kiosk_effective_prep_sec(court->duration_min, court->prep_time_sec);
  court_phase_t phase = kiosk_phase_for_elapsed(elapsed, prep_sec);
  
  int32_t total_sec = court->duration_min * 60 + prep_sec;
  int32_t remaining = total_sec - elapsed;
  if (remaining < 0) remaining = 0;
  
  char time_buf[8];
  kiosk_format_time(time_buf, sizeof(time_buf), remaining);
  char big_buf[32];
  snprintf(big_buf, sizeof(big_buf), "%s %s", time_buf, phase == COURT_PHASE_PREPARING ? "PREP" : "LEFT");
  lv_label_set_text(label, big_buf);
  lv_color_t phase_color = phase == COURT_PHASE_PREPARING ? kiosk_theme_color_warning() : kiosk_theme_color_success();
  lv_color_t current_color = lv_obj_get_style_text_color(label, 0);
  if (current_color.full != phase_color.full) {
    lv_obj_set_style_text_color(label, phase_color, 0);
  }
}

static void sub_timer_refresh_cb(lv_event_t *e) {
  lv_obj_t *label = lv_event_get_target(e);
  uint8_t court_idx = (uint8_t)(uintptr_t)lv_event_get_user_data(e);
  
  kiosk_board_t board;
  kiosk_data_provider_get()->get_board(&board);
  if (court_idx >= board.court_count) return;
  const court_status_t *court = &board.courts[court_idx];
  
  if (!court_is_active(court)) return;
  
  int32_t elapsed = court_elapsed_sec(court);
  int32_t prep_sec = kiosk_effective_prep_sec(court->duration_min, court->prep_time_sec);
  court_phase_t phase = kiosk_phase_for_elapsed(elapsed, prep_sec);
  
  char sub_buf[64];
  if (phase == COURT_PHASE_PREPARING) {
    char prep_left[8];
    kiosk_format_time(prep_left, sizeof(prep_left), prep_sec - elapsed);
    snprintf(sub_buf, sizeof(sub_buf), "Starts in %s", prep_left);
  } else {
    char elapsed_buf[8];
    kiosk_format_time(elapsed_buf, sizeof(elapsed_buf), elapsed);
    snprintf(sub_buf, sizeof(sub_buf), "Elapsed %s", elapsed_buf);
  }
  lv_label_set_text(label, sub_buf);
}

lv_obj_t *court_status_card_create(lv_obj_t *parent, const court_status_t *court, uint8_t court_idx) {
  lv_obj_t *card = lv_obj_create(parent);
  kiosk_theme_disable_transitions(card);
  lv_obj_set_width(card, lv_pct(100));
  /* Every court gets the same footprint.  The court column scrolls when the
   * number of courts grows; live timer text and optional sections never alter
   * a card's height or move another court. */
  lv_obj_set_height(card, 160);
  lv_obj_set_style_min_height(card, 160, 0);
  lv_obj_set_style_max_height(card, 160, 0);
  lv_obj_set_style_pad_all(card, 6, 0);
  lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(card, 2, 0);

  int32_t elapsed = court_elapsed_sec(court);
  court_phase_t phase = COURT_PHASE_AVAILABLE;
  int32_t prep_sec = kiosk_effective_prep_sec(court->duration_min, court->prep_time_sec);
  if (court_is_active(court)) {
    phase = kiosk_phase_for_elapsed(elapsed, prep_sec);
    lv_obj_add_style(card, phase == COURT_PHASE_PREPARING ? &kiosk_style_card_preparing
                                                           : &kiosk_style_card_in_game, 0);
  } else {
    lv_obj_add_style(card, &kiosk_style_card_available, 0);
  }

  /* Header row: name + status badge */
  lv_obj_t *header = lv_obj_create(card);
  lv_obj_remove_style_all(header);
  lv_obj_set_width(header, lv_pct(100));
  lv_obj_set_height(header, LV_SIZE_CONTENT);
  lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

  set_label(header, court->name, &lv_font_montserrat_16, kiosk_theme_color_text_strong());

  if (court_is_active(court)) {
    set_label(header, phase == COURT_PHASE_PREPARING ? "PREPARING" : "IN GAME", &lv_font_montserrat_14,
               phase == COURT_PHASE_PREPARING ? kiosk_theme_color_warning() : kiosk_theme_color_success());
  } else {
    set_label(header, "AVAILABLE", &lv_font_montserrat_14, kiosk_theme_color_success());
  }

  if (court_is_active(court) && court->match_title[0] != '\0') {
    set_label(card, court->match_title, &lv_font_montserrat_14, kiosk_theme_color_text_muted());
  }

  /* Reserved up-next area: always occupies the same height when present. */
  lv_obj_t *next_box = lv_obj_create(card);
  lv_obj_remove_style_all(next_box);
  lv_obj_set_width(next_box, lv_pct(100));
  lv_obj_set_height(next_box, 30);
  lv_obj_set_flex_flow(next_box, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(next_box, 0, 0);
  if (court->next_start_time != 0) {
    char next_buf[96];
    snprintf(next_buf, sizeof(next_buf), "Up next · %s", court->next_match_title[0] ? court->next_match_title : "Scheduled game");
    lv_obj_t *next_title = set_label(next_box, next_buf, &lv_font_montserrat_12, kiosk_theme_color_text_muted());
    lv_obj_set_width(next_title, lv_pct(100));
    lv_obj_set_height(next_title, 14);
    lv_label_set_long_mode(next_title, LV_LABEL_LONG_DOT);
    char when_buf[32];
    struct tm tm_local;
    localtime_r(&court->next_start_time, &tm_local);
    strftime(when_buf, sizeof(when_buf), "%b %d, %I:%M %p", &tm_local);
    lv_obj_t *next_time = set_label(next_box, when_buf, &lv_font_montserrat_12, kiosk_theme_color_text_muted());
    lv_obj_set_width(next_time, lv_pct(100));
    lv_obj_set_height(next_time, 14);
    lv_label_set_long_mode(next_time, LV_LABEL_LONG_CLIP);
    if (court->next_player_count > 0) {
      char players_buf[96] = "";
      for (uint8_t i = 0; i < court->next_player_count && i < 2; i++) {
        char name[KIOSK_MAX_NAME_LEN * 2 + 2];
        snprintf(name, sizeof(name), "%s %s", court->next_players[i].first_name,
                 court->next_players[i].last_name);
        if (i > 0) strncat(players_buf, " / ", sizeof(players_buf) - strlen(players_buf) - 1);
        strncat(players_buf, name, sizeof(players_buf) - strlen(players_buf) - 1);
      }
      char next_meta[96];
      snprintf(next_meta, sizeof(next_meta), "%s · %.40s", when_buf, players_buf);
      lv_label_set_text(next_time, next_meta);
    }
  }

  if (court_is_active(court)) {
    int32_t total_sec = court->duration_min * 60 + prep_sec;
    int32_t remaining = total_sec - elapsed;
    if (remaining < 0) remaining = 0;

    lv_obj_t *timer_box = lv_obj_create(card);
    lv_obj_remove_style_all(timer_box);
    lv_obj_set_width(timer_box, lv_pct(100));
    /* Keep the timer's footprint fixed. Changing label text every second
     * must not trigger flex remeasurement/repositioning of the card. */
    lv_obj_set_height(timer_box, 44);
    lv_obj_set_flex_flow(timer_box, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(timer_box, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_ver(timer_box, 2, 0);

    char time_buf[8];
    kiosk_format_time(time_buf, sizeof(time_buf), remaining);
    char big_buf[32];
    snprintf(big_buf, sizeof(big_buf), "%s %s", time_buf, phase == COURT_PHASE_PREPARING ? "PREP" : "LEFT");
    lv_obj_t *lbl_big = set_label(timer_box, big_buf, &lv_font_montserrat_20,
               phase == COURT_PHASE_PREPARING ? kiosk_theme_color_warning() : kiosk_theme_color_success());
    lv_obj_set_width(lbl_big, 220);
    lv_obj_set_height(lbl_big, 24);
    lv_label_set_long_mode(lbl_big, LV_LABEL_LONG_CLIP);
    lv_obj_set_style_text_align(lbl_big, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_add_flag(lbl_big, LV_OBJ_FLAG_USER_1);
    lv_obj_add_event_cb(lbl_big, big_timer_refresh_cb, LV_EVENT_REFRESH, (void *)(uintptr_t)court_idx);

      char sub_buf[64];
    if (phase == COURT_PHASE_PREPARING) {
      char prep_left[8];
      kiosk_format_time(prep_left, sizeof(prep_left), prep_sec - elapsed);
      snprintf(sub_buf, sizeof(sub_buf), "Starts in %s", prep_left);
    } else {
      char elapsed_buf[8];
      kiosk_format_time(elapsed_buf, sizeof(elapsed_buf), elapsed);
      snprintf(sub_buf, sizeof(sub_buf), "Elapsed %s", elapsed_buf);
    }
    lv_obj_t *lbl_sub = set_label(timer_box, sub_buf, &lv_font_montserrat_14, kiosk_theme_color_text_muted());
    lv_obj_set_width(lbl_sub, 240);
    lv_obj_set_height(lbl_sub, 14);
    lv_label_set_long_mode(lbl_sub, LV_LABEL_LONG_CLIP);
    lv_obj_set_style_text_align(lbl_sub, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_add_flag(lbl_sub, LV_OBJ_FLAG_USER_1);
    lv_obj_add_event_cb(lbl_sub, sub_timer_refresh_cb, LV_EVENT_REFRESH, (void *)(uintptr_t)court_idx);

    if (court->player_count > 0) {
      lv_obj_t *chips = lv_obj_create(card);
      lv_obj_remove_style_all(chips);
      lv_obj_set_width(chips, lv_pct(100));
      lv_obj_set_height(chips, LV_SIZE_CONTENT);
      lv_obj_set_flex_flow(chips, LV_FLEX_FLOW_ROW_WRAP);
      lv_obj_set_style_pad_column(chips, 6, 0);

      uint8_t shown = court->player_count < 2 ? court->player_count : 2;
      for (uint8_t i = 0; i < shown; i++) {
        char name_buf[64];
        snprintf(name_buf, sizeof(name_buf), "%s %s", court->players[i].first_name, court->players[i].last_name);
        lv_obj_t *chip = lv_obj_create(chips);
        lv_obj_set_style_bg_color(chip, kiosk_theme_color_bg(), 0);
        lv_obj_set_style_bg_opa(chip, LV_OPA_COVER, 0);
        lv_obj_set_style_radius(chip, 4, 0);
        lv_obj_set_style_pad_hor(chip, 8, 0);
        lv_obj_set_style_pad_ver(chip, 2, 0);
        lv_obj_set_style_border_width(chip, 0, 0);
        lv_obj_set_size(chip, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
        set_label(chip, name_buf, &lv_font_montserrat_14, kiosk_theme_color_text());
      }
      if (court->player_count > 2) {
        char more_buf[16];
        snprintf(more_buf, sizeof(more_buf), "+%d", court->player_count - 2);
        set_label(chips, more_buf, &lv_font_montserrat_14, kiosk_theme_color_text_muted());
      }
    }
  }

  return card;
}
