#include "lvgl.h"
#include "ui/ui_app.h"
#include "ui/screens/queue_board.h"
#include "net/freq_rest_client.h"
#include "ui/theme/kiosk_theme.h"
#include "ui/screens/setup_screen.h"
#include "ui/widgets/step_booking_confirm.h"
#include "ui/widgets/step_select_duration.h"
#include "ui/widgets/step_select_game_type.h"
#include "ui/widgets/step_select_court.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* This display records LVGL dirty pixels, without an SDL window or panel hardware. */
enum { WIDTH = 1024, HEIGHT = 600 };
static lv_color_t pixels[WIDTH * HEIGHT];
static lv_color_t resting[WIDTH * HEIGHT];
static lv_indev_t *pointer;
static lv_point_t point;
static lv_indev_state_t state;
static unsigned largest_redraw;

/* Setup displays a device ID. This headless test has no transport. */
void freq_device_id_get(char *out, size_t size) {
  snprintf(out, size, "TEST");
}

static void check(bool ok, const char *message) {
  if (!ok) { fprintf(stderr, "FAIL: %s\n", message); exit(1); }
}

static void flush(lv_disp_drv_t *drv, const lv_area_t *area, lv_color_t *buf) {
  (void)buf;
  (void)area;
  lv_disp_flush_ready(drv);
}

static void monitor(lv_disp_drv_t *drv, uint32_t elapsed, uint32_t dirty_pixels) {
  (void)drv;
  (void)elapsed;
  if (dirty_pixels > largest_redraw) largest_redraw = dirty_pixels;
}

static void read_pointer(lv_indev_drv_t *drv, lv_indev_data_t *data) {
  (void)drv;
  data->point = point;
  data->state = state;
}

static void sample(lv_point_t at, lv_indev_state_t next) {
  point = at;
  state = next;
  lv_tick_inc(32);
  lv_indev_read_timer_cb(pointer->driver->read_timer);
  lv_refr_now(NULL);
}

static lv_obj_t *find(lv_obj_t *root, const lv_obj_class_t *type, const char *label) {
  if (lv_obj_check_type(root, type) && (!label || strcmp(lv_label_get_text(root), label) == 0)) return root;
  for (uint32_t i = 0; i < lv_obj_get_child_cnt(root); i++) {
    lv_obj_t *match = find(lv_obj_get_child(root, i), type, label);
    if (match) return match;
  }
  return NULL;
}

static lv_point_t key_center(lv_obj_t *kb, const char *name) {
  lv_btnmatrix_t *matrix = (lv_btnmatrix_t *)kb;
  for (uint16_t i = 0; i < matrix->btn_cnt; i++) {
    if (strcmp(lv_btnmatrix_get_btn_text(kb, i), name) == 0) {
      const lv_area_t *a = &matrix->button_areas[i];
      return (lv_point_t){kb->coords.x1 + (a->x1 + a->x2) / 2,
                          kb->coords.y1 + (a->y1 + a->y2) / 2};
    }
  }
  check(false, "key missing from active map");
  return (lv_point_t){0, 0};
}

static void tap(lv_obj_t *kb, const char *name) {
  lv_point_t center = key_center(kb, name);
  sample(center, LV_INDEV_STATE_PRESSED);
  sample(center, LV_INDEV_STATE_RELEASED);
}

static void exercise(lv_obj_t *screen, bool setup) {
  lv_obj_t *field = find(screen, &lv_textarea_class, NULL);
  check(field != NULL, "keyboard field missing");
  lv_textarea_set_text(field, "");
  lv_obj_update_layout(screen);
  lv_obj_scroll_to_view_recursive(field, LV_ANIM_OFF);
  lv_refr_now(NULL);
  lv_area_t bounds = field->coords;
  lv_point_t field_center = {(bounds.x1 + bounds.x2) / 2, (bounds.y1 + bounds.y2) / 2};
  sample(field_center, LV_INDEV_STATE_PRESSED);
  check(!find(lv_scr_act(), &lv_btnmatrix_class, NULL), "opening the field moved the screen before release");
  sample(field_center, LV_INDEV_STATE_RELEASED);
  lv_obj_t *kb = find(lv_scr_act(), &lv_btnmatrix_class, NULL);
  check(kb != NULL, "keyboard did not open");
  lv_refr_now(NULL);
  lv_area_t initial = kb->coords;
  memcpy(resting, pixels, sizeof(pixels));
  largest_redraw = 0;

  lv_point_t q = key_center(kb, "q");
  sample(q, LV_INDEV_STATE_PRESSED);
  int changed = 0;
  for (int y = initial.y1; y <= initial.y2; y++)
    for (int x = initial.x1; x <= initial.x2; x++)
      changed += pixels[y * WIDTH + x].full != resting[y * WIDTH + x].full;
  printf("%s: press changed %d keyboard pixels, largest redraw %u pixels\n",
         setup ? "setup" : "match title", changed, largest_redraw);
  check(changed == 0, "keyboard repainted visibly on press");
  check(largest_redraw < lv_area_get_size(&initial), "a key press redrew the whole keyboard");

  /* One contact drifts into W and stays down beyond the repeat timeout. */
  lv_point_t w = key_center(kb, "w");
  for (int i = 0; i < 32; i++) sample(w, LV_INDEV_STATE_PRESSED);
  sample(w, LV_INDEV_STATE_RELEASED);
  tap(kb, "ABC");
  tap(kb, "Q");
  tap(kb, "123");
  tap(kb, "1");
  check(memcmp(&initial, &kb->coords, sizeof(initial)) == 0, "keyboard moved");
  tap(kb, "OK");
  check(strcmp(lv_textarea_get_text(field), "wQ1") == 0, "unexpected extra or missing input");
  sample(field_center, LV_INDEV_STATE_PRESSED);
  sample(field_center, LV_INDEV_STATE_RELEASED);
  kb = find(lv_scr_act(), &lv_btnmatrix_class, NULL);
  check(kb != NULL, "same field did not reopen");
  tap(kb, "q");
  tap(kb, "CANCEL");
  check(strcmp(lv_textarea_get_text(field), "wQ1") == 0, "cancel modified the field");
  lv_obj_del(screen);
}

static void selected_duration(void *user, int32_t minutes) {
  *(int *)user = minutes;
}

static void selected_game(void *user, game_type_t type) {
  *(int *)user = type == GAME_TYPE_2V2;
}

static void selected_court(void *user, const court_option_t *court) {
  *(int *)user = strcmp(court->id, "court-1") == 0;
}

static void tap_tile_label(lv_obj_t *screen, const char *text, int *selected, int expected) {
  lv_refr_now(NULL);
  lv_obj_t *label = find(screen, &lv_label_class, text);
  check(label != NULL, "tile label missing");
  lv_area_t initial = label->coords;
  lv_point_t at = {(initial.x1 + initial.x2) / 2, (initial.y1 + initial.y2) / 2};
  sample(at, LV_INDEV_STATE_PRESSED);
  printf("%s on press: delta (%d, %d)\n", text, label->coords.x1 - initial.x1,
         label->coords.y1 - initial.y1);
  check(*selected == 0 && memcmp(&initial, &label->coords, sizeof(initial)) == 0,
        "tile activated or moved on press");
  sample(at, LV_INDEV_STATE_RELEASED);
  check(*selected == expected, "tile label intercepted the tap");
  lv_obj_del(screen);
}

static void exercise_tiles(void) {
  int selected = 0;
  court_option_t court = {.id = "court-1", .name = "Court 1", .status = "Available"};
  lv_obj_t *screen = step_select_court_create(lv_scr_act(), "Player", 500,
      &court, 1, selected_court, NULL, NULL, &selected);
  tap_tile_label(screen, "Court 1", &selected, 1);
  selected = 0;
  screen = step_select_game_type_create(lv_scr_act(), "Player", 500,
      selected_game, NULL, NULL, NULL, NULL, &selected);
  tap_tile_label(screen, "2 vs 2", &selected, 1);
  selected = 0;
  kiosk_products_config_t products = {.duration_count = 1, .durations_min = {60}};
  screen = step_select_duration_create(lv_scr_act(), "Player", 500,
      &products, 2, false, selected_duration, NULL, NULL, NULL, NULL, &selected);
  tap_tile_label(screen, "60", &selected, 60);
}

extern kiosk_board_t fixture_board;
extern unsigned fixture_reads, fixture_joins, fixture_cancellations, fixture_ends;
extern uint32_t fixture_version;
extern bool fixture_nfc_online;

static void advance(unsigned ms) {
  lv_tick_inc(ms);
  lv_timer_handler();
  lv_refr_now(NULL);
}

static lv_obj_t *label_on(lv_obj_t *root, const char *text) {
  lv_obj_t *label = find(root, &lv_label_class, text);
  if (!label) fprintf(stderr, "Missing label: %s\n", text);
  check(label != NULL, "unexpected screen");
  return label;
}

static void tap_control(lv_obj_t *obj) {
  lv_area_t bounds = obj->coords;
  lv_point_t at = {(bounds.x1 + bounds.x2) / 2, (bounds.y1 + bounds.y2) / 2};
  check(at.x >= 0 && at.x < WIDTH && at.y >= 0 && at.y < HEIGHT, "control outside display");
  sample(at, LV_INDEV_STATE_PRESSED);
  if (lv_obj_is_valid(obj) && memcmp(&bounds, &obj->coords, sizeof(bounds))) {
    fprintf(stderr, "Pressed %s moved from (%d,%d) to (%d,%d)\n",
            lv_obj_check_type(obj, &lv_label_class) ? lv_label_get_text(obj) : "control",
            bounds.x1, bounds.y1, obj->coords.x1, obj->coords.y1);
  }
  check(lv_obj_is_valid(obj) && memcmp(&bounds, &obj->coords, sizeof(bounds)) == 0,
        "control moved or navigated before release");
  sample(at, LV_INDEV_STATE_RELEASED);
}
static void tap_label(const char *text) {
  tap_control(label_on(lv_scr_act(), text));
}
static void scan(const char *rfid) {
  ui_app_handle_scan(rfid);
  advance(1000);
}

static void count_delete(lv_event_t *event) {
  ++*(int *)lv_event_get_user_data(event);
}

static void exercise_navigation(void) {
  fixture_board.courts[1].start_time = time(NULL);
  fixture_board.courts[1].duration_min = 30;
  advance(1000);
  lv_obj_t *heading = label_on(lv_scr_act(), "QUEUE (0)");
  int idle_deletions = 0;
  lv_obj_add_event_cb(heading, count_delete, LV_EVENT_DELETE, &idle_deletions);
  largest_redraw = 0;
  advance(1000);
  printf("First idle heartbeat: %u invalidated pixels, %d heading deletions\n", largest_redraw, idle_deletions);
  int heartbeat_deletions = idle_deletions;
  fixture_reads = 0;
  advance(1000);
  unsigned reads = fixture_reads;
  printf("Board reads during a countdown tick: %u\n", reads);

  fixture_board.queue_count = 1;
  fixture_board.queue[0] = (queue_row_t){.first_name = "Ada", .last_name = "Test", .position = 1};
  ++fixture_version;
  int court_deletions = 0;
  lv_obj_add_event_cb(label_on(lv_scr_act(), "Court 2"), count_delete, LV_EVENT_DELETE, &court_deletions);
  largest_redraw = 0;
  advance(1000);
  label_on(lv_scr_act(), "Ada Test");
  unsigned queue_redraw = largest_redraw;
  int queue_changed_court = court_deletions;
  printf("Queue insertion: %u invalidated pixels, %d unaffected court deletions\n", queue_redraw, court_deletions);
  int row_deletions = 0;
  lv_obj_add_event_cb(label_on(lv_scr_act(), "Ada Test"), count_delete, LV_EVENT_DELETE, &row_deletions);
  fixture_board.queue_count = 2;
  fixture_board.queue[1] = (queue_row_t){.first_name = "Ben", .last_name = "Test", .position = 2};
  advance(1000);
  strcpy(fixture_board.queue[0].estimated_wait, "5 min");
  advance(1000);
  label_on(lv_scr_act(), "Wait: 5 min");
  check(!row_deletions, "appending another player or updating ETA rebuilt the first row");
  fixture_board.courts[0].start_time = time(NULL);
  fixture_board.courts[0].duration_min = 30;
  fixture_board.courts[0].prep_time_sec = 600;
  advance(1000);
  label_on(lv_scr_act(), "PREPARING · GAME");
  fixture_board.courts[0].start_time -= 601;
  advance(1000);
  label_on(lv_scr_act(), "IN GAME · GAME");
  check(!row_deletions && !court_deletions, "court update discarded an unrelated court or queue row");
  fixture_board.queue_count = 0;
  ++fixture_version;

  scan("queued");
  tap_label(LV_SYMBOL_TRASH " Cancel Queue");
  check(fixture_cancellations == 1, "cancel queue action missed");
  scan("playing");
  tap_label(LV_SYMBOL_STOP " End Game Early");
  check(fixture_ends == 1, "end game action missed");
  scan("invalid");
  tap_label("Try Again");
  scan("playing");
  tap_label("Done");
  scan("playing");
  tap_label(LV_SYMBOL_PLUS " Book Another Match");
  tap_label(LV_SYMBOL_CLOSE " Cancel");
  scan("member");

  int sidebar_deletions = 0;
  lv_obj_add_event_cb(label_on(lv_scr_act(), "COURTS"), count_delete, LV_EVENT_DELETE, &sidebar_deletions);
  tap_label("Court 1");
  tap_label(LV_SYMBOL_LEFT " Back to Court Selection");
  tap_label("Court 1");
  tap_label("2 vs 2");
  tap_label(LV_SYMBOL_LEFT " Back to Game Format");
  tap_label("2 vs 2");
  int unnecessary_deletions = sidebar_deletions;
  printf("Sidebar headings deleted across unchanged forward/back steps: %d\n", unnecessary_deletions);
  tap_label("60");
  tap_label(LV_SYMBOL_LEFT " Back");
  tap_label("60");
  tap_label("Confirm & Book Match");
  advance(65);
  label_on(lv_scr_act(), "Booking Confirmed");
  check(fixture_joins == 1, "booking was missed or duplicated");
  scan("member");
  tap_label(LV_SYMBOL_CLOSE " Cancel");
  label_on(lv_scr_act(), "QUEUE (0)");
  check(heartbeat_deletions == 0, "idle heartbeat rebuilt the screen");
  check(queue_redraw < WIDTH * HEIGHT && !queue_changed_court, "queue update repainted the full board");
  check(reads == 1, "timer tick fetched extra whole-board snapshots");
  check(unnecessary_deletions == 0, "unchanged sidebar was rebuilt during navigation");
}

void fixture_finish_scan(void);

static void swipe(lv_point_t from, lv_point_t to) {
  sample(from, LV_INDEV_STATE_PRESSED);
  for (int i = 1; i <= 8; ++i) {
    lv_point_t at = {from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8};
    sample(at, LV_INDEV_STATE_PRESSED);
  }
  sample(to, LV_INDEV_STATE_RELEASED);
}

static void swipe_list(lv_obj_t *list, const char *name) {
  lv_refr_now(NULL);
  lv_area_t bounds = list->coords;
  lv_point_t from = {bounds.x1 + 40, bounds.y2 - 30};
  lv_coord_t start = lv_obj_get_scroll_y(list);
  swipe(from, (lv_point_t){from.x, bounds.y1 + 30});
  lv_coord_t end = lv_obj_get_scroll_y(list);
  printf("%s scroll %d -> %d\n", name, start, end);
  check(end > start, "overflowing choices could not be reached by touch");
  advance(160);
  check(end == lv_obj_get_scroll_y(list) && !memcmp(&bounds, &list->coords, sizeof(bounds)),
        "list or surrounding page kept moving after release");
}

static void count_court_selection(void *user, const court_option_t *court) {
  check(!strcmp(court->name, "Court 8"), "swipe or tap selected the wrong court");
  ++*(int *)user;
}

static void exercise_overflow(void) {
  static kiosk_board_t board;
  court_option_t options[KIOSK_MAX_COURTS] = {0};
  board.court_count = KIOSK_MAX_COURTS;
  board.queue_count = KIOSK_MAX_QUEUE;
  for (unsigned i = 0; i < board.court_count; ++i) {
    snprintf(board.courts[i].name, sizeof(board.courts[i].name), "Court %u", i + 1);
    snprintf(options[i].name, sizeof(options[i].name), "Court %u", i + 1);
    strcpy(options[i].status, "Available");
  }
  for (unsigned i = 0; i < board.queue_count; ++i) board.queue[i].position = i + 1;
  queue_board_view_t view;
  lv_obj_t *screen = queue_board_create(lv_scr_act(), &board, &view);
  static kiosk_board_t previous;
  previous = board;
  lv_obj_t *indicator = lv_obj_get_child(lv_obj_get_child(screen, 0), 0);
  fixture_nfc_online = true;
  queue_board_update(&view, &previous, &board);
  check(lv_obj_get_style_bg_color(indicator, 0).full == kiosk_theme_color_success().full,
        "NFC indicator did not follow reader state");
  swipe_list(view.court_column, "idle courts");
  swipe_list(view.queue_list, "idle queue");
  lv_obj_del(screen);
  int selected = 0;
  screen = step_select_court_create(lv_scr_act(), "Member", 500, options, board.court_count,
                                   count_court_selection, NULL, NULL, &selected);
  lv_obj_t *label = label_on(screen, "Court 8");
  lv_obj_t *tile = label;
  while (!lv_obj_check_type(tile, &lv_btn_class)) tile = lv_obj_get_parent(tile);
  swipe_list(lv_obj_get_parent(tile), "court selection");
  check(selected == 0 && lv_obj_is_visible(label), "court swipe selected a tile or hid last court");
  tap_control(label);
  check(selected == 1, "last court tap missed");
  selected = 0;
  lv_obj_del(screen);
  kiosk_products_config_t cfg = {.duration_count = 8, .durations_min = {10,20,30,40,50,60,70,80}};
  screen = step_select_duration_create(lv_scr_act(), "Member", 500, &cfg, 2, false,
                                      selected_duration, NULL, NULL, NULL, NULL, &selected);
  label = label_on(screen, "80");
  tile = label;
  while (!lv_obj_check_type(tile, &lv_btn_class)) tile = lv_obj_get_parent(tile);
  swipe_list(lv_obj_get_parent(tile), "duration selection");
  check(selected == 0, "swiping selected a duration");
  tap_control(label);
  check(selected == 80, "last duration was unreachable");
  lv_obj_del(screen);
}

static void exercise_network_dialog(void) {
  lv_obj_t *setup = setup_screen_create(lv_scr_act(), NULL, NULL);
  lv_refr_now(NULL);
  tap_label("Scan");
  lv_obj_t *box = find(lv_layer_top(), &lv_msgbox_class, NULL);
  check(box != NULL, "network dialog did not open");
  tap_control(lv_msgbox_get_close_btn(box));
  check(find(lv_layer_top(), &lv_msgbox_class, NULL) == NULL, "network dialog did not close");
  fixture_finish_scan();
  advance(120);
  tap_label("Scan");
  fixture_finish_scan();
  advance(120);
  box = find(lv_layer_top(), &lv_msgbox_class, NULL);
  lv_obj_t *list = find(box, &lv_list_class, NULL);
  lv_area_t bounds = list->coords;
  lv_point_t at = {(bounds.x1 + bounds.x2) / 2, bounds.y2 - 18};
  swipe(at, (lv_point_t){at.x, bounds.y1 + 16});
  lv_coord_t offset = lv_obj_get_scroll_y(list);
  check(offset > 0, "Wi-Fi results did not scroll");
  advance(120);
  printf("Wi-Fi list scroll %d -> %d after release, top %d -> %d\n", offset, lv_obj_get_scroll_y(list), bounds.y1, list->coords.y1);
  check(offset == lv_obj_get_scroll_y(list) && !memcmp(&bounds, &list->coords, sizeof(bounds)),
        "Wi-Fi list drifted after release");
  for (int i = 0; i < 12; ++i) {
    char ssid[20];
    snprintf(ssid, sizeof(ssid), "Network %02d", i);
    lv_obj_t *label = label_on(list, ssid);
    if (label->coords.y1 < bounds.y1 || label->coords.y2 > bounds.y2) continue;
    tap_control(label);
    check(find(lv_layer_top(), &lv_msgbox_class, NULL) == NULL, "network selection did not close dialog");
    check(!strcmp(lv_textarea_get_text(find(setup, &lv_textarea_class, NULL)), ssid),
          "selected SSID did not reach setup field");
    break;
  }
  check(!find(lv_layer_top(), &lv_msgbox_class, NULL), "no visible selectable Wi-Fi result");
  tap_label("Defaults");
  check(!strlen(lv_textarea_get_text(find(setup, &lv_textarea_class, NULL))), "restore defaults missed");
  tap_label("Save");
  tap_label("Scan");
  lv_obj_del(setup);
  fixture_finish_scan();
  advance(120);
  check(!find(lv_layer_top(), &lv_msgbox_class, NULL), "closing setup left a Wi-Fi modal");
  puts("Wi-Fi dismiss, late result, scroll, selection and setup exit passed");
}

int main(void) {
  lv_init();
  static lv_disp_draw_buf_t draw;
  static lv_disp_drv_t display;
  static lv_indev_drv_t input;
  lv_disp_draw_buf_init(&draw, pixels, NULL, WIDTH * HEIGHT);
  lv_disp_drv_init(&display);
  display.hor_res = WIDTH; display.ver_res = HEIGHT;
  display.monitor_cb = monitor;
  display.draw_buf = &draw; display.direct_mode = 1; display.flush_cb = flush;
  lv_disp_drv_register(&display);
  lv_indev_drv_init(&input);
  input.type = LV_INDEV_TYPE_POINTER; input.read_cb = read_pointer;
  pointer = lv_indev_drv_register(&input);
  ui_app_init();
  exercise_navigation();
  /* The app timer stays attached to its idle screen while widget tests run above it. */
  exercise_network_dialog();
  exercise_overflow();
  exercise(setup_screen_create(lv_scr_act(), NULL, NULL), true);
  char title[65] = "";
  exercise(step_booking_confirm_create(lv_scr_act(), "Player", 500, "Court", "Singles",
      60, 100, title, sizeof(title), false, false, NULL, NULL, NULL, NULL, NULL, NULL), false);
  exercise_tiles();
  puts("Kiosk navigation, live updates, scrolling, dialogs, keyboards and booking tiles passed");
  return 0;
}
