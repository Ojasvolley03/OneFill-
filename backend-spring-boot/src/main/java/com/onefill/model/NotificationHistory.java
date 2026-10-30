package com.onefill.model;

import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "notification_history", indexes = {
    @Index(name = "idx_notif_user", columnList = "user_id"),
    @Index(name = "idx_notif_reminder", columnList = "reminder_id")
})
public class NotificationHistory {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "user_id", nullable = false, length = 64)
    private String userId;

    @Column(name = "reminder_id", length = 64)
    private String reminderId;

    @Column(name = "reminder_title", nullable = false)
    private String reminderTitle;

    @Column(name = "reminder_category", nullable = false)
    private String reminderCategory;

    @Column(name = "type", nullable = false, length = 32)
    private String type; // upcoming, due_today, overdue, snoozed, system

    @Column(name = "interval_days")
    private Integer intervalDays;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "message", columnDefinition = "TEXT", nullable = false)
    private String message;

    @Column(name = "is_read", nullable = false)
    private boolean isRead = false;

    @Column(name = "read_at")
    private LocalDateTime readAt;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    public NotificationHistory() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getReminderId() { return reminderId; }
    public void setReminderId(String reminderId) { this.reminderId = reminderId; }

    public String getReminderTitle() { return reminderTitle; }
    public void setReminderTitle(String reminderTitle) { this.reminderTitle = reminderTitle; }

    public String getReminderCategory() { return reminderCategory; }
    public void setReminderCategory(String reminderCategory) { this.reminderCategory = reminderCategory; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public Integer getIntervalDays() { return intervalDays; }
    public void setIntervalDays(Integer intervalDays) { this.intervalDays = intervalDays; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public boolean isRead() { return isRead; }
    public void setRead(boolean read) { isRead = read; }

    public LocalDateTime getReadAt() { return readAt; }
    public void setReadAt(LocalDateTime readAt) { this.readAt = readAt; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
