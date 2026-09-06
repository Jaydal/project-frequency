#include "../net/http_transport.h"
#include <stdlib.h>
#include <string.h>

#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "esp_log.h"
#include "gts_root_r1.h"

/* ESP32-S3 HTTP transport: esp_http_client. Replaces the libcurl-based
 * simulator implementation (src/hal_sim/sim_http_transport.c). */

static const char *TAG = "http";
static char s_last_error[96] = "";

/* Growable buffer used to accumulate the response body. */
typedef struct {
  char *data;
  size_t len;
} buffer_t;

/* HTTP event handler — appends each chunk of incoming data to our buffer. */
static esp_err_t http_event_handler(esp_http_client_event_t *evt) {
  buffer_t *buf = (buffer_t *)evt->user_data;

  if (evt->event_id == HTTP_EVENT_ON_DATA) {
    if (evt->data_len == 0) return ESP_OK;

    char *grown = realloc(buf->data, buf->len + evt->data_len + 1);
    if (!grown) {
      ESP_LOGE(TAG, "realloc failed (%zu bytes)", buf->len + evt->data_len + 1);
      return ESP_ERR_NO_MEM;
    }
    buf->data = grown;
    memcpy(buf->data + buf->len, evt->data, evt->data_len);
    buf->len += evt->data_len;
    buf->data[buf->len] = '\0';
  }

  return ESP_OK;
}

/* Maps the portable method string ("GET", "POST", …) to the ESP-IDF enum. */
static esp_http_client_method_t method_from_string(const char *method) {
  if (strcmp(method, "POST")   == 0) return HTTP_METHOD_POST;
  if (strcmp(method, "PUT")    == 0) return HTTP_METHOD_PUT;
  if (strcmp(method, "PATCH")  == 0) return HTTP_METHOD_PATCH;
  if (strcmp(method, "DELETE") == 0) return HTTP_METHOD_DELETE;
  if (strcmp(method, "HEAD")   == 0) return HTTP_METHOD_HEAD;
  return HTTP_METHOD_GET;
}

bool http_transport_request(const char *method, const char *url,
                            const http_header_t *headers, size_t header_count,
                            const char *body, http_response_t *out) {
  out->status   = 0;
  out->body     = NULL;
  out->body_len = 0;
  s_last_error[0] = '\0';

  buffer_t buf = { NULL, 0 };

  esp_http_client_config_t config = {
    .url               = url,
    .method            = method_from_string(method),
    .timeout_ms        = 10000,
    .event_handler     = http_event_handler,
    .user_data         = &buf,
    .cert_pem          = FREQ_GTS_ROOT_R1,
  };

  esp_http_client_handle_t client = esp_http_client_init(&config);
  if (!client) {
    snprintf(s_last_error, sizeof(s_last_error), "%s", "ESP_ERR_HTTP_INIT");
    ESP_LOGE(TAG, "esp_http_client_init failed");
    return false;
  }

  /* Follow redirects (e.g. Vercel/Next.js may redirect API calls). */
  esp_http_client_set_redirection(client);

  /* Apply request headers. */
  for (size_t i = 0; i < header_count; i++) {
    esp_http_client_set_header(client, headers[i].name, headers[i].value);
  }

  /* Attach request body if supplied (e.g. POST / PATCH). */
  if (body) {
    esp_http_client_set_post_field(client, body, (int)strlen(body));
  }

  esp_err_t err = esp_http_client_perform(client);
  bool ok = (err == ESP_OK);

  if (ok) {
    out->status   = (long)esp_http_client_get_status_code(client);
    out->body     = buf.data;   /* may be NULL for empty body */
    out->body_len = buf.len;
  } else {
    snprintf(s_last_error, sizeof(s_last_error), "%s", esp_err_to_name(err));
    ESP_LOGE(TAG, "%s %s failed: %s", method, url, esp_err_to_name(err));
    free(buf.data);
  }

  esp_http_client_cleanup(client);
  return ok;
}

const char *http_transport_last_error(void) { return s_last_error; }

void http_response_free(http_response_t *out) {
  if (out && out->body) {
    free(out->body);
    out->body     = NULL;
    out->body_len = 0;
  }
}
