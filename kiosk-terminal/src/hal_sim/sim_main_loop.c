#include "sim_main_loop.h"
#include "sim_display.h"
#include "../net/relay.h"
#include "sim_input.h"
#include "../ui/ui_app.h"
#include "lvgl.h"
#include "sdl/sdl.h"
#include <SDL2/SDL.h>
#include <stdio.h>
#include <unistd.h>

/* Simulator-only test hook: the hardware reads UIDs from the NFC reader, but
 * the simulator has no reader, so keys 1-5 inject TEST001..TEST005 scans
 * (the API maps TEST-prefixed UIDs onto real active members). */
static void sim_poll_scan_keys(void) {
  static const SDL_Scancode codes[5] = {
    SDL_SCANCODE_1, SDL_SCANCODE_2, SDL_SCANCODE_3, SDL_SCANCODE_4, SDL_SCANCODE_5
  };
  static bool prev_down[5] = { false };

  SDL_PumpEvents();
  const Uint8 *state = SDL_GetKeyboardState(NULL);
  for (int i = 0; i < 5; i++) {
    bool down = state[codes[i]] != 0;
    if (down && !prev_down[i]) {
      char uid[16];
      snprintf(uid, sizeof(uid), "TEST%03d", i + 1);
      printf("[sim] RFID scan injected: %s\n", uid);
      ui_app_handle_scan(uid);
    }
    prev_down[i] = down;
  }
}

void sim_hal_init(void) {
  sdl_init();
  sim_display_init();
  relay_init();
  sim_input_init();
  printf("[sim] press keys 1-5 to simulate an RFID scan (TEST001..TEST005)\n");
}

void sim_main_loop_run(void) {
  const char *auto_scan = getenv("KIOSK_SIM_SCAN");
  uint32_t elapsed_ms = 0;
  bool auto_scan_done = !auto_scan;

  for (;;) {
    lv_timer_handler();
    sim_poll_scan_keys();

    if (!auto_scan_done) {
      elapsed_ms += 5;
      if (elapsed_ms >= 4000) {
        auto_scan_done = true;
        printf("[sim] auto RFID scan: %s\n", auto_scan);
        ui_app_handle_scan(auto_scan);
      }
    }

    usleep(5 * 1000);
  }
}
