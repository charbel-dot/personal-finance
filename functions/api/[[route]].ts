import { createApp } from '../../server/app';
import type { Env } from '../../server/env';

const app = createApp();

/** Pages Function catch-all: every /api/* request is handled by the Hono app on the same origin. */
export const onRequest: PagesFunction<Env> = (context) =>
  app.fetch(context.request, context.env, {
    waitUntil: (promise) => context.waitUntil(promise),
    passThroughOnException: () => context.passThroughOnException(),
    props: {},
  });
