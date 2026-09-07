# Freq Court Display — HD-WF2 Firmware

Firmware for the **Huidu HD-WF2** LED controller (ESP32-S3 + HUB75 connector) driving physical P10 RGB LED scoreboards.

The HD-WF2 is a programmable ESP32-S3 board with a HUB75 connector, battery-backed RTC, and onboard status LED. We flash custom MQTT-driven firmware directly onto the board without proprietary vendor software.

---

## Hardware Specifications

| Component | Specification |
|---|---|
| Controller Board | Huidu HD-WF2 (ESP32-S3, 4MB Flash) |
| LED Panels | 2× P10 RGB panels, 32×16 pixels each, 1/16 scan (ABCDE), chained horizontally (64×16 total resolution) |
| Connector | `75EX1` port |
| Status LED | GPIO 40 (`RUN_LED`): solid = online; blinking (500ms) = searching for WiFi / MQTT |
| Factory Reset | GPIO 17 button (hold for 5 seconds to wipe NVS and start captive portal) |
| MQTT Broker | HiveMQ Cloud MQTTS (`port 8883` with TLS) |

---

## Pin Mapping (75EX1)

| Signal | GPIO | Signal | GPIO |
|---|---|---|---|
| R1 | 2 | A | 39 |
| G1 | 6 | B | 38 |
| B1 | 10 | C | 37 |
| R2 | 3 | D | 36 |
| G2 | 7 | E | 21 |
| B2 | 11 | LAT | 33 |
| OE | 35 | CLK | 34 |

---

## Display Architecture & MQTT Contract

The scoreboard functions as a thin client. It subscribes to topic:
`courts/{courtId}/display`

### Multi-Zone Playlist Payload
The Next.js publisher (`sports-caster.ts`) emits a JSON playlist payload containing rotation pages and multi-zone layout directives:

```json
{
  "display": {
    "brightness": 153,
    "rotation": 0,
    "pages": [
      {
        "durationSeconds": 8,
        "zones": [
          {
            "panelStart": 0,
            "panelEnd": 1,
            "lines": [
              { "text": "COURT 1", "color": "#00FF66", "effect": "STATIC" },
              { "text": "ALEX & SAM", "color": "#FFFFFF", "effect": "SCROLL" }
            ]
          }
        ]
      }
    ]
  }
}
```

### Rendering Features
- **Hardware DMA Double Buffering:** Uses `_matrix->flipDMABuffer()` to guarantee flicker-free text rendering.
- **Font & Formatting:** 5×7 custom bitmap font with support for bold, tracking/spacing, and special characters.
- **Superscript Time Format:** Text containing the `\x01` marker renders subsequent characters (e.g. `AM`/`PM`) in a compact superscript font.
- **Local Playlist Rotation:** Pages rotate automatically based on their individual `durationSeconds` timers without requiring network traffic between page flips.

---

## First-Time Setup (Captive Portal)

1. **Flash Firmware:** Flash the device via USB-C (labelled "type C" on the 75EX1 side).
2. **Setup Mode:** If no WiFi credentials exist in NVS flash:
   - Panel displays: `SETUP MODE / CONNECT TO FREQ WIFI`
   - LED blinks rapidly (200ms).
   - An open hotspot is broadcast: `Freq-Setup-XXXX` (last 4 of MAC).
3. **Configure:** Connect your phone or laptop to `Freq-Setup-XXXX`. The captive configuration portal will open at `http://192.168.4.1`.
4. **Save:** Enter the venue WiFi SSID/password, HiveMQ credentials, and target Court ID, then tap **Save & Reboot**.

### Factory Reset
Hold the onboard reset button (**GPIO 17**) for **5 seconds** to clear stored NVS settings and re-launch the captive portal.

---

## Build & Flash Commands

### 1. Initial USB Flash (One-Time)
Flashes the base firmware with dual-OTA partitioning (`min_spiffs.csv`) and activates the background ArduinoOTA listener on port 3232:

```bash
cd display-firmware

# Compile and flash via USB-C
pio run -e esp32-hub75-wf2 -t upload --upload-port /dev/cu.usbmodem*

# Serial monitor
pio device monitor -e esp32-hub75-wf2 --port /dev/cu.usbmodem*
```

### 2. Wireless Local WiFi OTA (Subsequent Updates)
Once the scoreboard is mounted above the court and connected to the venue WiFi, you can flash updates through the air without plugging in a USB cable:

```bash
# Upload wirelessly using the scoreboard's IP address:
pio run -e esp32-hub75-wf2-ota -t upload --upload-port 192.168.1.50

# Or using mDNS hostname:
pio run -e esp32-hub75-wf2-ota -t upload --upload-port freq-display-c1.local
```

- **Authentication:** Configured with password `freq123` (override via `-D OTA_PASSWORD=\"your-secret\"`).
- **Screen Protection:** During OTA transfer, the firmware automatically pauses the LED DMA matrix to eliminate screen tearing and DMA memory collisions, writes to the inactive flash slot, and reboots cleanly.

> [!IMPORTANT]
> **Boot Freeze Prevention:** The firmware explicitly calls `WiFi.mode(WIFI_OFF); delay(100);` prior to initializing the HUB75 DMA matrix to prevent ESP32-S3 DMA memory bus lockups.