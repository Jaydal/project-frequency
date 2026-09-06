#include "../net/relay.h"

#ifndef ESP_PLATFORM

#include <stdio.h>
#include <stdbool.h>

static bool s_on = false;

void relay_init(void) {
  s_on = false;
  printf("[relay] initialized (simulator, GPIO 6)\n");
}

void relay_set(bool on) {
  if (s_on == on) return;
  s_on = on;
  printf("[relay] → %s\n", on ? "ON" : "OFF");
}

bool relay_is_on(void) {
  return s_on;
}

#endif /* !ESP_PLATFORM */
