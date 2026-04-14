-- ============================================================
-- V805 – Grant CRUD permissions on shop and prepaid schemas
-- ============================================================

GRANT USAGE ON SCHEMA shop, prepaid TO ${app_db_user};

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA shop TO ${app_db_user};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA prepaid TO ${app_db_user};

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA shop TO ${app_db_user};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA prepaid TO ${app_db_user};

-- Default privileges so future tables/sequences are also covered
ALTER DEFAULT PRIVILEGES IN SCHEMA shop
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app_db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA prepaid
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app_db_user};

ALTER DEFAULT PRIVILEGES IN SCHEMA shop
    GRANT USAGE, SELECT ON SEQUENCES TO ${app_db_user};
ALTER DEFAULT PRIVILEGES IN SCHEMA prepaid
    GRANT USAGE, SELECT ON SEQUENCES TO ${app_db_user};
