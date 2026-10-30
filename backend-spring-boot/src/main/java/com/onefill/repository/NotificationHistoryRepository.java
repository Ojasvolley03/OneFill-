package com.onefill.repository;

import com.onefill.model.NotificationHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface NotificationHistoryRepository extends JpaRepository<NotificationHistory, String> {

    List<NotificationHistory> findByUserIdOrderByCreatedAtDesc(String userId);

    Optional<NotificationHistory> findByIdAndUserId(String id, String userId);

    long countByUserIdAndIsReadFalse(String userId);

    @Transactional
    @Modifying
    @Query("UPDATE NotificationHistory n SET n.isRead = true, n.readAt = :now WHERE n.userId = :userId AND n.isRead = false")
    void markAllAsRead(@Param("userId") String userId, @Param("now") LocalDateTime now);
}
