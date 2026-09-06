#include "../net/relay.h"

#ifdef ESP_PLATFORM

#include "driver/gpio.h"
#include "esp_log.h"

#ifndef RELAY_GPIO
#define RELAY_GPIO    6
#endif
#define RELAY_BIT     (1ULL << RELAY_GPIO)

static const char *TAG = "relay";
static bool s_on = false;

void relay_init(void) {
  gpio_config_t io_conf = {
    .pin_bit_mask = RELAY_BIT,
    .mode = GPIO_MODE_OUTPUT,
    .pull_up_en = GPIO_PULLUP_DISABLE,
    .pull_down_en = GPIO_PULLDOWN_DISABLE,
    .intr_type = GPIO_INTR_DISABLE,
  };
  gpio_config(&io_conf);
  gpio_set_level(RELAY_GPIO, 0);
  s_on = false;
  ESP_LOGI(TAG, "initialized on GPIO %d (OFF)", RELAY_GPIO);
}

void relay_set(bool on) {
  if (s_on == on) return;
  s_on = on;
  gpio_set_level(RELAY_GPIO, on ? 1 : 0);
  ESP_LOGI(TAG, "relay → %s", on ? "ON" : "OFF");
}

bool relay_is_on(void) {
  return s_on;
}

#endif /* ESP_PLATFORM */
