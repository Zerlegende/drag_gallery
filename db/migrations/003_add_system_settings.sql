-- System Settings Tabelle für globale Einstellungen wie Wartungsmodus
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Wartungsmodus standardmäßig deaktiviert
INSERT INTO system_settings (key, value) 
VALUES ('maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;

-- Index für schnellere Lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);
