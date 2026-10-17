import { NextRequest } from 'next/server';
import { libraryHandlers } from '../../../../lib/library';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return libraryHandlers().file(request, (await context.params).id);
}
