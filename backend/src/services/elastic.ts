import { Client } from '@elastic/elasticsearch';

const EMAILS_INDEX = 'emails';

export const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
});

export interface EmailIndexDoc {
  jobId: string;
  batchId: string;
  userId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
  sentAt: string;
  messageId: string;
  previewUrl?: string;
}

// Creates the index on startup if it does not exist yet.
export async function initElasticsearch(): Promise<void> {
  const exists = await esClient.indices.exists({ index: EMAILS_INDEX });

  if (!exists) {
    await esClient.indices.create({
      index: EMAILS_INDEX,
      mappings: {
        properties: {
          jobId: { type: 'keyword' },
          batchId: { type: 'keyword' },
          userId: { type: 'keyword' },
          recipientEmail: { type: 'keyword' },
          recipientName: { type: 'text' },
          subject: { type: 'text' },
          body: { type: 'text' },
          sentAt: { type: 'date' },
          messageId: { type: 'keyword' },
          previewUrl: { type: 'keyword', index: false },
        },
      },
    });
    console.log(`[Elastic] Created index ${EMAILS_INDEX}`);
  }
}

// Upserts by jobId so re-indexing the same job never duplicates.
export async function indexEmailJob(doc: EmailIndexDoc): Promise<void> {
  await esClient.index({
    index: EMAILS_INDEX,
    id: doc.jobId,
    document: doc,
  });
}

export interface EmailSearchResult {
  jobId: string;
  userId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  sentAt: string;
  messageId: string;
  previewUrl?: string;
}

// Full-text search over subject, body and recipient name, scoped to one user.
export async function searchEmails(userId: string, query: string): Promise<EmailSearchResult[]> {
  const response = await esClient.search<EmailIndexDoc>({
    index: EMAILS_INDEX,
    query: {
      bool: {
        must: {
          multi_match: {
            query,
            fields: ['subject', 'body', 'recipientName'],
            type: 'best_fields',
            fuzziness: 'AUTO',
          },
        },
        filter: {
          term: { userId },
        },
      },
    },
    size: 50,
    _source: true,
  });

  return response.hits.hits.map((hit) => {
    const src = hit._source!;
    return {
      jobId: src.jobId,
      userId: src.userId,
      recipientEmail: src.recipientEmail,
      recipientName: src.recipientName,
      subject: src.subject,
      sentAt: src.sentAt,
      messageId: src.messageId,
      previewUrl: src.previewUrl,
    };
  });
}
