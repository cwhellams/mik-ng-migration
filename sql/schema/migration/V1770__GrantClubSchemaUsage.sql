-- V1550 introduced the club schema (club.ame_list) but never granted USAGE
-- on the schema itself to the application role, only table-level privileges.
-- Without schema USAGE, table grants are unusable — every query against
-- club.ame_list fails in production with "permission denied for schema club".
GRANT USAGE ON SCHEMA club TO ${app_db_user};
