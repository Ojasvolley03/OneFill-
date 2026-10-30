package com.onefill.repository;

import com.onefill.model.ReminderSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ReminderSettingsRepository extends JpaRepository<ReminderSettings, String> {
    Optional<ReminderSettings> findByUserId(String userId);
}
