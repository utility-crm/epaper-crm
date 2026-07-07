import { Hono } from 'hono';
import { editionsRouter } from './editions';
import { uploadRouter } from './upload';
import { internalRouter } from './internal';
import { statsRouter } from './stats';
import { plansRouter } from './plans';
import { readerRouter } from './reader';
import { err, ErrorCode, ok } from '@epaper/types';
import { orgUserAuth } from './middleware';

const app = new Hono();

app.route('/', internalRouter);

// Public reader-facing API (no staff auth). Free content + reader accounts + gated pages.
app.route('/api/read', readerRouter);

// Staff (tenant) API — requires org user token.
app.use('/api/content/*', orgUserAuth);
app.route('/api/content', editionsRouter);
app.route('/api/content', uploadRouter);
app.route('/api/content', statsRouter);
app.route('/api/content', plansRouter);

app.get('/health', (c) => c.json(ok({ status: 'ok', worker: 'content' })));

app.notFound((c) => {
  return c.json(err(ErrorCode.NOT_FOUND, 'Not found'), 404);
});

export default {
  fetch: app.fetch,
};
