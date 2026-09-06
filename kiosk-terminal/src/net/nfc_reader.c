#include "nfc_reader.h"
#include "driver/i2c_master.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "ui/ui_app.h"
#include <string.h>
#include <stdio.h>

#define POLL_MS      500
#define INIT_RETRY_MS 2000

static const char *TAG = "nfc_reader";
static bool s_online = false;
static i2c_master_bus_handle_t s_nfc_bus = NULL;
static i2c_master_dev_handle_t s_nfc_dev = NULL;

#define I2C_PORT     I2C_NUM_1
#define PIN_SDA      GPIO_NUM_43
#define PIN_SCL      GPIO_NUM_44
#define I2C_ADDR     0x28
#define I2C_FREQ_HZ  100000

#define REG_COMMAND      0x01
#define REG_COMIEN       0x02
#define REG_COMIRQ       0x04
#define REG_DIVIRQ       0x05
#define REG_ERROR        0x06
#define REG_STATUS1      0x07
#define REG_STATUS2      0x08
#define REG_FIFO_DATA    0x09
#define REG_FIFO_LEVEL   0x0A
#define REG_BIT_FRAMING  0x0D
#define REG_MODE         0x11
#define REG_TX_MODE      0x12
#define REG_RX_MODE      0x13
#define REG_TX_CONTROL   0x14
#define REG_TX_ASK       0x15
#define REG_RX_SEL       0x17
#define REG_CRC_RESULT_H 0x21
#define REG_CRC_RESULT_L 0x22
#define REG_RF_CFG       0x26
#define REG_T_MODE       0x2A
#define REG_T_PRESCALER  0x2B
#define REG_T_RELOAD_L   0x2C
#define REG_T_RELOAD_H   0x2D

#define CMD_IDLE         0x00
#define CMD_CALC_CRC     0x03
#define CMD_TRANSCEIVE   0x0C
#define CMD_SOFT_RESET   0x0F

#define MIFARE_REQA      0x26
#define MIFARE_ANTICOLL  0x93
#define MIFARE_SELECT    0x93

bool nfc_reader_is_online(void) {
    return s_online;
}

static void set_offline(void) {
    s_online = false;
}

static esp_err_t reg_write(uint8_t reg, uint8_t val) {
    uint8_t buf[2] = {reg, val};
    return i2c_master_transmit(s_nfc_dev, buf, 2, 10);
}

static esp_err_t reg_read(uint8_t reg, uint8_t *val) {
    return i2c_master_transmit_receive(s_nfc_dev, &reg, 1, val, 1, 10);
}

static bool transceive(const uint8_t *tx, uint8_t tx_len,
                       uint8_t *rx, uint8_t *rx_len, uint8_t rx_max,
                       uint8_t last_bits)
{
    if (reg_write(REG_COMMAND, CMD_IDLE) != ESP_OK) {
        return false;
    }
    reg_write(REG_FIFO_LEVEL, 0x80);
    reg_write(REG_COMIRQ, 0x7F);

    for (uint8_t i = 0; i < tx_len; i++) {
        reg_write(REG_FIFO_DATA, tx[i]);
    }

    reg_write(REG_BIT_FRAMING, last_bits & 0x0F);
    reg_write(REG_COMMAND, CMD_TRANSCEIVE);
    reg_write(REG_BIT_FRAMING, (last_bits & 0x0F) | 0x80);

    uint8_t irq = 0;
    bool success = false;
    for (int i = 0; i < 500; i++) {
        vTaskDelay(pdMS_TO_TICKS(1));
        if (reg_read(REG_COMIRQ, &irq) != ESP_OK) return false;
        if (irq & 0x30) { success = true; break; }
        if (irq & 0x01) return false;
        if (irq & 0x02) return false;
    }
    if (!success) return false;

    reg_write(REG_BIT_FRAMING, 0x00);

    uint8_t err;
    if (reg_read(REG_ERROR, &err) != ESP_OK) return false;
    if (err & 0x13) return false;

    uint8_t level;
    if (reg_read(REG_FIFO_LEVEL, &level) != ESP_OK) return false;
    if (level == 0) return false;

    if (level > rx_max) level = rx_max;
    for (uint8_t i = 0; i < level; i++) {
        if (reg_read(REG_FIFO_DATA, &rx[i]) != ESP_OK) return false;
    }
    *rx_len = level;
    return true;
}

static bool detect_card(void) {
    uint8_t reqa = MIFARE_REQA;
    uint8_t atqa[2];
    uint8_t rlen;
    uint8_t coll;
    if (reg_read(0x0E, &coll) == ESP_OK) {
        reg_write(0x0E, coll & 0x7F);
    }
    if (!transceive(&reqa, 1, atqa, &rlen, sizeof(atqa), 7)) return false;
    if (rlen < 2) return false;
    return true;
}

static bool calculate_crc(const uint8_t *data, size_t len, uint8_t *result) {
    reg_write(REG_COMMAND, CMD_IDLE);
    reg_write(REG_DIVIRQ, 0x04);
    reg_write(REG_FIFO_LEVEL, 0x80);
    for (size_t i = 0; i < len; i++) {
        reg_write(REG_FIFO_DATA, data[i]);
    }
    reg_write(REG_COMMAND, CMD_CALC_CRC);

    for (int i = 0; i < 100; i++) {
        uint8_t irq = 0;
        reg_read(REG_DIVIRQ, &irq);
        if (irq & 0x04) {
            reg_write(REG_COMMAND, CMD_IDLE);
            reg_read(REG_CRC_RESULT_L, &result[0]);
            reg_read(REG_CRC_RESULT_H, &result[1]);
            return true;
        }
        vTaskDelay(pdMS_TO_TICKS(1));
    }
    return false;
}

static bool read_card_uid(uint8_t *uid, uint8_t *uid_len) {
    uint8_t buf[16];
    uint8_t rlen;

    uint8_t anticoll[] = {MIFARE_ANTICOLL, 0x20};
    if (!transceive(anticoll, 2, buf, &rlen, sizeof(buf), 0)) return false;
    if (rlen < 5) return false;

    *uid_len = 0;
    for (int i = 0; i < 4; i++) {
        uid[(*uid_len)++] = buf[i];
    }

    uint8_t bcc = buf[0] ^ buf[1] ^ buf[2] ^ buf[3];
    uint8_t sel[9] = {MIFARE_SELECT, 0x70, buf[0], buf[1], buf[2], buf[3], bcc, 0, 0};
    if (!calculate_crc(sel, 7, &sel[7])) return false;
    if (!transceive(sel, 9, buf, &rlen, sizeof(buf), 0)) return false;

    if (rlen >= 1 && (buf[0] & 0x04) && *uid_len < 7) {
        uint8_t anticoll2[] = {0x95, 0x20};
        if (!transceive(anticoll2, 2, buf, &rlen, sizeof(buf), 0)) return false;
        if (rlen < 5) return false;
        for (int i = 0; i < 3; i++) {
            uid[(*uid_len)++] = buf[i];
        }
    }

    return *uid_len > 0;
}

static esp_err_t init_i2c_bus(void) {
    if (s_nfc_dev) return ESP_OK;
    const i2c_master_bus_config_t cfg = {
        .i2c_port         = I2C_PORT,
        .sda_io_num       = PIN_SDA,
        .scl_io_num       = PIN_SCL,
        .clk_source       = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    esp_err_t err = i2c_new_master_bus(&cfg, &s_nfc_bus);
    if (err != ESP_OK) return err;
    const i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = I2C_ADDR,
        .scl_speed_hz = I2C_FREQ_HZ,
    };
    err = i2c_master_bus_add_device(s_nfc_bus, &dev_cfg, &s_nfc_dev);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "i2c_master_bus_add_device failed: %s", esp_err_to_name(err));
        return err;
    }
    return ESP_OK;
}

static void reset_i2c_bus(void) {
    if (s_nfc_dev) {
        i2c_master_bus_rm_device(s_nfc_dev);
        s_nfc_dev = NULL;
    }
    if (s_nfc_bus) {
        i2c_del_master_bus(s_nfc_bus);
        s_nfc_bus = NULL;
    }
    gpio_reset_pin(PIN_SDA);
    gpio_reset_pin(PIN_SCL);
}

static void nfc_debug_scan_bus(void) {
    ESP_LOGI(TAG, "Scanning I2C_NUM_1 for devices...");
    for (uint8_t addr = 1; addr < 127; addr++) {
        esp_err_t r = i2c_master_probe(s_nfc_bus, addr, 10);
        if (r == ESP_OK) {
            ESP_LOGI(TAG, "  Found device at 0x%02X", addr);
        }
    }
    ESP_LOGI(TAG, "Scan complete");
}

static bool probe_chip(void) {
    if (!s_nfc_dev) return false;
    /* Keep the probe identical to the last known-good driver.  WS1850S
     * modules expose the MFRC522 register map, but a register read is not a
     * reliable presence test on every firmware revision; a raw I2C read is. */
    uint8_t dummy = 0;
    esp_err_t err = i2c_master_receive(s_nfc_dev, &dummy, 1, 10);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "WS1850S probe at 0x%02X failed: %s", I2C_ADDR,
                 esp_err_to_name(err));
    }
    return err == ESP_OK;
}

static bool init_chip(void) {
    if (reg_write(REG_COMMAND, CMD_SOFT_RESET) != ESP_OK) return false;
    vTaskDelay(pdMS_TO_TICKS(150));

    uint8_t v;
    if (reg_read(REG_TX_CONTROL, &v) != ESP_OK) return false;

    reg_write(REG_T_MODE,      0x80);
    reg_write(REG_T_PRESCALER, 0xA9);
    reg_write(REG_T_RELOAD_L,  0xE8);
    reg_write(REG_T_RELOAD_H,  0x03);
    reg_write(REG_TX_MODE,     0x00);
    reg_write(REG_RX_MODE,     0x00);
    reg_write(REG_TX_ASK,      0x40);
    reg_write(REG_MODE,        0x3D);
    reg_write(REG_RX_SEL,      0x86);
    reg_write(REG_RF_CFG,      0x77);

    if (reg_read(REG_TX_CONTROL, &v) != ESP_OK ||
        reg_write(REG_TX_CONTROL, v | 0x03) != ESP_OK) return false;
    ESP_LOGI(TAG, "WS1850S initialised on UART2 header I2C pins SDA=%d SCL=%d addr=0x%02X",
             PIN_SDA, PIN_SCL, I2C_ADDR);
    return true;
}

static void reader_task(void *arg) {
    (void)arg;
    ESP_LOGI(TAG, "NFC reader task started");

    uint8_t uid[10];
    uint8_t uid_len;
    int init_fails = 0;
    uint32_t last_scan = 0;

    while (1) {
        if (!probe_chip()) {
            init_fails++;
            ESP_LOGE(TAG, "WS1850S probe failed (%d/5)", init_fails);
            if (init_fails >= 5) {
                ESP_LOGW(TAG, "Reinitialising WS1850S device handle");
                reset_i2c_bus();
                init_i2c_bus();
                init_fails = 0;
            }
            vTaskDelay(pdMS_TO_TICKS(INIT_RETRY_MS));
            continue;
        }
        init_fails = 0;

        if (!init_chip()) {
            vTaskDelay(pdMS_TO_TICKS(INIT_RETRY_MS));
            continue;
        }

        s_online = true;
        init_fails = 0;

        while (1) {
            vTaskDelay(pdMS_TO_TICKS(POLL_MS));

            if (detect_card()) {
                init_fails = 0;
                s_online = true;

                if (read_card_uid(uid, &uid_len)) {
                    uint32_t now = xTaskGetTickCount() * portTICK_PERIOD_MS;
                    if (now - last_scan > 3000) {
                        char hex[32] = {0};
                        for (int i = 0; i < uid_len; i++) {
                            sprintf(&hex[i * 2], "%02X", uid[i]);
                        }
                        ESP_LOGI(TAG, "Scanned: %s", hex);
                        ui_app_handle_scan(hex);
                        last_scan = now;
                    }
                }
            } else {
                uint8_t dummy;
                if (reg_read(REG_STATUS1, &dummy) != ESP_OK) {
                    init_fails++;
                    if (init_fails >= 5) {
                        ESP_LOGE(TAG, "WS1850S I2C lost! Attempting recovery...");
                        set_offline();
                        break;
                    }
                } else {
                    init_fails = 0;
                }
            }
        }
    }
}

void nfc_reader_start(void) {
    ESP_LOGI(TAG, "Starting M5Unit-RFID reader on I2C_NUM_1 (SDA=43, SCL=44)");
    esp_err_t err = init_i2c_bus();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "I2C bus init failed, reader will be unavailable");
    } else {
        nfc_debug_scan_bus();
    }
    xTaskCreate(reader_task, "nfc_reader", 8192, NULL, 4, NULL);
}
