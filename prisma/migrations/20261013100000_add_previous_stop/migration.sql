-- Change 50: 上一站卡與題型（只新增 enum 值，向下相容）。
-- 同一個 migration 加兩個值：PostgreSQL 12 以上可行（本專案已有先例）。
ALTER TYPE "CardType" ADD VALUE 'PREV_STOP';
ALTER TYPE "RecallMode" ADD VALUE 'PREVIOUS_STOP_BACKWARD';
