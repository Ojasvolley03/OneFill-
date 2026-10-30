package com.onefill.service;

import com.onefill.model.NotificationHistory;
import com.onefill.model.Reminder;
import com.onefill.repository.NotificationHistoryRepository;
import com.onefill.repository.ReminderRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class NotificationSchedulerService {

    @Autowired
    private ReminderRepository reminderRepository;

    @Autowired
    private NotificationHistoryRepository notificationRepository;

    /**
     * Automated Scheduler running every 60 seconds.
     * Evaluates active reminders against current time/date and intervals.
     * Generates persistent notification records and avoids duplicate alerts.
     */
    @Scheduled(cron = "0 * * * * *")
    @Transactional
    public void runDeadlineAndExpiryCheck() {
        LocalDate today = LocalDate.now();

        // 1. Un-snooze expired snoozes
        List<Reminder> expiredSnoozes = reminderRepository.findExpiredSnoozes();
        for (Reminder r : expiredSnoozes) {
            r.setStatus("active");
            r.setSnoozedUntil(null);
            reminderRepository.save(r);
        }

        // 2. Check active reminders with notifications enabled
        List<Reminder> activeReminders = reminderRepository.findAllActiveWithNotifications();

        for (Reminder r : activeReminders) {
            long daysRemaining = ChronoUnit.DAYS.between(today, r.getDeadlineDate());
            Set<String> notified = new HashSet<>(
                    Arrays.asList((r.getLastNotifiedIntervals() != null ? r.getLastNotifiedIntervals() : "").split(","))
            );

            // Parse reminder intervals: 30, 15, 7, 3, 2, 1, 0
            String[] intervalTokens = (r.getIntervals() != null ? r.getIntervals() : "30,15,7,3,2,1,0").split(",");
            boolean updated = false;

            for (String tok : intervalTokens) {
                try {
                    int interval = Integer.parseInt(tok.trim());
                    if (daysRemaining <= interval && daysRemaining >= 0) {
                        String key = String.valueOf(interval);
                        if (!notified.contains(key)) {
                            notified.add(key);
                            updated = true;

                            boolean isToday = (interval == 0 || daysRemaining == 0);
                            String title = isToday ? "🚨 Due Today: " + r.getTitle() : "⏰ " + interval + " Days Remaining: " + r.getTitle();
                            String msg = isToday
                                    ? "Your deadline for \"" + r.getTitle() + "\" (" + r.getCategory() + ") is TODAY."
                                    : "\"" + r.getTitle() + "\" is due in " + daysRemaining + " days on " + r.getDeadlineDate() + ".";

                            NotificationHistory notif = new NotificationHistory();
                            notif.setId("notif_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 6));
                            notif.setUserId(r.getUserId());
                            notif.setReminderId(r.getId());
                            notif.setReminderTitle(r.getTitle());
                            notif.setReminderCategory(r.getCategory());
                            notif.setType(isToday ? "due_today" : "upcoming");
                            notif.setIntervalDays((int) daysRemaining);
                            notif.setTitle(title);
                            notif.setMessage(msg);
                            notif.setRead(false);
                            notif.setCreatedAt(LocalDateTime.now());

                            notificationRepository.save(notif);
                        }
                    }
                } catch (NumberFormatException ignored) {}
            }

            // Overdue check
            if (daysRemaining < 0 && !notified.contains("overdue")) {
                notified.add("overdue");
                updated = true;

                NotificationHistory notif = new NotificationHistory();
                notif.setId("notif_" + System.currentTimeMillis() + "_" + UUID.randomUUID().toString().substring(0, 6));
                notif.setUserId(r.getUserId());
                notif.setReminderId(r.getId());
                notif.setReminderTitle(r.getTitle());
                notif.setReminderCategory(r.getCategory());
                notif.setType("overdue");
                notif.setIntervalDays((int) daysRemaining);
                notif.setTitle("⚠️ Overdue: " + r.getTitle());
                notif.setMessage("The deadline for \"" + r.getTitle() + "\" passed on " + r.getDeadlineDate() + " (" + Math.abs(daysRemaining) + " days ago).");
                notif.setRead(false);
                notif.setCreatedAt(LocalDateTime.now());

                notificationRepository.save(notif);
            }

            if (updated) {
                r.setLastNotifiedIntervals(String.join(",", notified));
                reminderRepository.save(r);
            }
        }
    }
}
