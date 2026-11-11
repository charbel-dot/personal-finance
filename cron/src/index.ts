import { reconcileRecurring } from '../../server/data';
import { dataBucket, memberIds, OWNER_ID } from '../../server/users';

interface CronEnv {
  BUCKET: R2Bucket;
}

/** Generates due recurring entries for one user; a failure for one user never blocks the others. */
async function reconcileUser(bucket: R2Bucket, userId: string) {
  try {
    const { generated, today } = await reconcileRecurring(dataBucket(bucket, userId));
    if (generated > 0) console.warn(`[cron] ${userId}: ${generated} generated for ${today}`);
  } catch (err) {
    console.error(`[cron] ${userId}: reconcile failed`, err);
  }
}

/**
 * Hourly Cron Trigger: generates due recurring entries for every user even when the app isn't
 * opened. The Pages app also reconciles on load; deterministic ids make both paths idempotent.
 */
export default {
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      memberIds(env.BUCKET).then((ids) =>
        Promise.all([OWNER_ID, ...ids].map((id) => reconcileUser(env.BUCKET, id))).then(() => undefined),
      ),
    );
  },
  fetch() {
    // No public HTTP surface.
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<CronEnv>;
