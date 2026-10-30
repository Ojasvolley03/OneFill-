package com.onefill.repository;

import com.onefill.model.Reminder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface ReminderRepository extends JpaRepository<Reminder, String> {

    // Strict User Isolation / IDOR Protection
    List<Reminder> findByUserIdOrderByDeadlineDateAsc(String userId);

    Optional<Reminder> findByIdAndUserId(String id, String userId);

    long countByUserIdAndStatus(String userId, String status);

    @Query("SELECT r FROM Reminder r WHERE r.userId = :userId AND (:category = 'ALL' OR r.category = :category)")
    List<Reminder> findByUserAndCategory(@Param("userId") String userId, @Param("category") String category);

    // Queries for scheduler engine
    @Query("SELECT r FROM Reminder r WHERE r.status = 'active' AND r.notificationsEnabled = true")
    List<Reminder> findAllActiveWithNotifications();

    @Query("SELECT r FROM Reminder r WHERE r.status = 'snoozed' AND r.snoozedUntil <= CURRENT_TIMESTAMP")
    List<Reminder> findExpiredSnoozes();
}
