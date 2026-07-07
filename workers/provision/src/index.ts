import { Hono } from 'hono';
import { ok, err, ErrorCode } from '@epaper/types';

export interface Env {
  CONTROL_DB: D1Database;
  ADMIN_WORKER: Fetcher;
  GH_TOKEN: string;
  GH_REPO: string;
}

const app = new Hono<{ Bindings: Env }>();

async function getLatestRunId(env: Env, workflowFileName: string): Promise<number | null> {
  const url = `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/${workflowFileName}/runs?per_page=1`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${env.GH_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Cloudflare-Worker'
    }
  });
  
  if (!res.ok) return null;
  const data = await res.json() as any;
  if (data.workflow_runs && data.workflow_runs.length > 0) {
    return data.workflow_runs[0].id;
  }
  return null;
}

async function dispatchWorkflow(env: Env, workflowFile: string, slug: string): Promise<number | null> {
  const url = `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/${workflowFile}/dispatches`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GH_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Cloudflare-Worker'
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: { tenant_slug: slug }
    })
  });
  
  if (!res.ok) {
    console.error('Failed to dispatch workflow', await res.text());
    return null;
  }
  
  // Wait a moment for GitHub to create the run
  await new Promise(resolve => setTimeout(resolve, 3000));
  return await getLatestRunId(env, workflowFile);
}

async function pollAndActivate(env: Env, runId: number, slug: string, isDeprovision: boolean) {
  let attempt = 0;
  const maxAttempts = 40; // 40 * 15s = 10 minutes
  
  while (attempt < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 15000));
    attempt++;
    
    const url = `https://api.github.com/repos/${env.GH_REPO}/actions/runs/${runId}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${env.GH_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Cloudflare-Worker'
      }
    });
    
    if (res.ok) {
      const data = await res.json() as any;
      if (data.status === 'completed') {
        if (data.conclusion === 'success') {
          // Tell ADMIN_WORKER to activate or delete
          const endpoint = isDeprovision ? `/api/tenants/internal/${slug}/delete-complete` : `/api/tenants/internal/${slug}/activate`;
          
          const reqBody = isDeprovision ? {} : {
            d1_id: `epaper-${slug}`, // Simplified for now, real script outputs this
            r2_bucket: `epaper-${slug}`
          };
          
          await env.ADMIN_WORKER.fetch(new Request(`http://admin${endpoint}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
          }));
        } else {
          console.error(`Workflow ${runId} failed with conclusion: ${data.conclusion}`);
          // Fallback: set status to error? For now, leave pending/deleting
        }
        break; // Done polling
      }
    }
  }
}

app.post('/api/provision/trigger', async (c) => {
  const { slug } = await c.req.json();
  if (!slug) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing slug'), 400);
  
  // Set status to provisioning
  await c.env.CONTROL_DB.prepare('UPDATE tenants SET status = ? WHERE slug = ?').bind('provisioning', slug).run();
  
  const runId = await dispatchWorkflow(c.env, 'provision-tenant.yml', slug);
  if (runId) {
    await c.env.CONTROL_DB.prepare('UPDATE tenants SET provision_run_id = ? WHERE slug = ?').bind(runId.toString(), slug).run();
    c.executionCtx.waitUntil(pollAndActivate(c.env, runId, slug, false));
    return c.json(ok({ runId }));
  } else {
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to trigger provision workflow'), 500);
  }
});

app.post('/api/provision/deprovision', async (c) => {
  const { slug } = await c.req.json();
  if (!slug) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing slug'), 400);
  
  const runId = await dispatchWorkflow(c.env, 'deprovision-tenant.yml', slug);
  if (runId) {
    c.executionCtx.waitUntil(pollAndActivate(c.env, runId, slug, true));
    return c.json(ok({ runId }));
  } else {
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to trigger deprovision workflow'), 500);
  }
});

app.get('/api/provision/debug/:runId', async (c) => {
  const runId = c.req.param('runId');
  const url = `https://api.github.com/repos/${c.env.GH_REPO}/actions/runs/${runId}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${c.env.GH_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Cloudflare-Worker'
    }
  });
  if (!res.ok) return c.json(err(ErrorCode.INTERNAL_ERROR, await res.text()), 500);
  const data = await res.json();
  return c.json(ok(data));
});

app.get('/api/provision/debug/:runId/jobs', async (c) => {
  const runId = c.req.param('runId');
  const url = `https://api.github.com/repos/${c.env.GH_REPO}/actions/runs/${runId}/jobs`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${c.env.GH_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Cloudflare-Worker'
    }
  });
  if (!res.ok) return c.json(err(ErrorCode.INTERNAL_ERROR, await res.text()), 500);
  const data = await res.json();
  return c.json(ok(data));
});

app.get('/api/provision/debug/jobs/:jobId/logs', async (c) => {
  const jobId = c.req.param('jobId');
  const url = `https://api.github.com/repos/${c.env.GH_REPO}/actions/jobs/${jobId}/logs`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${c.env.GH_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Cloudflare-Worker'
    },
    redirect: 'follow'
  });
  if (!res.ok) return c.text(await res.text(), 500);
  return c.text(await res.text());
});

app.get('/health', (c) => c.json(ok({ status: 'ok', worker: 'provision' })));

export default {
  fetch: app.fetch,
};
