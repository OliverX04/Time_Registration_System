PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_account (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    student_number TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('INTERN', 'SUPERVISOR')),
    is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1))
);

CREATE TABLE IF NOT EXISTS internship (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    intern_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    outcome TEXT CHECK (outcome IN ('COMPLETED', 'DISCONTINUED')),
    FOREIGN KEY (intern_id) REFERENCES user_account(id)
);

CREATE TABLE IF NOT EXISTS report_schedule (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    singleton_key INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK (singleton_key = 1),
    configured_by_user_id TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    send_at TEXT NOT NULL,
    FOREIGN KEY (configured_by_user_id) REFERENCES user_account(id)
);

CREATE TABLE IF NOT EXISTS project (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    created_by_user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (created_by_user_id) REFERENCES user_account(id)
);

CREATE TABLE IF NOT EXISTS project_assignment (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    internship_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    ended_at TEXT,
    FOREIGN KEY (internship_id) REFERENCES internship(id),
    FOREIGN KEY (project_id) REFERENCES project(id)
);

CREATE TABLE IF NOT EXISTS task (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (project_id) REFERENCES project(id)
);

CREATE TABLE IF NOT EXISTS task_assignment (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    internship_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    ended_at TEXT,
    FOREIGN KEY (internship_id) REFERENCES internship(id),
    FOREIGN KEY (task_id) REFERENCES task(id)
);

CREATE TABLE IF NOT EXISTS attendance_session (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    internship_id TEXT NOT NULL,
    checked_in_at TEXT NOT NULL,
    checked_out_at TEXT,
    FOREIGN KEY (internship_id) REFERENCES internship(id),
    CHECK (checked_out_at IS NULL OR checked_out_at > checked_in_at)
);

CREATE TABLE IF NOT EXISTS task_time_entry (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    task_assignment_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    FOREIGN KEY (task_assignment_id) REFERENCES task_assignment(id),
    CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE INDEX IF NOT EXISTS idx_internship_intern_id ON internship(intern_id);
CREATE INDEX IF NOT EXISTS idx_report_schedule_configured_by_user_id ON report_schedule(configured_by_user_id);
CREATE INDEX IF NOT EXISTS idx_project_created_by_user_id ON project(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_project_assignment_internship_id ON project_assignment(internship_id);
CREATE INDEX IF NOT EXISTS idx_project_assignment_project_id ON project_assignment(project_id);
CREATE INDEX IF NOT EXISTS idx_task_project_id ON task(project_id);
CREATE INDEX IF NOT EXISTS idx_task_assignment_internship_id ON task_assignment(internship_id);
CREATE INDEX IF NOT EXISTS idx_task_assignment_task_id ON task_assignment(task_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session_internship_id ON attendance_session(internship_id);
CREATE INDEX IF NOT EXISTS idx_task_time_entry_task_assignment_id ON task_time_entry(task_assignment_id);
