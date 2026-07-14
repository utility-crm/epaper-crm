import { SupportEnv, OrganizationMemoryRecord } from '../types.js';

export async function ingestMemory(
  env: SupportEnv,
  params: {
    tenantId: string;
    title: string;
    content: string;
  }
): Promise<OrganizationMemoryRecord> {
  const id = crypto.randomUUID();
  const vectorId = `mem-${id}`;

  // 1. Generate Embedding using Cloudflare Workers AI
  let values: number[] = [];
  try {
    const embeddingResponse = await env.AI.run('@cf/baai/bge-small-en-v1.5', {
      text: [params.content],
    });
    if (embeddingResponse?.data?.[0]) {
      values = embeddingResponse.data[0];
    }
  } catch (err) {
    console.warn('Embedding generation warning, fallback vector used if mock mode:', err);
  }

  // 2. Insert into Vectorize Index if embedding succeeded
  if (env.SUPPORT_KNOWLEDGE_INDEX && values.length > 0) {
    try {
      await env.SUPPORT_KNOWLEDGE_INDEX.upsert([
        {
          id: vectorId,
          values,
          metadata: {
            tenant_id: params.tenantId,
            title: params.title,
          },
        },
      ]);
    } catch (err) {
      console.warn('Vectorize index upsert failed or not configured:', err);
    }
  }

  // 3. Insert into D1 Database
  const now = new Date().toISOString();
  await env.SUPPORT_DB.prepare(
    `INSERT INTO organization_memories (id, tenant_id, title, content_chunk, vector_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, params.tenantId, params.title, params.content, vectorId, now, now)
    .run();

  return {
    id,
    tenant_id: params.tenantId,
    title: params.title,
    content_chunk: params.content,
    vector_id: vectorId,
    created_at: now,
    updated_at: now,
  };
}

export async function searchMemory(
  env: SupportEnv,
  params: {
    tenantId: string;
    query: string;
    topK?: number;
  }
): Promise<Array<{ title: string; content: string; score: number }>> {
  const topK = params.topK || 3;

  if (!env.AI || !env.SUPPORT_KNOWLEDGE_INDEX) {
    // Fallback: LIKE query in D1 if AI/Vectorize not bound locally
    const { results } = await env.SUPPORT_DB.prepare(
      `SELECT title, content_chunk FROM organization_memories
       WHERE tenant_id = ? AND (title LIKE ? OR content_chunk LIKE ?)
       LIMIT ?`
    )
      .bind(params.tenantId, `%${params.query}%`, `%${params.query}%`, topK)
      .all<{ title: string; content_chunk: string }>();

    return (results || []).map((row) => ({
      title: row.title,
      content: row.content_chunk,
      score: 1.0,
    }));
  }

  try {
    // 1. Generate embedding for query
    const embeddingResponse = await env.AI.run('@cf/baai/bge-small-en-v1.5', {
      text: [params.query],
    });
    const queryVector = embeddingResponse?.data?.[0];
    if (!queryVector) {
      return [];
    }

    // 2. Query Vectorize filtered by tenant_id
    const matches = await env.SUPPORT_KNOWLEDGE_INDEX.query(queryVector, {
      topK,
      filter: {
        tenant_id: params.tenantId,
      },
    });

    const vectorIds = matches.matches?.map((m: any) => m.id) || [];
    if (vectorIds.length === 0) {
      return [];
    }

    // 3. Fetch full content chunks from D1
    const placeholders = vectorIds.map(() => '?').join(',');
    const { results } = await env.SUPPORT_DB.prepare(
      `SELECT vector_id, title, content_chunk FROM organization_memories WHERE vector_id IN (${placeholders})`
    )
      .bind(...vectorIds)
      .all<{ vector_id: string; title: string; content_chunk: string }>();

    const contentMap = new Map(results?.map((r) => [r.vector_id, r]) || []);

    return matches.matches.map((m: any) => {
      const record = contentMap.get(m.id);
      return {
        title: record?.title || m.metadata?.title || 'Knowledge Base',
        content: record?.content_chunk || '',
        score: m.score || 0,
      };
    });
  } catch (err) {
    console.error('Vector search error, falling back to D1 text query:', err);
    const { results } = await env.SUPPORT_DB.prepare(
      `SELECT title, content_chunk FROM organization_memories
       WHERE tenant_id = ? AND (title LIKE ? OR content_chunk LIKE ?)
       LIMIT ?`
    )
      .bind(params.tenantId, `%${params.query}%`, `%${params.query}%`, topK)
      .all<{ title: string; content_chunk: string }>();

    return (results || []).map((row) => ({
      title: row.title,
      content: row.content_chunk,
      score: 0.8,
    }));
  }
}

export async function listMemories(
  env: SupportEnv,
  tenantId: string
): Promise<OrganizationMemoryRecord[]> {
  const { results } = await env.SUPPORT_DB.prepare(
    `SELECT * FROM organization_memories WHERE tenant_id = ? ORDER BY created_at DESC`
  )
    .bind(tenantId)
    .all<OrganizationMemoryRecord>();

  return results || [];
}

export async function deleteMemory(
  env: SupportEnv,
  id: string,
  tenantId: string
): Promise<boolean> {
  const record = await env.SUPPORT_DB.prepare(
    `SELECT vector_id FROM organization_memories WHERE id = ? AND tenant_id = ?`
  )
    .bind(id, tenantId)
    .first<{ vector_id: string }>();

  if (!record) return false;

  await env.SUPPORT_DB.prepare(
    `DELETE FROM organization_memories WHERE id = ? AND tenant_id = ?`
  )
    .bind(id, tenantId)
    .run();

  if (env.SUPPORT_KNOWLEDGE_INDEX && record.vector_id) {
    try {
      await env.SUPPORT_KNOWLEDGE_INDEX.deleteByIds([record.vector_id]);
    } catch (err) {
      console.warn('Vectorize index delete failed:', err);
    }
  }

  return true;
}
