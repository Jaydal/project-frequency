#include "board_parser.h"
#include "cJSON.h"
#include <string.h>
#include <stdio.h>
#include <sys/time.h>

static void get_str(const cJSON *obj, const char *key, char *out, size_t out_size) {
  const cJSON *item = cJSON_GetObjectItemCaseSensitive(obj, key);
  if (cJSON_IsString(item) && item->valuestring) {
    snprintf(out, out_size, "%s", item->valuestring);
  } else {
    out[0] = '\0';
  }
}

static double get_num(const cJSON *obj, const char *key) {
  const cJSON *item = cJSON_GetObjectItemCaseSensitive(obj, key);
  return cJSON_IsNumber(item) ? item->valuedouble : 0;
}

bool board_parse(const char *json, size_t len, kiosk_board_t *out) {
  memset(out, 0, sizeof(*out));
  cJSON *root = cJSON_ParseWithLength(json, len);
  if (!root) return false;

  /* The board publisher carries the authoritative epoch. Syncing from it
   * lets the kiosk evaluate schedule windows locally even when SNTP has not
   * completed yet (the LED display client follows the same model). */
  const cJSON *server_time_item = cJSON_GetObjectItemCaseSensitive(root, "serverTime");
  if (cJSON_IsNumber(server_time_item) && server_time_item->valuedouble > 1000000000.0) {
    struct timeval tv = { .tv_sec = (time_t)server_time_item->valuedouble, .tv_usec = 0 };
    settimeofday(&tv, NULL);
  }

  /* config (durations/rates/prep) — from the API, not hardcoded */
  const cJSON *cfg = cJSON_GetObjectItemCaseSensitive(root, "config");
  if (cJSON_IsObject(cfg)) {
    out->config.prep_time_sec = (int32_t)get_num(cfg, "prepTimeSec");
    const cJSON *durs = cJSON_GetObjectItemCaseSensitive(cfg, "durations");
    const cJSON *rates = cJSON_GetObjectItemCaseSensitive(cfg, "rates");
    if (cJSON_IsArray(durs)) {
      const cJSON *d;
      cJSON_ArrayForEach(d, durs) {
        if (out->config.duration_count >= KIOSK_MAX_DURATIONS) break;
        uint8_t i = out->config.duration_count;
        out->config.durations_min[i] = (int32_t)(cJSON_IsNumber(d) ? d->valuedouble : 0);
        const cJSON *r = cJSON_IsArray(rates) ? cJSON_GetArrayItem(rates, i) : NULL;
        out->config.rates[i] = (int32_t)(cJSON_IsNumber(r) ? r->valuedouble : 0);
        out->config.duration_count++;
      }
    }
  }

  /* courts */
  const cJSON *courts = cJSON_GetObjectItemCaseSensitive(root, "courts");
  if (cJSON_IsArray(courts)) {
    const cJSON *c;
    cJSON_ArrayForEach(c, courts) {
      if (out->court_count >= KIOSK_MAX_COURTS) break;
      court_status_t *dst = &out->courts[out->court_count++];
      get_str(c, "id", dst->id, sizeof(dst->id));
      get_str(c, "name", dst->name, sizeof(dst->name));
      get_str(c, "matchType", dst->match_type, sizeof(dst->match_type));
      get_str(c, "matchTitle", dst->match_title, sizeof(dst->match_title));
      dst->start_time = (time_t)get_num(c, "startTime");
      dst->duration_min = (int32_t)get_num(c, "durationMin");
      dst->prep_time_sec = (int32_t)get_num(c, "prepTimeSec");

      const cJSON *players = cJSON_GetObjectItemCaseSensitive(c, "players");
      if (cJSON_IsArray(players)) {
        const cJSON *p;
        cJSON_ArrayForEach(p, players) {
          if (dst->player_count >= KIOSK_MAX_PLAYERS) break;
          kiosk_player_name_t *pl = &dst->players[dst->player_count++];
          get_str(p, "firstName", pl->first_name, sizeof(pl->first_name));
          get_str(p, "lastName", pl->last_name, sizeof(pl->last_name));
        }
      }
    }
  }

  /* upcomingGames uses the court id as its id. Attach the first upcoming
   * entry to its court so the kiosk can show an Up next block. */
  const cJSON *upcoming = cJSON_GetObjectItemCaseSensitive(root, "upcomingGames");
  if (cJSON_IsArray(upcoming)) {
    const cJSON *g;
    cJSON_ArrayForEach(g, upcoming) {
      char court_id[KIOSK_MAX_ID_LEN];
      get_str(g, "id", court_id, sizeof(court_id));
      for (uint8_t i = 0; i < out->court_count; i++) {
        court_status_t *dst = &out->courts[i];
        if (dst->next_start_time != 0 || strcmp(dst->id, court_id) != 0) continue;
        get_str(g, "matchTitle", dst->next_match_title, sizeof(dst->next_match_title));
        dst->next_start_time = (time_t)get_num(g, "startTime");
        dst->next_duration_min = (int32_t)get_num(g, "durationMin");
        dst->next_is_scheduled = true;
        const cJSON *players = cJSON_GetObjectItemCaseSensitive(g, "players");
        if (cJSON_IsArray(players)) {
          const cJSON *p;
          cJSON_ArrayForEach(p, players) {
            if (dst->next_player_count >= KIOSK_MAX_PLAYERS) break;
            kiosk_player_name_t *pl = &dst->next_players[dst->next_player_count++];
            get_str(p, "firstName", pl->first_name, sizeof(pl->first_name));
            get_str(p, "lastName", pl->last_name, sizeof(pl->last_name));
          }
        }
        break;
      }
    }
  }

  /* queue */
  const cJSON *queue = cJSON_GetObjectItemCaseSensitive(root, "queue");
  if (cJSON_IsArray(queue)) {
    const cJSON *q;
    cJSON_ArrayForEach(q, queue) {
      if (out->queue_count >= KIOSK_MAX_QUEUE) break;
      queue_row_t *dst = &out->queue[out->queue_count++];
      get_str(q, "id", dst->id, sizeof(dst->id));
      get_str(q, "memberId", dst->member_id, sizeof(dst->member_id));
      dst->position = (int32_t)get_num(q, "position");
      get_str(q, "firstName", dst->first_name, sizeof(dst->first_name));
      get_str(q, "lastName", dst->last_name, sizeof(dst->last_name));
      get_str(q, "matchType", dst->match_type, sizeof(dst->match_type));
      get_str(q, "matchTitle", dst->match_title, sizeof(dst->match_title));
      get_str(q, "courtName", dst->court_name, sizeof(dst->court_name));
      dst->duration_min = (int32_t)get_num(q, "durationMin");
      get_str(q, "estimatedWait", dst->estimated_wait, sizeof(dst->estimated_wait));
      dst->estimated_start_time = (time_t)get_num(q, "estimatedStartTime");
      get_str(q, "simulatedCourtName", dst->simulated_court_name, sizeof(dst->simulated_court_name));
    }
  }

  /* A waiting entry is the authoritative Up next player. Prefer the first
   * queue row assigned to each court over the scheduled-games fallback. */
  for (uint8_t i = 0; i < out->court_count; i++) {
    court_status_t *court = &out->courts[i];
    for (uint8_t j = 0; j < out->queue_count; j++) {
      queue_row_t *q = &out->queue[j];
      const char *assigned = q->court_name[0] ? q->court_name : q->simulated_court_name;
      if (!assigned[0] || strcmp(assigned, court->name) != 0) continue;
      snprintf(court->next_match_title, sizeof(court->next_match_title), "%s", q->match_title);
      court->next_start_time = q->estimated_start_time;
      court->next_duration_min = q->duration_min;
      court->next_is_scheduled = false;
      court->next_player_count = 1;
      snprintf(court->next_players[0].first_name, KIOSK_MAX_NAME_LEN, "%s", q->first_name);
      snprintf(court->next_players[0].last_name, KIOSK_MAX_NAME_LEN, "%s", q->last_name);
      break;
    }
  }


  cJSON_Delete(root);
  return true;
}
