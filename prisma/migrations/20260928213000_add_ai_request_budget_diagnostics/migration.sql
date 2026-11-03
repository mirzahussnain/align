ALTER TABLE ai_usage_event
ADD COLUMN estimatedInputTokens INTEGER,
ADD COLUMN maxOutputTokens INTEGER,
ADD COLUMN estimatedRequestTokens INTEGER,
ADD COLUMN requestBudgetTokens INTEGER,
ADD COLUMN safetyMarginTokens INTEGER;
