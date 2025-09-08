-- Insert test data for secrets table
-- V110: SecretsTestData.sql

INSERT INTO public.secrets (secret_key, secret_value, created_by, updated_by)
VALUES 
  ('Club house key code', '1234567', 'k1mnimda', 'k1mnimda'),
  ('Hangar door code', '9876543', 'k1mnimda', 'k1mnimda'),
  ('WiFi password', 'MIK-Flying2024!', 'k1mnimda', 'k1mnimda'),
  ('Equipment locker combination', '15-25-35', 'k1mnimda', 'k1mnimda'),
  ('Fuel pump access code', '4455', 'k1mnimda', 'k1mnimda')
ON CONFLICT (secret_key) DO NOTHING;