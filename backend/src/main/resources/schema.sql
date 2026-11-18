CREATE TABLE IF NOT EXISTS app_user (
    id INT PRIMARY KEY CHECK (id = 1),
    name VARCHAR(100) NOT NULL
);

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS avatar_seed VARCHAR(8);

CREATE TABLE IF NOT EXISTS search_favorite (
    item_id VARCHAR(64) PRIMARY KEY,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS search_recent (
    item_id VARCHAR(64) PRIMARY KEY,
    used_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS terminal_tab (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    number INT NOT NULL UNIQUE,
    active BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS terminal_transcript (
    tab_id BIGINT PRIMARY KEY REFERENCES terminal_tab (id) ON DELETE CASCADE,
    content CLOB NOT NULL
);

ALTER TABLE terminal_tab ADD COLUMN IF NOT EXISTS name VARCHAR(15);
ALTER TABLE terminal_tab ADD COLUMN IF NOT EXISTS cwd VARCHAR(1024);

CREATE TABLE IF NOT EXISTS saved_command (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    command VARCHAR(500) NOT NULL
);

CREATE TABLE IF NOT EXISTS app_seed (
    name VARCHAR(64) PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS service_folder (
    id INT PRIMARY KEY CHECK (id = 1),
    path VARCHAR(1024) NOT NULL
);

CREATE TABLE IF NOT EXISTS sgbd_connection (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    kind VARCHAR(16) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INT NOT NULL,
    username VARCHAR(200) NOT NULL,
    password VARCHAR(200) NOT NULL,
    database_name VARCHAR(64) NOT NULL,
    ssl_enabled BOOLEAN NOT NULL
);

ALTER TABLE sgbd_connection ADD COLUMN IF NOT EXISTS auto_ping BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE sgbd_connection ALTER COLUMN password VARCHAR(1024);
ALTER TABLE sgbd_connection ADD COLUMN IF NOT EXISTS selected BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE sgbd_connection ADD COLUMN IF NOT EXISTS show_all_schemas BOOLEAN DEFAULT TRUE NOT NULL;
ALTER TABLE sgbd_connection ADD COLUMN IF NOT EXISTS show_system_schemas BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE sgbd_connection ADD COLUMN IF NOT EXISTS selected_schemas CLOB DEFAULT '' NOT NULL;
ALTER TABLE sgbd_connection ADD COLUMN IF NOT EXISTS auto_ping_failures INT DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS docker_view_state (
    id INT PRIMARY KEY CHECK (id = 1),
    container_name VARCHAR(255),
    active_tab VARCHAR(16) NOT NULL,
    show_stopped BOOLEAN DEFAULT TRUE NOT NULL
);

ALTER TABLE docker_view_state ADD COLUMN IF NOT EXISTS show_stopped BOOLEAN DEFAULT TRUE NOT NULL;

CREATE TABLE IF NOT EXISTS activity_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(16) NOT NULL,
    tone VARCHAR(16) NOT NULL,
    message VARCHAR(500) NOT NULL,
    created_at VARCHAR(40) NOT NULL
);

CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON activity_log (created_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_snapshot (
    id INT PRIMARY KEY CHECK (id = 1),
    content CLOB NOT NULL,
    synced_at VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_resource_sample (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    captured_at VARCHAR(40) NOT NULL,
    memory_percent INT NOT NULL,
    disk_percent INT
);

CREATE INDEX IF NOT EXISTS dashboard_resource_sample_captured_at_idx
    ON dashboard_resource_sample (captured_at);

CREATE TABLE IF NOT EXISTS dashboard_institutional_banner (
    id INT PRIMARY KEY CHECK (id = 1),
    dismissed_on VARCHAR(10) NOT NULL,
    updated_at VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS sgbd_console (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    connection_id BIGINT NOT NULL REFERENCES sgbd_connection (id) ON DELETE CASCADE,
    label VARCHAR(40) NOT NULL,
    schema_name VARCHAR(64),
    query_text CLOB NOT NULL
);

ALTER TABLE sgbd_console ADD COLUMN IF NOT EXISTS editor_percent INT DEFAULT 60 NOT NULL;
ALTER TABLE sgbd_console ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE sgbd_console ADD COLUMN IF NOT EXISTS page_size INT DEFAULT 100 NOT NULL;
ALTER TABLE sgbd_console ADD COLUMN IF NOT EXISTS output_log CLOB DEFAULT '' NOT NULL;
ALTER TABLE sgbd_console ADD COLUMN IF NOT EXISTS saved_results CLOB DEFAULT '' NOT NULL;
ALTER TABLE sgbd_console ADD COLUMN IF NOT EXISTS results_minimized BOOLEAN DEFAULT TRUE NOT NULL;

CREATE TABLE IF NOT EXISTS sgbd_schema_cache (
    connection_id BIGINT PRIMARY KEY REFERENCES sgbd_connection (id) ON DELETE CASCADE,
    content CLOB NOT NULL,
    synced_at VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS sgbd_structure_cache (
    connection_id BIGINT PRIMARY KEY REFERENCES sgbd_connection (id) ON DELETE CASCADE,
    content CLOB NOT NULL,
    synced_at VARCHAR(40) NOT NULL
);
