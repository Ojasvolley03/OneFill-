package com.onefill.controller;

import com.onefill.model.NotificationHistory;
import com.onefill.model.Reminder;
import com.onefill.model.ReminderSettings;
import com.onefill.repository.NotificationHistoryRepository;
import com.onefill.repository.ReminderSettingsRepository;
import com.onefill.service.ReminderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/reminders")
@CrossOrigin(origins = "*", allowCredentials = "true")
public class ReminderController {

    @Autowired
    private ReminderService reminderService;

    @Autowired
    private ReminderSettingsRepository settingsRepository;

    @Autowired
    private NotificationHistoryRepository notificationRepository;

    // Public categories descriptor
    @GetMapping("/categories")
    public ResponseEntity<Map<String, Object>> getCategories() {
        Map<String, Object> resp = new HashMap<>();
        resp.put("categories", new String[]{
                "Government & Identity",
                "Vehicle & Transportation",
                "Electricity & Household Bills",
                "Banking & Finance",
                "Medical & Healthcare",
                "Education & Student",
                "Personal & Family",
                "Insurance",
                "Government Schemes & Tax",
                "Others"
        });
        return ResponseEntity.ok(resp);
    }

    // List user reminders (enforces strict authentication and user isolation)
    @GetMapping
    public ResponseEntity<Map<String, Object>> listReminders(@RequestAttribute("userId") String userId) {
        List<Reminder> reminders = reminderService.getUserReminders(userId);
        ReminderSettings settings = settingsRepository.findByUserId(userId).orElse(new ReminderSettings(userId));

        Map<String, Object> resp = new HashMap<>();
        resp.put("reminders", reminders);
        resp.put("activeCount", reminders.stream().filter(r -> "active".equalsIgnoreCase(r.getStatus())).count());
        resp.put("maxActiveLimit", settings.getMaxActiveReminders());
        return ResponseEntity.ok(resp);
    }

    // Create reminder (validates 300 active limit)
    @PostMapping
    public ResponseEntity<Map<String, Object>> createReminder(
            @RequestAttribute("userId") String userId,
            @RequestBody Reminder reminder) {
        Reminder created = reminderService.createReminder(userId, reminder);
        Map<String, Object> resp = new HashMap<>();
        resp.put("message", "Reminder created successfully.");
        resp.put("reminder", created);
        return ResponseEntity.status(201).body(resp);
    }

    // Get single reminder
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getReminder(
            @RequestAttribute("userId") String userId,
            @PathVariable("id") String id) {
        Reminder reminder = reminderService.getUserReminder(userId, id);
        Map<String, Object> resp = new HashMap<>();
        resp.put("reminder", reminder);
        return ResponseEntity.ok(resp);
    }

    // Update reminder
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> updateReminder(
            @RequestAttribute("userId") String userId,
            @PathVariable("id") String id,
            @RequestBody Reminder patch) {
        Reminder updated = reminderService.updateReminder(userId, id, patch);
        Map<String, Object> resp = new HashMap<>();
        resp.put("message", "Reminder updated successfully.");
        resp.put("reminder", updated);
        return ResponseEntity.ok(resp);
    }

    // Delete reminder
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> deleteReminder(
            @RequestAttribute("userId") String userId,
            @PathVariable("id") String id) {
        reminderService.deleteReminder(userId, id);
        Map<String, Object> resp = new HashMap<>();
        resp.put("message", "Reminder deleted successfully.");
        return ResponseEntity.ok(resp);
    }

    // Patch status: completed or active
    @PatchMapping("/{id}/status")
    public ResponseEntity<Map<String, Object>> updateStatus(
            @RequestAttribute("userId") String userId,
            @PathVariable("id") String id,
            @RequestBody Map<String, String> body) {
        String status = body.getOrDefault("status", "active");
        Reminder updated = reminderService.updateStatus(userId, id, status);
        Map<String, Object> resp = new HashMap<>();
        resp.put("message", "Reminder status updated to " + status);
        resp.put("reminder", updated);
        return ResponseEntity.ok(resp);
    }

    // Snooze reminder
    @PostMapping("/{id}/snooze")
    public ResponseEntity<Map<String, Object>> snoozeReminder(
            @RequestAttribute("userId") String userId,
            @PathVariable("id") String id,
            @RequestBody(required = false) Map<String, Object> body) {
        int hours = 24;
        if (body != null && body.containsKey("hours")) {
            hours = ((Number) body.get("hours")).intValue();
        }
        Reminder updated = reminderService.snooze(userId, id, LocalDateTime.now().plusHours(hours));
        Map<String, Object> resp = new HashMap<>();
        resp.put("message", "Reminder snoozed for " + hours + " hours.");
        resp.put("reminder", updated);
        return ResponseEntity.ok(resp);
    }

    // Get notifications
    @GetMapping("/notifications")
    public ResponseEntity<Map<String, Object>> getNotifications(@RequestAttribute("userId") String userId) {
        List<NotificationHistory> list = notificationRepository.findByUserIdOrderByCreatedAtDesc(userId);
        long unread = notificationRepository.countByUserIdAndIsReadFalse(userId);

        Map<String, Object> resp = new HashMap<>();
        resp.put("notifications", list);
        resp.put("unreadCount", unread);
        return ResponseEntity.ok(resp);
    }

    // Mark all notifications read
    @PostMapping("/notifications/read-all")
    public ResponseEntity<Map<String, Object>> markAllRead(@RequestAttribute("userId") String userId) {
        notificationRepository.markAllAsRead(userId, LocalDateTime.now());
        Map<String, Object> resp = new HashMap<>();
        resp.put("message", "All notifications marked as read.");
        return ResponseEntity.ok(resp);
    }
}
