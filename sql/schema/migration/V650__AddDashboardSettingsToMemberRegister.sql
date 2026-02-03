-- Add dashboard_settings column to member.register table
-- This column stores user preferences for dashboard component order and visibility
ALTER TABLE member.register
ADD COLUMN dashboard_settings JSONB DEFAULT NULL;

COMMENT ON COLUMN member.register.dashboard_settings IS 'User preferences for dashboard component order and visibility. Structure: {"components": [{"id": "weather", "visible": true, "order": 0}, ...]}';
