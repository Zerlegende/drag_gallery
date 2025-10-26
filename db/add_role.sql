-- Füge role-Spalte zu users hinzu
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Setze ersten User als admin (passe den username an!)
UPDATE users SET role = 'admin' WHERE username = 'admin';

-- Index für Performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
