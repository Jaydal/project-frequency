# Kiosk Terminal — LVGL Touchscreen Client

Touchscreen kiosk application for the Freq pickleball court management system, built with **LVGL v8.2** in C. Supports both an interactive **PC simulator** (macOS / Linux via SDL2) and real **ESP32-S3 hardware** (Waveshare 7" Touch LCD + PN532 NFC reader).

The kiosk connects to HiveMQ Cloud over MQTT (topic `freq/board`) for live queue updates and communicates with the Next.js backend via HTTP REST (`freq_rest_client.c`) for member RFID lookups, bookings, and queue advancement.

---

## 1. PC Simulator (macOS / Linux)

The PC simulator allows instant testing of the entire UI, animations, and touch interactions on your development machine.

### Prerequisites
- CMake 3.16+
- C compiler (clang or gcc)
- SDL2 (`brew install sdl2` on macOS, or `sudo apt install libsdl2-dev` on Linux)

### Build & Run

```bash
cd kiosk-terminal
cmake -B build -S .
cmake --build build -j
./build/kiosk_sim
```

- A 1024×600 window will open.
- The simulator provides simulated RFID tap buttons (**T1–T5**) in test mode to simulate different member scenarios (sufficient credits, low balance, active offers, etc.).
- Long-press the top-left corner on the idle screen to access WiFi and connection settings.

---

## 2. ESP32-S3 Hardware Target

### Hardware Specifications
- **Board:** Waveshare ESP32-S3-Touch-LCD-7 (800×480 RGB LCD with capacitive touch)
- **NFC Reader:** PN532 NFC/RFID module
- **Display Configuration:** Single PSRAM framebuffer (`num_fbs = 1`) with LVGL direct mode (`direct_mode = 1`) to eliminate screen tearing and prevent Wi-Fi DMA buffer starvation.
- **Button Animations:** `LV_THEME_DEFAULT_GROW` is disabled in `lv_conf.h` to ensure smooth rendering on single-buffered displays.

### I2C / NFC Hardware Conflict & Wiring
The Waveshare 7" board has an internal screen touch controller (CH32V003) hardcoded at I2C address `0x24`. Connecting the PN532 NFC reader to the standard I2C header causes a hardware bus collision.

To resolve this, the PN532 is routed to **UART2** pins configured as a secondary I2C bus (`I2C_NUM_1`):
1. **DIP Switch:** Set the onboard switch labeled `UART selection` to **UART2** (isolates pins from the CP2102 chip).
2. **USB Port for Flashing:** Plug your USB-C cable into the **"USB"** port (ESP32 Native USB), NOT the UART port.
3. **Pin Connections:**
   - PN532 `SDA` → Board `UART2 TX` (GPIO 43)
   - PN532 `SCL` → Board `UART2 RX` (GPIO 44)
   - PN532 `VCC` → `5V`
   - PN532 `GND` → `GND`

### Build & Flash

#### 1. Initial USB Flash (One-Time)
Flashes the bootloader, dual-OTA partition table (`partitions.csv` with two 7MB slots), and starts the background OTA server on port 80:

```bash
cd kiosk-terminal
pio run -e waveshare-7b -t upload
pio device monitor -e waveshare-7b
```

#### 2. Wireless Local WiFi OTA (Subsequent Updates)
Once the kiosk is connected to the venue Wi-Fi, you can flash updates through the air:

- **Via Web Browser UI:**
  Open `http://<kiosk-ip>/update` in any browser on the venue Wi-Fi. Choose `.pio/build/waveshare-7b/firmware.bin` and click **Flash Firmware**. The page displays a real-time progress bar, flashes the inactive OTA partition, and automatically reboots the kiosk in 2 seconds.

- **Via PlatformIO:**
  ```bash
  pio run -e waveshare-7b-ota -t upload --upload-port 192.168.1.60
  ```

- **Via curl:**
  ```bash
  curl -f -X POST --data-binary @.pio/build/waveshare-7b/firmware.bin http://192.168.1.60/update
  ```

---

## Architecture & Code Organization

```
kiosk-terminal/
├── src/
│   ├── ui/             LVGL screens and components (portable C, no hardware references)
│   ├── net/            MQTT subscriber (`freq/board`) and HTTP REST client (`/api/*`)
│   ├── hal_sim/        SDL2 simulator display and input drivers
│   ├── hal_esp32/      ESP32-S3 RGB LCD, touch panel, and NVS configuration driver
│   ├── drivers/        PN532 NFC reader driver on secondary I2C bus (GPIO 43/44)
│   └── data/           Board model interfaces and mock providers
├── CMakeLists.txt      Simulator build configuration
└── platformio.ini      ESP32-S3 hardware build configuration
```

### Memory Safety & Event Cleanup
Dynamic memory allocated during UI transitions is freed cleanly using `LV_EVENT_DELETE` callbacks on parent containers to avoid memory leaks during extended unattended venue operation.
