export const RETENTION_POLICY = {
  anonymousDemoHours: 24,
  staleJobDays: 45,
  abandonedRequestMinutes: 30,
  uploadIntent: {
    pendingMinutes: 5,
    validatingMinutes: 10,
  },
} as const;
