#pragma once

#include <stdbool.h>

/* Portable relay interface. Controls the court lights relay via GPIO. */

void relay_init(void);
void relay_set(bool on);
bool relay_is_on(void);
