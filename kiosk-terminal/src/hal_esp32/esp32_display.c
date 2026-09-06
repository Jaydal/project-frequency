/*
 * esp32_display.c – HAL driver for the Waveshare ESP32-S3-Touch-LCD-7B
 *
 * Initialises:
 *   1. I2C master (GPIO8 SDA / GPIO9 SCL, 400 kHz)
 *   2. CH32V003 IO-expander at 0x24 (LCD power, backlight, touch reset)
 *   3. RGB parallel LCD panel (1024×600, RGB565, 16-bit data bus)
 *   4. LVGL display driver (direct-mode, double-buffered in PSRAM)
 *   5. GT911 capacitive touch controller + LVGL input device
 */

#include "esp32_display.h"

#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "esp_heap_caps.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_panel_rgb.h"
#include "esp_lcd_touch_gt911.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lvgl.h"

#include <string.h>

/* ── Constants ─────────────────────────────────────────────────────────── */

static const char *TAG = "display";

#define LCD_H_RES  1024
#define LCD_V_RES  600

/* I2C bus shared by IO-expander and touch controller. */
#define I2C_PORT        I2C_NUM_0
#define I2C_SDA_PIN     GPIO_NUM_8
#define I2C_SCL_PIN     GPIO_NUM_9
#define I2C_FREQ_HZ     100000

/* CH32V003 IO-expander I2C address (7-bit). */
#define IOEXP_ADDR      0x24

/* IO-expander register addresses (= EXIO pin numbers). */
#define EXIO_TP_RST     1   /* Touch reset   */
#define EXIO_DISP       2   /* Backlight     */
#define EXIO_LCD_VDD    6   /* LCD VDD enable */

/* RGB panel pin mapping (from Waveshare wiki). */
#define PIN_PCLK   GPIO_NUM_7
#define PIN_HSYNC  GPIO_NUM_46
#define PIN_VSYNC  GPIO_NUM_3
#define PIN_DE     GPIO_NUM_5

/* Touch controller. */
#define TOUCH_IRQ_PIN  GPIO_NUM_4

/* ── Statics ───────────────────────────────────────────────────────────── */

static esp_lcd_panel_handle_t s_panel = NULL;
static esp_lcd_touch_handle_t s_touch = NULL;
static i2c_master_bus_handle_t s_i2c_bus = NULL;
static i2c_master_dev_handle_t s_ioexp_dev = NULL;

static lv_disp_draw_buf_t s_draw_buf;
static lv_disp_drv_t      s_disp_drv;
static lv_indev_drv_t     s_indev_drv;

/* ── IO-expander helpers ───────────────────────────────────────────────── */

static uint8_t s_ioexp_out = 0xFF;

/* Write to a register on the CH32V003 IO-expander. */
static esp_err_t ioexp_write_reg(uint8_t reg, uint8_t value) {
  const uint8_t buf[2] = {reg, value};
  return i2c_master_transmit(s_ioexp_dev, buf, sizeof(buf), 100);
}

static void ioexp_set_pin(uint8_t pin, bool high) {
  if (high) {
      s_ioexp_out |= (1 << pin);
  } else {
      s_ioexp_out &= ~(1 << pin);
  }
  ioexp_write_reg(0x03, s_ioexp_out); // 0x03 is Output register
}

/* ── I2C bus init ──────────────────────────────────────────────────────── */

static void i2c_bus_init(void) {
  const i2c_master_bus_config_t cfg = {
      .i2c_port         = I2C_PORT,
      .sda_io_num       = I2C_SDA_PIN,
      .scl_io_num       = I2C_SCL_PIN,
      .clk_source       = I2C_CLK_SRC_DEFAULT,
      .glitch_ignore_cnt = 7,
      .flags.enable_internal_pullup = true,
  };
  ESP_ERROR_CHECK(i2c_new_master_bus(&cfg, &s_i2c_bus));

  const i2c_device_config_t ioexp_cfg = {
      .dev_addr_length = I2C_ADDR_BIT_LEN_7,
      .device_address = IOEXP_ADDR,
      .scl_speed_hz = I2C_FREQ_HZ,
  };
  ESP_ERROR_CHECK(i2c_master_bus_add_device(s_i2c_bus, &ioexp_cfg,
                                             &s_ioexp_dev));
  ESP_LOGI(TAG, "I2C master initialised on SDA=%d SCL=%d @ %d Hz",
           I2C_SDA_PIN, I2C_SCL_PIN, I2C_FREQ_HZ);
}

/* ── IO-expander init ──────────────────────────────────────────────────── */

static void ioexp_init(void) {
  /* Set all pins to output mode (register 0x02) */
  ESP_ERROR_CHECK(ioexp_write_reg(0x02, 0xFF));

  /* Initial state: all high */
  s_ioexp_out = 0xFF;
  ESP_ERROR_CHECK(ioexp_write_reg(0x03, s_ioexp_out));

  /* GT911 I2C address selection requires INT pin to be driven low/high during reset.
     We want 0x5D (which is default for esp_lcd_touch_gt911), so we drive INT low. */
  gpio_config_t int_cfg = {
      .pin_bit_mask = (1ULL << TOUCH_IRQ_PIN),
      .mode = GPIO_MODE_OUTPUT,
  };
  gpio_config(&int_cfg);

  /* Touch controller reset sequence (IO 1) */
  ioexp_set_pin(1, 0);               /* Reset LOW */
  vTaskDelay(pdMS_TO_TICKS(100));

  gpio_set_level(TOUCH_IRQ_PIN, 0);  /* INT LOW to select 0x5D */
  vTaskDelay(pdMS_TO_TICKS(100));

  ioexp_set_pin(1, 1);               /* Reset HIGH */
  vTaskDelay(pdMS_TO_TICKS(200));

  /* Revert INT pin to floating input for the touch driver to use */
  int_cfg.mode = GPIO_MODE_INPUT;
  gpio_config(&int_cfg);

  ESP_LOGI(TAG, "Touch controller reset complete (INT driven low for 0x5D)");

  /* LCD Power/Reset (IO 3) */
  ioexp_set_pin(3, 1);
  vTaskDelay(pdMS_TO_TICKS(20));

  /* Enable backlight (IO 2) */
  ioexp_set_pin(2, 1);
  ESP_LOGI(TAG, "LCD power and backlight enabled via IO expander");
}

/* ── RGB LCD panel ─────────────────────────────────────────────────────── */

static TaskHandle_t s_lvgl_task_handle = NULL;

void esp32_display_set_lvgl_task(TaskHandle_t handle) {
  s_lvgl_task_handle = handle;
}

static IRAM_ATTR bool lvgl_vsync_notify_cb(esp_lcd_panel_handle_t panel,
                                 const esp_lcd_rgb_panel_event_data_t *edata,
                                 void *user_ctx) {
  (void)panel;
  (void)edata;
  (void)user_ctx;
  BaseType_t need_yield = pdFALSE;
  if (s_lvgl_task_handle) {
      vTaskNotifyGiveFromISR(s_lvgl_task_handle, &need_yield);
  }
  return (need_yield == pdTRUE);
}

static void lcd_panel_init(void) {
  const esp_lcd_rgb_panel_config_t panel_cfg = {
      .clk_src = LCD_CLK_SRC_DEFAULT,
      .timings = {
          /* Use the panel vendor's required timing. Lowering this clock caused
           * the physical 7B panel to remain black. */
          .pclk_hz           = 30 * 1000 * 1000,
          .h_res              = LCD_H_RES,
          .v_res              = LCD_V_RES,
          .hsync_pulse_width  = 162,
          .hsync_back_porch   = 152,
          .hsync_front_porch  = 48,
          .vsync_pulse_width  = 45,
          .vsync_back_porch   = 13,
          .vsync_front_porch  = 3,
          .flags.pclk_active_neg = 1,
      },
      .data_width = 16,  /* RGB565 */
      .num_fbs    = 1,   /* Single-buffered to prevent strobe/tearing in direct mode */
      .bounce_buffer_size_px = LCD_H_RES * 10,
      .in_color_format = LCD_COLOR_FMT_RGB565,
      .out_color_format = LCD_COLOR_FMT_RGB565,
      .hsync_gpio_num  = PIN_HSYNC,
      .vsync_gpio_num  = PIN_VSYNC,
      .de_gpio_num     = PIN_DE,
      .pclk_gpio_num   = PIN_PCLK,
      .disp_gpio_num   = -1,  /* Backlight is via IO-expander, not GPIO */
      .data_gpio_nums  = {
          /* B3–B7 (bits 0–4 in the blue channel) */
          GPIO_NUM_14,  /* B3 */
          GPIO_NUM_38,  /* B4 */
          GPIO_NUM_18,  /* B5 */
          GPIO_NUM_17,  /* B6 */
          GPIO_NUM_10,  /* B7 */
          /* G2–G7 (bits 5–10 in RGB565) */
          GPIO_NUM_39,  /* G2 */
          GPIO_NUM_0,   /* G3 */
          GPIO_NUM_45,  /* G4 */
          GPIO_NUM_48,  /* G5 */
          GPIO_NUM_47,  /* G6 */
          GPIO_NUM_21,  /* G7 */
          /* R3–R7 (bits 11–15 in the red channel) */
          GPIO_NUM_1,   /* R3 */
          GPIO_NUM_2,   /* R4 */
          GPIO_NUM_42,  /* R5 */
          GPIO_NUM_41,  /* R6 */
          GPIO_NUM_40,  /* R7 */
      },
      .flags.fb_in_psram = true,
  };

  ESP_ERROR_CHECK(esp_lcd_new_rgb_panel(&panel_cfg, &s_panel));

  ESP_ERROR_CHECK(esp_lcd_panel_reset(s_panel));
  ESP_ERROR_CHECK(esp_lcd_panel_init(s_panel));
  ESP_LOGI(TAG, "RGB LCD panel initialised (%dx%d @ 30 MHz)",
           LCD_H_RES, LCD_V_RES);
}

/* ── LVGL display driver ───────────────────────────────────────────────── */

static void disp_flush_cb(lv_disp_drv_t *drv, const lv_area_t *area,
                            lv_color_t *color_p) {
  (void)area;
  (void)color_p;
  /* LVGL draws directly into the panel-owned PSRAM framebuffer. No second
   * full-screen copy is needed, which avoids competing with RGB scanout. */
  lv_disp_flush_ready(drv);
}

static void lvgl_display_init(void) {
  void *fb0 = NULL;
  ESP_ERROR_CHECK(esp_lcd_rgb_panel_get_frame_buffer(s_panel, 1, &fb0));

  /* Keep exactly one PSRAM framebuffer. The RGB driver scans it through its
   * internal-RAM bounce buffers while LVGL updates invalidated regions. */
  lv_disp_draw_buf_init(&s_draw_buf, fb0, NULL, LCD_H_RES * LCD_V_RES);

  lv_disp_drv_init(&s_disp_drv);
  s_disp_drv.hor_res    = LCD_H_RES;
  s_disp_drv.ver_res    = LCD_V_RES;
  s_disp_drv.flush_cb   = disp_flush_cb;
  s_disp_drv.draw_buf   = &s_draw_buf;
  s_disp_drv.direct_mode = 1;
  lv_disp_drv_register(&s_disp_drv);

  esp_lcd_rgb_panel_event_callbacks_t rgb_cbs = {
      /* Wake LVGL only at the real frame boundary.  Bounce-buffer completion
       * can fire several times during a frame and would reintroduce mid-scan
       * redraws when used as the render gate. */
      .on_vsync = lvgl_vsync_notify_cb,
  };
  ESP_ERROR_CHECK(esp_lcd_rgb_panel_register_event_callbacks(
      s_panel, &rgb_cbs, &s_disp_drv));

  ESP_LOGI(TAG, "LVGL display driver registered (full refresh, VSYNC-synced)");
}

/* ── Touch input ───────────────────────────────────────────────────────── */

static void touch_read_cb(lv_indev_drv_t *drv, lv_indev_data_t *data) {
  (void)drv;
  uint16_t x[1] = {0};
  uint16_t y[1] = {0};
  uint16_t strength[1] = {0};
  uint8_t  count = 0;

  static uint16_t last_x = 0;
  static uint16_t last_y = 0;
  static bool last_pressed = false;
  static bool actually_pressed = false;
  static uint32_t last_release_time = 0;

  /* Only poll GT911 via I2C if the INT pin is asserted (active LOW). 
   * This prevents false "releases" caused by polling between GT911 hardware scans. */
  if (gpio_get_level(TOUCH_IRQ_PIN) == 0) {
      esp_lcd_touch_read_data(s_touch);
      bool pressed = esp_lcd_touch_get_coordinates(s_touch, x, y,
                                                   strength, &count, 1);
      if (pressed && count > 0) {
        last_x = x[0];
        last_y = y[0];
        last_pressed = true;
        actually_pressed = true;
      } else {
        if (last_pressed) {
            last_release_time = xTaskGetTickCount();
            last_pressed = false;
        }
      }
  }

  /* Software debounce: wait 50ms before telling LVGL the touch was released */
  if (!last_pressed) {
      if ((xTaskGetTickCount() - last_release_time) * portTICK_PERIOD_MS > 50) {
          actually_pressed = false;
      }
  }

  data->point.x = last_x;
  data->point.y = last_y;
  data->state   = actually_pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;

}

static void touch_init(void) {
  /*
   * The GT911 helper macro predates ESP-IDF's I2C master implementation and
   * leaves scl_speed_hz at zero.  IDF 6.x validates this field when creating
   * the panel IO device, so explicitly use the bus frequency here.
   */
  esp_lcd_panel_io_i2c_config_t io_cfg =
      ESP_LCD_TOUCH_IO_I2C_GT911_CONFIG();
  io_cfg.scl_speed_hz = I2C_FREQ_HZ;

  esp_lcd_panel_io_handle_t io_handle = NULL;
  ESP_ERROR_CHECK(esp_lcd_new_panel_io_i2c(
      s_i2c_bus, &io_cfg, &io_handle));

  const esp_lcd_touch_config_t touch_cfg = {
      .x_max        = LCD_H_RES,
      .y_max        = LCD_V_RES,
      .rst_gpio_num = -1,  /* Reset handled by IO-expander, not direct GPIO */
      .int_gpio_num = TOUCH_IRQ_PIN,
      .levels = {
          .reset     = 0,
          .interrupt = 0,
      },
  };

  ESP_ERROR_CHECK(esp_lcd_touch_new_i2c_gt911(io_handle, &touch_cfg,
                                               &s_touch));
  
  /* GT911 INT pin is open-drain, requires a pull-up to prevent floating LOW reads */
  gpio_set_pull_mode(TOUCH_IRQ_PIN, GPIO_PULLUP_ONLY);

  ESP_LOGI(TAG, "GT911 touch controller initialised");

  /* Register LVGL input device. */
  lv_indev_drv_init(&s_indev_drv);
  s_indev_drv.type    = LV_INDEV_TYPE_POINTER;
  s_indev_drv.read_cb = touch_read_cb;
  s_indev_drv.scroll_limit = 50;  /* Require 50px of movement before scrolling, prevents jitter clicks */
  s_indev_drv.scroll_throw = 10;  /* Reduce scroll momentum */
  lv_indev_drv_register(&s_indev_drv);

  ESP_LOGI(TAG, "LVGL touch input device registered");
}

/* ── Public API ────────────────────────────────────────────────────────── */

void esp32_display_init(void) {
  i2c_bus_init();
  ioexp_init();
  lcd_panel_init();
  lvgl_display_init();
  touch_init();

  ESP_LOGI(TAG, "Display subsystem fully initialised");
}
