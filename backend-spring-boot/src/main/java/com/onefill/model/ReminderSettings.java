package com.onefill.model;

import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "reminder_settings")
public class ReminderSettings {

    @Id
    @Column(name = "user_id", length = 64)
    private String userId;

    @Column(name = "max_active_reminders", nullable = false)
    private int maxActiveReminders = 300;

    @Column(name = "default_intervals")
    private String defaultIntervals = "30,15,7,3,2,1,0";

    @Column(name = "push_enabled")
    private boolean pushEnabled = true;

    @Column(name = "in_app_enabled")
    private boolean inAppEnabled = true;

    @Column(name = "sound_enabled")
    private boolean soundEnabled = true;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();

    public ReminderSettings() {}

    public ReminderSettings(String userId) {
        this.userId = userId;
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public int getMaxActiveReminders() { return maxActiveReminders; }
    public void setMaxActiveReminders(int maxActiveReminders) { this.maxActiveReminders = maxActiveReminders; }

    public String getDefaultIntervals() { return defaultIntervals; }
    public void setDefaultIntervals(String defaultIntervals) { this.defaultIntervals = defaultIntervals; }

    public boolean isPushEnabled() { return pushEnabled; }
    public void setPushEnabled(boolean pushEnabled) { this.pushEnabled = pushEnabled; }

    public boolean isInAppEnabled() { return inAppEnabled; }
    public void setInAppEnabled(boolean inAppEnabled) { this.inAppEnabled = inAppEnabled; }

    public boolean isSoundEnabled() { return soundEnabled; }
    public void setSoundEnabled(boolean soundEnabled) { this.soundEnabled = soundEnabled; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
