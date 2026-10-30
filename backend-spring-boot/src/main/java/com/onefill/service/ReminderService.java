package com.onefill.service;

import com.onefill.model.Reminder;
import com.onefill.model.ReminderSettings;
import com.onefill.repository.ReminderRepository;
import com.onefill.repository.ReminderSettingsRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class ReminderService {

    @Autowired
    private ReminderRepository reminderRepository;

    @Autowired
    private ReminderSettingsRepository settingsRepository;

    public List<Reminder> getUserReminders(String userId) {
        return reminderRepository.findByUserIdOrderByDeadlineDateAsc(userId);
    }

    public Reminder getUserReminder(String userId, String reminderId) {
        return reminderRepository.findByIdAndUserId(reminderId, userId)
                .orElseThrow(() -> new RuntimeException("Reminder not found or access denied."));
    }

    @Transactional
    public Reminder createReminder(String userId, Reminder reminder) {
        // Enforce 300 active reminders limit (configurable per user)
        ReminderSettings settings = settingsRepository.findByUserId(userId)
                .orElseGet(() -> settingsRepository.save(new ReminderSettings(userId)));

        int limit = settings.getMaxActiveReminders();
        long activeCount = reminderRepository.countByUserIdAndStatus(userId, "active");
        if (activeCount >= limit) {
            throw new IllegalStateException("Active reminder limit reached (" + limit + " max). Please complete or delete existing reminders.");
        }

        if (reminder.getTitle() == null || reminder.getTitle().trim().isEmpty()) {
            throw new IllegalArgumentException("Reminder title is required.");
        }
        if (reminder.getDeadlineDate() == null) {
            throw new IllegalArgumentException("Deadline date is required.");
        }

        reminder.setId("rem_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 6));
        reminder.setUserId(userId);
        reminder.setStatus("active");
        reminder.setCreatedAt(LocalDateTime.now());
        reminder.setUpdatedAt(LocalDateTime.now());

        return reminderRepository.save(reminder);
    }

    @Transactional
    public Reminder updateReminder(String userId, String reminderId, Reminder patch) {
        Reminder existing = getUserReminder(userId, reminderId);

        if (patch.getTitle() != null && !patch.getTitle().trim().isEmpty()) {
            existing.setTitle(patch.getTitle().trim());
        }
        if (patch.getCategory() != null) {
            existing.setCategory(patch.getCategory());
        }
        if (patch.getDeadlineDate() != null) {
            // Reset notified intervals if deadline changed
            if (!patch.getDeadlineDate().equals(existing.getDeadlineDate())) {
                existing.setDeadlineDate(patch.getDeadlineDate());
                existing.setLastNotifiedIntervals("");
            }
        }
        if (patch.getDeadlineTime() != null) existing.setDeadlineTime(patch.getDeadlineTime());
        if (patch.getAmount() != null) existing.setAmount(patch.getAmount());
        if (patch.getIntervals() != null) existing.setIntervals(patch.getIntervals());
        if (patch.getRepeatOption() != null) existing.setRepeatOption(patch.getRepeatOption());
        if (patch.getPriority() != null) existing.setPriority(patch.getPriority());
        if (patch.getNotes() != null) existing.setNotes(patch.getNotes());
        if (patch.getDocumentId() != null) existing.setDocumentId(patch.getDocumentId());

        existing.setNotificationsEnabled(patch.isNotificationsEnabled());
        existing.setInAppEnabled(patch.isInAppEnabled());
        existing.setPushEnabled(patch.isPushEnabled());
        existing.setUpdatedAt(LocalDateTime.now());

        return reminderRepository.save(existing);
    }

    @Transactional
    public void deleteReminder(String userId, String reminderId) {
        Reminder existing = getUserReminder(userId, reminderId);
        reminderRepository.delete(existing);
    }

    @Transactional
    public Reminder updateStatus(String userId, String reminderId, String status) {
        Reminder existing = getUserReminder(userId, reminderId);
        existing.setStatus(status);

        if ("completed".equalsIgnoreCase(status)) {
            existing.setCompletedAt(LocalDateTime.now());
            // Advance next cycle if repeat option enabled
            if (existing.getRepeatOption() != null && !"none".equalsIgnoreCase(existing.getRepeatOption())) {
                LocalDate nextDate = advanceRepeatDate(existing.getDeadlineDate(), existing.getRepeatOption());
                if (nextDate != null) {
                    existing.setDeadlineDate(nextDate);
                    existing.setStatus("active");
                    existing.setCompletedAt(null);
                    existing.setLastNotifiedIntervals("");
                }
            }
        } else if ("active".equalsIgnoreCase(status)) {
            existing.setCompletedAt(null);
            existing.setSnoozedUntil(null);
        }

        existing.setUpdatedAt(LocalDateTime.now());
        return reminderRepository.save(existing);
    }

    @Transactional
    public Reminder snooze(String userId, String reminderId, LocalDateTime snoozeUntil) {
        Reminder existing = getUserReminder(userId, reminderId);
        existing.setStatus("snoozed");
        existing.setSnoozedUntil(snoozeUntil != null ? snoozeUntil : LocalDateTime.now().plusDays(1));
        existing.setUpdatedAt(LocalDateTime.now());
        return reminderRepository.save(existing);
    }

    private LocalDate advanceRepeatDate(LocalDate current, String repeatOption) {
        switch (repeatOption.toLowerCase()) {
            case "daily": return current.plusDays(1);
            case "weekly": return current.plusWeeks(1);
            case "monthly": return current.plusMonths(1);
            case "quarterly": return current.plusMonths(3);
            case "half-yearly": return current.plusMonths(6);
            case "yearly": return current.plusYears(1);
            default: return null;
        }
    }
}
