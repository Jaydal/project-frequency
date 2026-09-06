CREATE TABLE IF NOT EXISTS public.controller_devices (
  device_id      TEXT PRIMARY KEY CHECK (device_id ~ '^[0-9a-f]{12}$|^simulator$'),
  device_type    TEXT NOT NULL CHECK (device_type IN ('kiosk', 'display')),
  court_id       TEXT REFERENCES public.courts(id) ON UPDATE CASCADE,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS controller_devices_enabled_idx
  ON public.controller_devices (device_id) WHERE enabled;

ALTER TABLE public.controller_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.controller_devices FROM anon, authenticated;

-- Deployment example (replace with real, normalized hardware IDs):
-- INSERT INTO public.controller_devices (device_id, device_type, court_id)
-- VALUES ('aabbccddeeff', 'display', 'court-1');
