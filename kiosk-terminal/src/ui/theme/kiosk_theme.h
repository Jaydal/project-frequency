#pragma once

#include "lvgl.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* Palette ported from the real web terminal's Tailwind classes
 * (zinc/emerald/amber/red), so the simulator visually matches it. */

#define KIOSK_MIN_TOUCH_PX     56
#define KIOSK_PRIMARY_TOUCH_PX 64

/* Translucency levels for the frosted-glass queue panel and its rows. */
#define KIOSK_GLASS_PANEL_OPA  LV_OPA_50
#define KIOSK_GLASS_ROW_OPA    LV_OPA_60

/* Booking-form panels sit over the brand watermark: translucent enough to let
 * it read through, opaque enough to keep body text legible. */
#define KIOSK_GLASS_FORM_OPA   LV_OPA_80
#define KIOSK_WATERMARK_OPA    LV_OPA_60

#define KIOSK_COLOR_BLACK           lv_color_hex(0x000000)
#define KIOSK_COLOR_WHITE           lv_color_hex(0xffffff)
#define KIOSK_COLOR_ZINC_950        lv_color_hex(0x09090b)
#define KIOSK_COLOR_ZINC_900        lv_color_hex(0x18181b)
#define KIOSK_COLOR_ZINC_800        lv_color_hex(0x27272a)
#define KIOSK_COLOR_ZINC_700        lv_color_hex(0x3f3f46)
#define KIOSK_COLOR_ZINC_600        lv_color_hex(0x52525b)
#define KIOSK_COLOR_ZINC_500        lv_color_hex(0x71717a)
#define KIOSK_COLOR_ZINC_400        lv_color_hex(0xa1a1aa)
#define KIOSK_COLOR_ZINC_300        lv_color_hex(0xd4d4d8)
#define KIOSK_COLOR_ZINC_200        lv_color_hex(0xe4e4e7)
#define KIOSK_COLOR_ZINC_100        lv_color_hex(0xf4f4f5)

#define KIOSK_COLOR_EMERALD_400     lv_color_hex(0x34d399)
#define KIOSK_COLOR_EMERALD_500     lv_color_hex(0x10b981)
#define KIOSK_COLOR_BLUE_400        lv_color_hex(0x60a5fa)
#define KIOSK_COLOR_BLUE_500        lv_color_hex(0x3b82f6)
#define KIOSK_COLOR_AMBER_400       lv_color_hex(0xfbbf24)
#define KIOSK_COLOR_AMBER_500       lv_color_hex(0xf59e0b)
#define KIOSK_COLOR_RED_400         lv_color_hex(0xf87171)
#define KIOSK_COLOR_RED_500         lv_color_hex(0xef4444)

/* Call once at startup, before creating any screens. */
void kiosk_theme_init(void);

/* Call to switch between light and dark modes dynamically. */
void kiosk_theme_set_mode(bool is_dark);
bool kiosk_theme_is_dark(void);

/* Dynamic color getters for widgets */
lv_color_t kiosk_theme_color_bg(void);
lv_color_t kiosk_theme_color_panel(void);
lv_color_t kiosk_theme_color_text(void);
lv_color_t kiosk_theme_color_text_muted(void);
lv_color_t kiosk_theme_color_text_strong(void);
lv_color_t kiosk_theme_color_border(void);
lv_color_t kiosk_theme_color_primary(void);
lv_color_t kiosk_theme_color_success(void);
lv_color_t kiosk_theme_color_warning(void);
lv_color_t kiosk_theme_color_danger(void);

/* Helpers for complex widgets to prevent flickering and apply dynamic colors */
void kiosk_theme_style_keyboard(lv_obj_t *kb);
void kiosk_theme_style_modal_ta(lv_obj_t *ta);
void kiosk_theme_disable_transitions(lv_obj_t *obj);

/* Card left-border-accent variants (mirrors CourtStatusCard's 3 states). */
extern lv_style_t kiosk_style_card_available;
extern lv_style_t kiosk_style_card_preparing;
extern lv_style_t kiosk_style_card_in_game;

/* Generic reusable styles. */
extern lv_style_t kiosk_style_screen_bg;     /* black/white full-bleed */
extern lv_style_t kiosk_style_panel_bg;      /* rounded panel */
extern lv_style_t kiosk_style_glass_bg;      /* translucent panel (content behind stays visible) */
extern lv_style_t kiosk_style_btn_primary;   /* action button, min touch size */
extern lv_style_t kiosk_style_btn_secondary; /* secondary button, min touch size */
extern lv_style_t kiosk_style_tile;          /* selectable tile (court/game/duration options) */

/* Formats seconds as "MM:SS" into buf (caller-owned, needs >= 6 bytes). */
void kiosk_format_time(char *buf, size_t buf_size, int32_t seconds);
