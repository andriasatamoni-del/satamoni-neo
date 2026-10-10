-- Runs once, when the pgdata volume is first created.
-- satamoni_neo (dev) is created by POSTGRES_DB. These are the throwaway databases the
-- integration tests use (names must contain "test"; see backend/test/safety/assert-disposable-db.js).
CREATE DATABASE satamoni_neo_test;
CREATE DATABASE satamoni_legacy_fixture_test;
