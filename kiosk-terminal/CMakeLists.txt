if(DEFINED ENV{IDF_PATH})
    cmake_minimum_required(VERSION 3.16)
    include($ENV{IDF_PATH}/tools/cmake/project.cmake)
    project(kiosk_terminal)
    return()
endif()

cmake_minimum_required(VERSION 3.16)
project(kiosk_terminal C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

find_package(PkgConfig REQUIRED)
pkg_check_modules(SDL2 REQUIRED sdl2)
pkg_check_modules(CURL REQUIRED libcurl)
pkg_check_modules(MOSQUITTO REQUIRED libmosquitto)

include(FetchContent)

# Tells lvgl's own CMakeLists.txt (env_support/cmake/custom.cmake) where to
# find lv_conf.h, so it adds our project root to its own PUBLIC include
# dirs — without this, LVGL's own .c files can't find lv_conf.h at all.
set(LV_CONF_PATH ${CMAKE_SOURCE_DIR}/lv_conf.h CACHE STRING "" FORCE)

FetchContent_Declare(
  lvgl
  GIT_REPOSITORY https://github.com/lvgl/lvgl.git
  GIT_TAG v8.2.0
)
FetchContent_Declare(
  lv_drivers
  GIT_REPOSITORY https://github.com/lvgl/lv_drivers.git
  GIT_TAG release/v8.2
)
# cJSON: download source only. SOURCE_SUBDIR points at a nonexistent dir so
# MakeAvailable skips cJSON's own CMakeLists (and its test targets); we compile
# the single cJSON.c straight into kiosk_sim. cJSON also ships with ESP-IDF,
# so this same freq_rest_client.c compiles unchanged on the ESP32-S3.
FetchContent_Declare(
  cjson
  GIT_REPOSITORY https://github.com/DaveGamble/cJSON.git
  GIT_TAG v1.7.18
  SOURCE_SUBDIR do-not-configure
)
FetchContent_MakeAvailable(lvgl lv_drivers cjson)

# lv_drivers' own sdl.c needs SDL2's headers/libs directly — its CMakeLists.txt
# only links against lvgl, so this doesn't come from anywhere else.
target_include_directories(lv_drivers PUBLIC ${SDL2_INCLUDE_DIRS})
target_link_directories(lv_drivers PUBLIC ${SDL2_LIBRARY_DIRS})
target_link_libraries(lv_drivers PUBLIC ${SDL2_LIBRARIES})
target_compile_options(lv_drivers PUBLIC ${SDL2_CFLAGS_OTHER})

add_executable(kiosk_sim
  src/main.c
  src/hal_sim/sim_display.c
  src/hal_sim/sim_input.c
  src/hal_sim/sim_main_loop.c
  src/hal_sim/sim_config_store.c
  src/hal_sim/sim_http_transport.c
  src/hal_sim/sim_mqtt_transport.c
  src/hal_sim/sim_wifi_scanner.c
  src/hal_sim/sim_pn532.c
  src/hal_sim/sim_nfc_reader.c
  src/net/freq_rest_client.c
  src/net/board_parser.c
  src/data/live/live_data_provider.c
  ${cjson_SOURCE_DIR}/cJSON.c
  src/ui/theme/kiosk_theme.c
  src/ui/widgets/court_status_card.c
  src/ui/widgets/queue_list.c
  src/ui/widgets/court_overview.c
  src/ui/widgets/booking_stepper.c
  src/ui/widgets/step_select_court.c
  src/ui/widgets/step_select_game_type.c
  src/ui/widgets/step_select_duration.c
  src/ui/widgets/step_booking_success.c
  src/ui/widgets/step_booking_confirm.c
  src/ui/widgets/step_error.c
  src/ui/screens/queue_board.c
  src/ui/screens/terminal_layout.c
  src/ui/screens/setup_screen.c
  src/ui/ui_app.c
)

target_include_directories(kiosk_sim PRIVATE
  ${CMAKE_SOURCE_DIR}
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_SOURCE_DIR}/src/net
  ${SDL2_INCLUDE_DIRS}
  ${CURL_INCLUDE_DIRS}
  ${MOSQUITTO_INCLUDE_DIRS}
  ${cjson_SOURCE_DIR}
)

target_compile_definitions(kiosk_sim PRIVATE LV_CONF_INCLUDE_SIMPLE)

target_link_libraries(kiosk_sim PRIVATE
  lvgl
  lv_drivers
  ${SDL2_LIBRARIES}
  ${CURL_LIBRARIES}
  ${MOSQUITTO_LIBRARIES}
)

target_compile_options(kiosk_sim PRIVATE ${SDL2_CFLAGS_OTHER} ${CURL_CFLAGS_OTHER} ${MOSQUITTO_CFLAGS_OTHER})
target_link_directories(kiosk_sim PRIVATE ${SDL2_LIBRARY_DIRS} ${CURL_LIBRARY_DIRS} ${MOSQUITTO_LIBRARY_DIRS})
