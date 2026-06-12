-- Add missing composite indexes for query performance

-- Notification: support fast "unread badge" query (userId + readAt IS NULL)
CREATE INDEX `notifications_user_readat_idx` ON `notifications` (`user_id`, `read_at`);

-- CrmTicket: support dashboard filtering (status + assignedTo)
CREATE INDEX `crm_tickets_status_assignedto_idx` ON `crm_tickets` (`status`, `assigned_to`);
