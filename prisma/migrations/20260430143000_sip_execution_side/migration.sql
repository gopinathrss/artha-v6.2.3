-- F4.5 / Area 3: distinguish BUY vs SELL (and RESERVE) in execution tracking
ALTER TABLE "SipExecution" ADD COLUMN "side" TEXT NOT NULL DEFAULT 'BUY';
