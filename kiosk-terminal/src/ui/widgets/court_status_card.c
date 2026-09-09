#include "court_status_card.h"
#include "../theme/kiosk_theme.h"
#include <stdio.h>
#include <string.h>
#include "../../data/kiosk_data_provider.h"

#define COURT_CARD_HEIGHT 160
#define COURT_TITLE_SLOT_HEIGHT 30
#define COURT_NEXT_SLOT_HEIGHT 26
#define COURT_TIMER_SLOT_HEIGHT 42
#define COURT_PLAYERS_SLOT_HEIGHT 18

static char s_timer_value_text[KIOSK_MAX_COURTS][8];
static char s_timer_phase_text[KIOSK_MAX_COURTS][8];

static lv_color_t timer_color_for_remaining(int32_t remaining_sec) {
  if (remaining_sec <= 60) return kiosk_theme_color_danger();
  if (remaining_sec <= 300) return kiosk_theme_color_warning();
  return kiosk_theme_color_success();
}

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
  const char *phase_text = "LEFT";
  if (strcmp(s_timer_value_text[court_idx], time_buf) != 0) {
    snprintf(s_timer_value_text[court_idx], sizeof(s_timer_value_text[court_idx]), "%s", time_buf);
    lv_obj_t *timer_box = lv_obj_get_parent(label);
    lv_obj_t *value_label = lv_obj_get_child(timer_box, 0);
    lv_label_set_text_static(value_label, s_timer_value_text[court_idx]);
  }
  if (strcmp(s_timer_phase_text[court_idx], phase_text) != 0) {
    snprintf(s_timer_phase_text[court_idx], sizeof(s_timer_phase_text[court_idx]), "%s", phase_text);
    lv_obj_t *timer_box = lv_obj_get_parent(label);
    lv_obj_t *phase_label = lv_obj_get_child(timer_box, 1);
    lv_label_set_text_static(phase_label, s_timer_phase_text[court_idx]);
  }
  lv_color_t phase_color = timer_color_for_remaining(remaining);
  lv_obj_t *timer_box = lv_obj_get_parent(label);
  lv_obj_t *value_label = lv_obj_get_child(timer_box, 0);
  lv_obj_t *phase_label = lv_obj_get_child(timer_box, 1);
  lv_color_t value_color = lv_obj_get_style_text_color(value_label, 0);
  lv_color_t current_color = lv_obj_get_style_text_color(phase_label, 0);
  if (value_color.full != phase_color.full) {
    lv_obj_set_style_text_color(value_label, phase_color, 0);
  }
  if (current_color.full != phase_color.full) {
    lv_obj_set_style_text_color(phase_label, phase_color, 0);
  }
}

lv_obj_t *court_status_card_create(lv_obj_t *parent, const court_status_t *court, uint8_t court_idx) {
  lv_obj_t *card = lv_obj_create(parent);
  kiosk_theme_disable_transitions(card);
  lv_obj_set_width(card, lv_pct(100));
  /* Every court gets the same maximum-content footprint. Optional content is
   * rendered into fixed slots below, so an active court never reflows when a
   * title/player list appears or a timer label changes. */
  lv_obj_set_height(card, COURT_CARD_HEIGHT);
  lv_obj_set_style_min_height(card, COURT_CARD_HEIGHT, 0);
  lv_obj_set_style_max_height(card, COURT_CARD_HEIGHT, 0);
   /* Fixed inset so no text touches the card border. LVGL positions manual
    * children relative to the padded content area, and each slot below adds
    * its own horizontal inset as well. */
   lv_obj_set_style_pad_all(card, 8, 0);
  lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_SCROLL_ELASTIC |
                           LV_OBJ_FLAG_SCROLL_MOMENTUM | LV_OBJ_FLAG_SCROLL_ON_FOCUS);

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
  /* The card itself is a fixed canvas. Its children use explicit slots below;
   * only the header and player-chip rows use their own local flex layouts. */
   lv_obj_set_style_pad_all(card, 0, 0);
  lv_obj_set_layout(card, 0);

  /* Header row: name + status badge */
  lv_obj_t *header = lv_obj_create(card);
  lv_obj_remove_style_all(header);
  lv_obj_set_width(header, lv_pct(100));
   lv_obj_set_height(header, 18);
  lv_obj_set_pos(header, 0, 0);
  lv_obj_set_style_pad_hor(header, 4, 0);
  lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(header, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

  set_label(header, court->name, &lv_font_montserrat_16, kiosk_theme_color_text_strong());

  if (court_is_active(court)) {
    char status_buf[32];
    snprintf(status_buf, sizeof(status_buf), "%s · %s",
             phase == COURT_PHASE_PREPARING ? "PREPARING" : "IN GAME",
             court->match_type[0] ? court->match_type : "GAME");
    set_label(header, status_buf, &lv_font_montserrat_12,
               phase == COURT_PHASE_PREPARING ? kiosk_theme_color_warning() : kiosk_theme_color_success());
  } else {
    set_label(header, "AVAILABLE", &lv_font_montserrat_14, kiosk_theme_color_success());
  }

  lv_obj_t *title_slot = lv_obj_create(card);
  lv_obj_remove_style_all(title_slot);
  lv_obj_set_width(title_slot, lv_pct(100));
  lv_obj_set_height(title_slot, COURT_TITLE_SLOT_HEIGHT);
  lv_obj_set_pos(title_slot, 0, 20);
  lv_obj_set_style_pad_hor(title_slot, 4, 0);
  if (court_is_active(court) && court->match_title[0] != '\0') {
    lv_obj_t *title_label = set_label(title_slot, court->match_title,
                                       &lv_font_montserrat_12,
                                       kiosk_theme_color_text_muted());
    lv_obj_set_width(title_label, lv_pct(100));
    lv_obj_set_height(title_label, 16);
    lv_label_set_long_mode(title_label, LV_LABEL_LONG_CLIP);
  }
  if (court_is_active(court)) {
    char started_buf[40];
    struct tm started_tm;
    localtime_r(&court->start_time, &started_tm);
    strftime(started_buf, sizeof(started_buf), "Started %b %d, %I:%M %p", &started_tm);
    lv_obj_t *started_label = set_label(title_slot, started_buf,
                                        &lv_font_montserrat_12,
                                        kiosk_theme_color_text_muted());
    lv_obj_set_width(started_label, lv_pct(100));
    lv_obj_set_height(started_label, 16);
    lv_obj_set_pos(started_label, 0, 16);
    lv_label_set_long_mode(started_label, LV_LABEL_LONG_CLIP);
  }

  /* Reserved up-next area: always occupies the same height when present. */
  lv_obj_t *next_box = lv_obj_create(card);
  lv_obj_remove_style_all(next_box);
  lv_obj_set_width(next_box, lv_pct(100));
  lv_obj_set_height(next_box, COURT_NEXT_SLOT_HEIGHT);
  lv_obj_set_pos(next_box, 0, 52);
  lv_obj_set_style_pad_hor(next_box, 4, 0);
  lv_obj_set_flex_flow(next_box, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(next_box, 0, 0);
  if (court->next_start_time != 0) {
    char next_buf[96];
    snprintf(next_buf, sizeof(next_buf), "Up next · %s", court->next_match_title[0] ? court->next_match_title : "Scheduled game");
    lv_obj_t *next_title = set_label(next_box, next_buf, &lv_font_montserrat_12, kiosk_theme_color_text_muted());
    lv_obj_set_width(next_title, lv_pct(100));
     lv_obj_set_height(next_title, 12);
    lv_label_set_long_mode(next_title, LV_LABEL_LONG_DOT);
    char when_buf[32];
    struct tm tm_local;
    localtime_r(&court->next_start_time, &tm_local);
    strftime(when_buf, sizeof(when_buf), "%b %d, %I:%M %p", &tm_local);
    lv_obj_t *next_time = set_label(next_box, when_buf, &lv_font_montserrat_12, kiosk_theme_color_text_muted());
    lv_obj_set_width(next_time, lv_pct(100));
     lv_obj_set_height(next_time, 12);
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

  lv_obj_t *timer_box = lv_obj_create(card);
  lv_obj_remove_style_all(timer_box);
  lv_obj_set_width(timer_box, 280);
  /* Keep this slot present for available courts as well. */
  lv_obj_set_height(timer_box, COURT_TIMER_SLOT_HEIGHT);
  lv_obj_align(timer_box, LV_ALIGN_TOP_MID, 0, 80);
  lv_obj_set_layout(timer_box, 0);
  if (court_is_active(court)) {
    lv_obj_set_style_bg_color(timer_box, kiosk_theme_color_primary(), 0);
    lv_obj_set_style_bg_opa(timer_box, LV_OPA_10, 0);
    lv_obj_set_style_border_color(timer_box, kiosk_theme_color_primary(), 0);
    lv_obj_set_style_border_opa(timer_box, LV_OPA_40, 0);
    lv_obj_set_style_border_width(timer_box, 1, 0);
    lv_obj_set_style_radius(timer_box, 8, 0);
  }

  if (court_is_active(court)) {
    int32_t total_sec = court->duration_min * 60 + prep_sec;
    int32_t remaining = total_sec - elapsed;
    if (remaining < 0) remaining = 0;

    char time_buf[8];
    kiosk_format_time(time_buf, sizeof(time_buf), remaining);
     snprintf(s_timer_value_text[court_idx], sizeof(s_timer_value_text[court_idx]), "%s", time_buf);
      snprintf(s_timer_phase_text[court_idx], sizeof(s_timer_phase_text[court_idx]), "LEFT");
     lv_obj_t *lbl_big = lv_label_create(timer_box);
     lv_label_set_text_static(lbl_big, s_timer_value_text[court_idx]);
       lv_obj_set_style_text_font(lbl_big, &lv_font_montserrat_32, 0);
     lv_color_t timer_color = timer_color_for_remaining(remaining);
     lv_obj_set_style_text_color(lbl_big, timer_color, 0);
     kiosk_theme_disable_transitions(lbl_big);
      lv_obj_set_width(lbl_big, 110);
       lv_obj_set_height(lbl_big, 36);
       lv_obj_set_pos(lbl_big, 35, 1);
    lv_label_set_long_mode(lbl_big, LV_LABEL_LONG_CLIP);
     /* The label rectangle is fixed. Left alignment keeps the text origin
      * constant when proportional digits change width on each tick. */
     lv_obj_set_style_text_align(lbl_big, LV_TEXT_ALIGN_LEFT, 0);
     lv_obj_add_flag(lbl_big, LV_OBJ_FLAG_USER_1);
     lv_obj_add_event_cb(lbl_big, big_timer_refresh_cb, LV_EVENT_REFRESH, (void *)(uintptr_t)court_idx);

     lv_obj_t *lbl_phase = lv_label_create(timer_box);
     lv_label_set_text_static(lbl_phase, s_timer_phase_text[court_idx]);
      lv_obj_set_style_text_font(lbl_phase, &lv_font_montserrat_16, 0);
      lv_obj_set_style_text_color(lbl_phase, timer_color, 0);
     kiosk_theme_disable_transitions(lbl_phase);
      lv_obj_set_width(lbl_phase, 60);
       lv_obj_set_height(lbl_phase, 22);
       lv_obj_set_pos(lbl_phase, 165, 13);
     lv_label_set_long_mode(lbl_phase, LV_LABEL_LONG_CLIP);
     lv_obj_set_style_text_align(lbl_phase, LV_TEXT_ALIGN_LEFT, 0);
     lv_obj_add_flag(lbl_phase, LV_OBJ_FLAG_USER_1);
     lv_obj_add_event_cb(lbl_phase, big_timer_refresh_cb, LV_EVENT_REFRESH, (void *)(uintptr_t)court_idx);

  } else if (court->next_start_time == 0) {
    /* Use the reserved timer space for a useful, stable empty state instead
     * of leaving a large unexplained gap on available courts. */
    lv_obj_set_style_bg_color(timer_box, kiosk_theme_color_panel(), 0);
    lv_obj_set_style_bg_opa(timer_box, LV_OPA_COVER, 0);
    lv_obj_set_style_border_color(timer_box, kiosk_theme_color_border(), 0);
    lv_obj_set_style_border_opa(timer_box, LV_OPA_40, 0);
    lv_obj_set_style_border_width(timer_box, 1, 0);
    lv_obj_set_style_radius(timer_box, 8, 0);
    lv_obj_t *ready_label = lv_label_create(timer_box);
    lv_label_set_text(ready_label, "READY TO PLAY");
    lv_obj_set_style_text_font(ready_label, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(ready_label, kiosk_theme_color_success(), 0);
    lv_obj_set_size(ready_label, 220, 24);
    lv_obj_align(ready_label, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_text_align(ready_label, LV_TEXT_ALIGN_CENTER, 0);
    kiosk_theme_disable_transitions(ready_label);
  }

  lv_obj_t *chips = lv_obj_create(card);
  lv_obj_remove_style_all(chips);
  lv_obj_set_width(chips, lv_pct(100));
  /* Keep the player area present for every state and prevent long names from
   * changing the card's measured height. */
  lv_obj_set_height(chips, COURT_PLAYERS_SLOT_HEIGHT);
  lv_obj_set_pos(chips, 0, 124);
  lv_obj_set_style_pad_hor(chips, 4, 0);
   lv_obj_set_flex_flow(chips, LV_FLEX_FLOW_ROW_WRAP);
   lv_obj_set_style_pad_hor(chips, 6, 0);
   lv_obj_set_style_pad_ver(chips, 1, 0);
  lv_obj_set_style_pad_column(chips, 6, 0);
  lv_obj_set_style_pad_row(chips, 0, 0);
  lv_obj_clear_flag(chips, LV_OBJ_FLAG_SCROLLABLE);

  if (court_is_active(court) && court->player_count > 0) {

      uint8_t shown = court->player_count < 2 ? court->player_count : 2;
      for (uint8_t i = 0; i < shown; i++) {
        char name_buf[64];
        snprintf(name_buf, sizeof(name_buf), "%s %s", court->players[i].first_name, court->players[i].last_name);
        lv_obj_t *chip = lv_obj_create(chips);
        lv_obj_remove_style_all(chip);
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

  return card;
}
