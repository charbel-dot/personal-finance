import { reconcileRecurring } from '../../server/data';

interface CronEnv {
  BUCKET: R2Bucket;
}

/**
 * Daily Cron Trigger: generates due recurring expenses even when the app isn't opened.
 * The Pages app also reconciles on load; deterministic ids make both paths idempotent.
 */
export default {
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      reconcileRecurring(env.BUCKET).then(({ generated, today }) => {
        console.warn(`[cron] reconciled recurring for ${today}: ${generated} generated`);
      }),
    );
  },
  fetch() {
    // No public HTTP surface.
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<CronEnv>;
