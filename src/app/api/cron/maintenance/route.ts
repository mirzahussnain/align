import { runScheduledMaintenance } from '@/shared/services/scheduled-maintenance';

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: { code: 'UNAUTHORISED' } }, { status: 401 });
  }

  try {
    const result = await runScheduledMaintenance();
    return Response.json(result, { status: result.status === 'already_running' ? 202 : 200 });
  } catch (error) {
    console.error('scheduled_maintenance_failed', {
      code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
    });
    return Response.json({ error: { code: 'MAINTENANCE_FAILED' } }, { status: 500 });
  }
}
