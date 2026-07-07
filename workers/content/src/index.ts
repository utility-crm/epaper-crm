import { Hono } from 'hono';
import { editionsRouter } from './editions';
import { uploadRouter } from './upload';
import { internalRouter } from './internal';
import { statsRouter } from './stats';
import { err, ErrorCode, ok } from '@epaper/types';
import { orgUserAuth } from './middleware';

const app = new Hono();

app.route('/', internalRouter);

app.use('/api/content/*', orgUserAuth);
app.route('/api/content', editionsRouter);
app.route('/api/content', uploadRouter);
app.route('/api/content', statsRouter);

app.get('/health', (c) => c.json(ok({ status: 'ok', worker: 'content' })));

app.notFound((c) => {
  return c.json(err(ErrorCode.NOT_FOUND, 'Not found'), 404);
});

export default {
  fetch: app.fetch,
};
