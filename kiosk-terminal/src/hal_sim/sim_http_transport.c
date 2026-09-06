#include "../net/http_transport.h"
#include <curl/curl.h>
#include <stdlib.h>
#include <string.h>

/* Simulator HTTP transport: libcurl. Replaced by an esp_http_client-based
 * implementation of the same interface on real ESP32-S3 hardware. */

typedef struct {
  char *data;
  size_t len;
} buffer_t;

static size_t write_cb(char *ptr, size_t size, size_t nmemb, void *userdata) {
  size_t chunk = size * nmemb;
  buffer_t *buf = userdata;
  char *grown = realloc(buf->data, buf->len + chunk + 1);
  if (!grown) return 0;
  buf->data = grown;
  memcpy(buf->data + buf->len, ptr, chunk);
  buf->len += chunk;
  buf->data[buf->len] = '\0';
  return chunk;
}

bool http_transport_request(const char *method, const char *url,
                            const http_header_t *headers, size_t header_count,
                            const char *body, http_response_t *out) {
  out->status = 0;
  out->body = NULL;
  out->body_len = 0;

  CURL *curl = curl_easy_init();
  if (!curl) return false;

  buffer_t buf = { NULL, 0 };
  struct curl_slist *header_list = NULL;
  for (size_t i = 0; i < header_count; i++) {
    char line[256];
    snprintf(line, sizeof(line), "%s: %s", headers[i].name, headers[i].value);
    header_list = curl_slist_append(header_list, line);
  }

  curl_easy_setopt(curl, CURLOPT_URL, url);
  curl_easy_setopt(curl, CURLOPT_CUSTOMREQUEST, method);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_cb);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &buf);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT, 10L);
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
  if (header_list) curl_easy_setopt(curl, CURLOPT_HTTPHEADER, header_list);
  if (body) {
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)strlen(body));
  }

  CURLcode rc = curl_easy_perform(curl);
  bool ok = (rc == CURLE_OK);
  if (ok) {
    long status = 0;
    curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);
    out->status = status;
    out->body = buf.data;      /* may be NULL for empty body */
    out->body_len = buf.len;
  } else {
    free(buf.data);
  }

  if (header_list) curl_slist_free_all(header_list);
  curl_easy_cleanup(curl);
  return ok;
}

const char *http_transport_last_error(void) { return "transport failure"; }

void http_response_free(http_response_t *out) {
  if (out && out->body) {
    free(out->body);
    out->body = NULL;
    out->body_len = 0;
  }
}
