-- WorkTrack — MySQL 5.7+/8 / MariaDB 10.3+ schema
-- Multi-tenant: every business row carries company_id.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ───────────── Company & people ─────────────
CREATE TABLE IF NOT EXISTS companies (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,          -- e.g. ACME2026 (entered on login)
  name VARCHAR(150) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  shift_start TIME NOT NULL DEFAULT '09:30:00',
  shift_end TIME NOT NULL DEFAULT '18:30:00',
  late_grace_min SMALLINT NOT NULL DEFAULT 10,
  languages VARCHAR(255) NOT NULL DEFAULT 'en,hi,mr,gu,ta,te,bn,ar,kn',
  score_weights VARCHAR(100) NOT NULL DEFAULT '{"ontime":40,"tasks":30,"attendance":20,"rating":10}',
  whatsapp_enabled TINYINT(1) NOT NULL DEFAULT 0,
  whatsapp_number VARCHAR(20) NULL,
  gcal_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  head_user_id INT UNSIGNED NULL,
  UNIQUE KEY uq_dept (company_id, name),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  department_id INT UNSIGNED NULL,
  manager_id INT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  mobile VARCHAR(15) NOT NULL,
  email VARCHAR(150) NULL,
  designation VARCHAR(100) NULL,
  role ENUM('owner','manager','employee') NOT NULL DEFAULT 'employee',
  language VARCHAR(5) NOT NULL DEFAULT 'en',
  avatar_url VARCHAR(255) NULL,
  password_hash VARCHAR(255) NULL,           -- optional, admin panel email/password login
  pin_hash VARCHAR(255) NULL,                -- app PIN
  notify_app TINYINT(1) NOT NULL DEFAULT 1,
  notify_whatsapp TINYINT(1) NOT NULL DEFAULT 1,
  location_consent TINYINT(1) NOT NULL DEFAULT 0,
  push_token VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  joined_on DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_mobile (company_id, mobile),
  KEY idx_user_dept (department_id),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS otp_codes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  attempts TINYINT NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_otp_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ───────────── Goals (linked to tasks) ─────────────
CREATE TABLE IF NOT EXISTS goals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  parent_id INT UNSIGNED NULL,               -- sub-goal, e.g. "Close 40 deals" under "Revenue 1.2 Cr"
  title VARCHAR(200) NOT NULL,
  scope ENUM('company','department','user') NOT NULL DEFAULT 'company',
  department_id INT UNSIGNED NULL,
  owner_id INT UNSIGNED NULL,
  period_label VARCHAR(40) NULL,             -- "Q4 (Oct–Dec)"
  start_date DATE NULL,
  end_date DATE NULL,
  target_value DECIMAL(14,2) NOT NULL DEFAULT 100,
  current_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  unit VARCHAR(20) NULL,                     -- "₹", "deals", "%"
  status ENUM('on_track','at_risk','behind','done') NOT NULL DEFAULT 'on_track',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES goals(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ───────────── Tasks ─────────────
CREATE TABLE IF NOT EXISTS recurring_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  department_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NOT NULL,
  priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  frequency ENUM('daily','weekly','monthly','custom') NOT NULL DEFAULT 'daily',
  weekdays VARCHAR(20) NULL,                 -- "1,2,3,4,5,6" (Mon=1 … Sun=7)
  month_day TINYINT NULL,                    -- 1..31 for monthly
  interval_days SMALLINT NULL,               -- for custom
  due_time TIME NOT NULL DEFAULT '10:00:00',
  ends_on DATE NULL,
  proof_type SET('photo','file','location','link') NULL,
  checklist_json TEXT NULL,                  -- ["Sales register", ...]
  rotation_json TEXT NULL,                   -- [userId, userId] alternate assignees
  rotation_index SMALLINT NOT NULL DEFAULT 0,
  assignee_id INT UNSIGNED NULL,             -- used when no rotation
  goal_id INT UNSIGNED NULL,
  last_generated_on DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tasks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  assigned_to INT UNSIGNED NOT NULL,
  assigned_by INT UNSIGNED NOT NULL,
  department_id INT UNSIGNED NULL,
  goal_id INT UNSIGNED NULL,
  recurring_rule_id INT UNSIGNED NULL,
  campaign_id INT UNSIGNED NULL,
  priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  status ENUM('not_started','in_progress','done','cancelled') NOT NULL DEFAULT 'not_started',
  due_at DATETIME NULL,
  remind_before_min SMALLINT NULL,           -- 60 = "Remind 1 hour before"
  reminder_sent_at DATETIME NULL,
  send_whatsapp TINYINT(1) NOT NULL DEFAULT 0,
  proof_type SET('photo','file','location','link') NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  completion_remarks TEXT NULL,
  completion_lat DECIMAL(10,7) NULL,
  completion_lng DECIMAL(10,7) NULL,
  completion_place VARCHAR(120) NULL,
  manager_rating TINYINT NULL,               -- 1..5
  source ENUM('manual','voice','ai','recurring','whatsapp') NOT NULL DEFAULT 'manual',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_task_assignee (company_id, assigned_to, status),
  KEY idx_task_due (company_id, due_at),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id),
  FOREIGN KEY (recurring_rule_id) REFERENCES recurring_rules(id) ON DELETE SET NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_checklist (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  label VARCHAR(200) NOT NULL,
  is_done TINYINT(1) NOT NULL DEFAULT 0,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attachments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  entity_type ENUM('task','task_proof','comment','chat','leave','expense','user_doc') NOT NULL,
  entity_id INT UNSIGNED NOT NULL,
  kind ENUM('file','image','voice','link') NOT NULL DEFAULT 'file',
  file_name VARCHAR(200) NOT NULL,
  path VARCHAR(255) NOT NULL,                -- relative to uploads dir, or URL for links
  mime VARCHAR(100) NULL,
  size_bytes INT UNSIGNED NULL,
  duration_sec SMALLINT NULL,                -- voice notes
  uploaded_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_att_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_comments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_activity (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,               -- created, status_changed, extended, reassigned…
  meta TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ───────────── Attendance & location ─────────────
CREATE TABLE IF NOT EXISTS geofences (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,                 -- Head office, Plant 2
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  radius_m SMALLINT NOT NULL DEFAULT 150,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  work_date DATE NOT NULL,
  mode ENUM('office','field','wfh') NOT NULL DEFAULT 'office',
  status ENUM('present','late','field','leave','absent','half_day','holiday') NOT NULL DEFAULT 'present',
  punch_in_at DATETIME NULL,
  punch_in_lat DECIMAL(10,7) NULL,
  punch_in_lng DECIMAL(10,7) NULL,
  punch_in_geofence_id INT UNSIGNED NULL,
  punch_in_selfie VARCHAR(255) NULL,
  punch_in_place VARCHAR(150) NULL,
  punch_out_at DATETIME NULL,
  punch_out_lat DECIMAL(10,7) NULL,
  punch_out_lng DECIMAL(10,7) NULL,
  punch_out_selfie VARCHAR(255) NULL,
  late_minutes SMALLINT NOT NULL DEFAULT 0,
  worked_minutes SMALLINT NOT NULL DEFAULT 0,
  regularised TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_att_day (user_id, work_date),
  KEY idx_att_company_date (company_id, work_date),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS location_pings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  accuracy_m SMALLINT NULL,
  activity ENUM('still','moving','visit') NOT NULL DEFAULT 'still',
  place_label VARCHAR(150) NULL,             -- "Sharma Traders"
  recorded_at DATETIME NOT NULL,
  KEY idx_ping_user_time (user_id, recorded_at),
  KEY idx_ping_company_time (company_id, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ───────────── Leave & approvals ─────────────
CREATE TABLE IF NOT EXISTS leave_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  code VARCHAR(20) NOT NULL,                 -- casual, sick, earned, compoff
  name VARCHAR(60) NOT NULL,
  yearly_quota SMALLINT NOT NULL DEFAULT 0,  -- 0 = on approval
  carry_forward_max SMALLINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_leave_type (company_id, code),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS holidays (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  holiday_date DATE NOT NULL,
  name VARCHAR(100) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One table for every approval in the manager inbox:
-- leave, expense, deadline extension, punch regularisation.
CREATE TABLE IF NOT EXISTS requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  approver_id INT UNSIGNED NULL,
  type ENUM('leave','expense','extension','regularise') NOT NULL,
  leave_type_id INT UNSIGNED NULL,
  from_date DATE NULL,
  to_date DATE NULL,
  days DECIMAL(4,1) NULL,
  amount DECIMAL(10,2) NULL,
  task_id INT UNSIGNED NULL,
  extend_to DATETIME NULL,
  handover_to INT UNSIGNED NULL,
  reason VARCHAR(255) NULL,
  status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  decided_by INT UNSIGNED NULL,
  decided_at DATETIME NULL,
  decision_note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_req_company_status (company_id, status),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ───────────── Timesheet ─────────────
CREATE TABLE IF NOT EXISTS projects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_billable TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  task_id INT UNSIGNED NULL,
  project_id INT UNSIGNED NULL,
  title VARCHAR(150) NOT NULL,
  category VARCHAR(40) NULL,                 -- Sales, Field, Office
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,                    -- NULL = timer running
  minutes SMALLINT NOT NULL DEFAULT 0,
  is_billable TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_ts_user_day (user_id, started_at),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ───────────── Calendar ─────────────
CREATE TABLE IF NOT EXISTS events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  meet_link VARCHAR(255) NULL,
  gcal_event_id VARCHAR(120) NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ───────────── Chat ─────────────
CREATE TABLE IF NOT EXISTS chat_rooms (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NULL,                    -- NULL for 1:1
  is_group TINYINT(1) NOT NULL DEFAULT 1,
  department_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NOT NULL,
  last_message_at DATETIME NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_members (
  room_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  last_read_message_id INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  kind ENUM('text','voice','file','task') NOT NULL DEFAULT 'text',
  body TEXT NULL,
  task_id INT UNSIGNED NULL,
  attachment_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_msg_room (room_id, id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ───────────── Campaigns ─────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  channel VARCHAR(40) NULL,                  -- Instagram, Email, Website…
  owner_id INT UNSIGNED NULL,
  stage ENUM('idea','production','scheduled','live') NOT NULL DEFAULT 'idea',
  sub_status VARCHAR(30) NULL,               -- Editing, Draft…
  go_live_on DATE NULL,
  reach INT UNSIGNED NULL,
  leads INT UNSIGNED NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ───────────── Notifications, announcements, rewards ─────────────
CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL,                 -- task_assigned, task_overdue, leave_approved, announcement…
  title VARCHAR(150) NOT NULL,
  body VARCHAR(255) NULL,
  entity_type VARCHAR(30) NULL,
  entity_id INT UNSIGNED NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notif_user (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS whatsapp_log (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  task_id INT UNSIGNED NULL,
  direction ENUM('out','in') NOT NULL DEFAULT 'out',
  to_mobile VARCHAR(20) NOT NULL,
  body TEXT NOT NULL,
  provider_msg_id VARCHAR(120) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rewards (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  month CHAR(7) NOT NULL,                    -- 2026-11
  title VARCHAR(80) NOT NULL DEFAULT 'Star of the Month',
  score DECIMAL(5,1) NOT NULL,
  reward_text VARCHAR(120) NULL,
  announced_at DATETIME NULL,
  UNIQUE KEY uq_reward (company_id, month, title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  reason VARCHAR(200) NULL,
  suggested_user_id INT UNSIGNED NULL,
  suggested_due DATE NULL,
  status ENUM('open','added','skipped') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
