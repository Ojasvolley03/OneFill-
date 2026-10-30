-- ============================================================================
-- OneFill: Deadline & Expiry Intelligence Schema (MySQL 8.0+)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(191) NOT NULL UNIQUE,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(128) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    size BIGINT NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    extracted_text LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_doc_user (user_id),
    CONSTRAINT fk_doc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reminder_settings (
    user_id VARCHAR(64) PRIMARY KEY,
    max_active_reminders INT DEFAULT 300,
    default_intervals VARCHAR(255) DEFAULT '30,15,7,3,2,1,0',
    push_enabled BOOLEAN DEFAULT TRUE,
    in_app_enabled BOOLEAN DEFAULT TRUE,
    sound_enabled BOOLEAN DEFAULT TRUE,
    fcm_tokens JSON,
    push_subscriptions JSON,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reminders (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    document_id VARCHAR(64) DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    category ENUM(
        'Government & Identity',
        'Vehicle & Transportation',
        'Electricity & Household Bills',
        'Banking & Finance',
        'Medical & Healthcare',
        'Education & Student',
        'Personal & Family',
        'Insurance',
        'Government Schemes & Tax',
        'Others'
    ) NOT NULL DEFAULT 'Others',
    deadline_date DATE NOT NULL,
    deadline_time TIME DEFAULT '09:00:00',
    amount VARCHAR(64) DEFAULT NULL,
    intervals VARCHAR(255) NOT NULL DEFAULT '30,15,7,3,2,1,0',
    repeat_option ENUM('none', 'daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly') NOT NULL DEFAULT 'none',
    priority ENUM('high', 'normal', 'low') NOT NULL DEFAULT 'normal',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    in_app_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT TRUE,
    notes TEXT,
    status ENUM('active', 'completed', 'snoozed') NOT NULL DEFAULT 'active',
    snoozed_until TIMESTAMP NULL DEFAULT NULL,
    last_notified_intervals VARCHAR(255) DEFAULT '',
    completed_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_rem_user (user_id),
    INDEX idx_rem_deadline (deadline_date),
    INDEX idx_rem_status (status),
    CONSTRAINT fk_rem_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_rem_doc FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_history (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    reminder_id VARCHAR(64) DEFAULT NULL,
    reminder_title VARCHAR(255) NOT NULL,
    reminder_category VARCHAR(100) NOT NULL,
    type ENUM('upcoming', 'due_today', 'overdue', 'snoozed', 'system') NOT NULL,
    interval_days INT DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notif_user (user_id),
    INDEX idx_notif_reminder (reminder_id),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_notif_rem FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
