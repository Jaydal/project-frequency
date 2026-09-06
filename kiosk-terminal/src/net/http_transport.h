#pragma once

#include <stdbool.h>
#include <stddef.h>

/* Portable HTTP transport interface. The implementation is platform-specific:
 *   - simulator: libcurl        (src/hal_sim/sim_http_transport.c)
 *   - ESP32-S3:  esp_http_client (a future src/hal_esp32/ implementation)
 * so src/net/freq_rest_client.c never talks to a specific HTTP stack. */

typedef struct {
  const char *name;
  const char *value;
} http_header_t;

typedef struct {
  long status;     /* HTTP status code; 0 means the request never completed */
  char *body;      /* malloc'd, NUL-terminated response body; NULL if none   */
  size_t body_len;
} http_response_t;

/* Performs an HTTP request. `method` is "GET", "POST", "PATCH", etc.
 * `body` may be NULL (e.g. for GET). Returns true if the request completed
 * at the transport level (any HTTP status); false on connection failure.
 * On true, *out is filled and the caller must call http_response_free(out). */
bool http_transport_request(const char *method, const char *url,
                            const http_header_t *headers, size_t header_count,
                            const char *body, http_response_t *out);

void http_response_free(http_response_t *out);

/* Human-readable reason for the most recent transport-level failure. */
const char *http_transport_last_error(void);
