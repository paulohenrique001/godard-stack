CREATE TABLE app_user (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    avatar_seed TEXT,
    email TEXT,
    language TEXT
);

CREATE TABLE app_preference (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    theme TEXT NOT NULL DEFAULT 'system',
    last_page TEXT NOT NULL DEFAULT 'dashboard',
    refresh_seconds INTEGER NOT NULL DEFAULT 30,
    notifications_read_id INTEGER NOT NULL DEFAULT 0,
    motion TEXT NOT NULL DEFAULT 'system' CHECK (motion IN ('system', 'reduce', 'full')),
    local_diagnostics_enabled INTEGER NOT NULL DEFAULT 0 CHECK (local_diagnostics_enabled IN (0, 1))
);

INSERT INTO app_preference (id) VALUES (1);

CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    tone TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX activity_log_created_at_idx ON activity_log (created_at DESC);

CREATE TABLE service_folder (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    path TEXT NOT NULL
);

CREATE TABLE local_diagnostic_event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'update_check',
        'update_available',
        'update_install_started',
        'update_install_completed',
        'update_error'
    )),
    app_version TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX local_diagnostic_event_created_at_idx ON local_diagnostic_event (created_at DESC);

CREATE TABLE terminal_permission (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    accepted_at TEXT NOT NULL
);

CREATE TABLE terminal_tab (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
    name TEXT,
    cwd TEXT
);

CREATE TABLE terminal_transcript (
    tab_id INTEGER PRIMARY KEY REFERENCES terminal_tab (id) ON DELETE CASCADE,
    content TEXT NOT NULL
);

CREATE TABLE saved_command (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command TEXT NOT NULL
);

INSERT INTO saved_command (command) VALUES ('ls -la');
INSERT INTO saved_command (command) VALUES ('df -h');
INSERT INTO saved_command (command) VALUES ('top');

CREATE TABLE sgbd_connection (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('mariadb', 'mysql', 'redis')),
    host TEXT NOT NULL,
    port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
    username TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    database_name TEXT NOT NULL DEFAULT '',
    ssl_enabled INTEGER NOT NULL DEFAULT 0 CHECK (ssl_enabled IN (0, 1)),
    selected INTEGER NOT NULL DEFAULT 0 CHECK (selected IN (0, 1)),
    auto_ping INTEGER NOT NULL DEFAULT 0 CHECK (auto_ping IN (0, 1)),
    show_all_schemas INTEGER NOT NULL DEFAULT 1 CHECK (show_all_schemas IN (0, 1)),
    show_system_schemas INTEGER NOT NULL DEFAULT 0 CHECK (show_system_schemas IN (0, 1)),
    selected_schemas TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX sgbd_connection_selected_idx ON sgbd_connection (selected) WHERE selected = 1;

CREATE TABLE sgbd_console (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_id INTEGER NOT NULL REFERENCES sgbd_connection(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    database_name TEXT NOT NULL DEFAULT '',
    query_text TEXT NOT NULL DEFAULT '',
    editor_percent INTEGER NOT NULL DEFAULT 50 CHECK (editor_percent BETWEEN 30 AND 70),
    active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
    output_log TEXT NOT NULL DEFAULT '',
    saved_result TEXT NOT NULL DEFAULT '',
    results_minimized INTEGER NOT NULL DEFAULT 1 CHECK (results_minimized IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX sgbd_console_connection_idx ON sgbd_console (connection_id, id);
CREATE UNIQUE INDEX sgbd_console_active_idx ON sgbd_console (connection_id) WHERE active = 1;

CREATE TABLE docker_view_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    container_name TEXT,
    active_tab TEXT NOT NULL DEFAULT 'logs' CHECK (active_tab IN ('logs', 'compose', 'env', 'shell', 'output')),
    show_stopped INTEGER NOT NULL DEFAULT 1 CHECK (show_stopped IN (0, 1))
);

INSERT INTO docker_view_state (id) VALUES (1);

CREATE TABLE todo_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX todo_item_open_created_at_idx ON todo_item (completed_at, created_at DESC);

CREATE TABLE api_client_collection (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE api_client_folder (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES api_client_collection(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES api_client_folder(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX api_client_folder_collection_parent_idx
    ON api_client_folder (collection_id, parent_id, sort_order, name);

CREATE TABLE api_client_request (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER REFERENCES api_client_collection(id) ON DELETE CASCADE,
    folder_id INTEGER REFERENCES api_client_folder(id) ON DELETE SET NULL,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
    payload_encrypted TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX api_client_request_collection_folder_idx
    ON api_client_request (collection_id, folder_id, sort_order, name);

CREATE TABLE api_client_view_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    open_request_ids TEXT NOT NULL DEFAULT '[]',
    active_request_id INTEGER
);

INSERT INTO api_client_view_state (id) VALUES (1);

CREATE TABLE api_client_collection_variable (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES api_client_collection(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    value TEXT NOT NULL DEFAULT '' CHECK (length(value) <= 4096),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (collection_id, name)
);

CREATE INDEX api_client_variable_collection_idx
    ON api_client_collection_variable (collection_id, sort_order, name);

CREATE TABLE todo_project (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    icon TEXT NOT NULL DEFAULT '📁' CHECK (length(icon) BETWEEN 1 AND 64),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 3 AND 100),
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE todo_label (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES todo_project(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 50),
    color TEXT NOT NULL CHECK (length(color) = 7),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
    created_at TEXT NOT NULL
);

CREATE INDEX todo_label_project_idx ON todo_label (project_id, sort_order);

CREATE TABLE todo_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES todo_project(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL UNIQUE REFERENCES todo_label(id) ON DELETE CASCADE,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX todo_list_project_idx ON todo_list (project_id);

CREATE TABLE todo_page (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES todo_project(id) ON DELETE CASCADE,
    icon TEXT NOT NULL DEFAULT '📄' CHECK (length(icon) BETWEEN 1 AND 64),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
    content TEXT NOT NULL DEFAULT '',
    due_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX todo_page_project_idx ON todo_page (project_id, created_at DESC);

CREATE TABLE todo_page_label (
    page_id INTEGER NOT NULL REFERENCES todo_page(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES todo_label(id) ON DELETE CASCADE,
    PRIMARY KEY (page_id, label_id)
);
