import { ApiReference } from '@scalar/nextjs-api-reference';
import { openApiSpec } from '@/lib/api/openapi';

export const GET = ApiReference({
  spec: { content: openApiSpec },
  pageTitle: 'Freq API Reference',
});
