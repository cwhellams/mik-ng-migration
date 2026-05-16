-- Create mik_ng database (mirrors V10__CreateTestDb.sql with flyway:user resolved to admin)
CREATE DATABASE mik_ng
    WITH OWNER = admin
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    LOCALE_PROVIDER = 'libc'
    TEMPLATE = template0;

-- Create test user (mirrors V20__CreateTestUser.sql)
CREATE USER mik_app_test
    WITH PASSWORD 'test_pwd'
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION;
