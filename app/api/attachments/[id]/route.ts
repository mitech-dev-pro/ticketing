// Permission-checked attachment download/preview route (BUILD_PLAN.md Phase 3). The
// actual bytes live in Vercel Blob or, in local dev, on disk (lib/storage.ts); this
// route is the only place that ever resolves a storageKey, so a NOTE's attachment can
// never be fetched by someone who can't readNotes, and nothing exposes the
// underlying Blob URL to the client.

import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { can, type PermissionTicket } from '@/lib/permissions';
import { retrieveAttachment } from '@/lib/storage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: {
      event: { select: { type: true } },
      ticket: {
        select: {
          number: true,
          requesterId: true,
          requesterDepartmentId: true,
          assigneeId: true,
          confidential: true,
          status: true,
          legs: { select: { departmentId: true, outAt: true } },
          mentions: { select: { type: true, userId: true, departmentId: true } },
        },
      },
    },
  });
  if (!attachment) return new NextResponse('Not found', { status: 404 });

  const permissionTicket: PermissionTicket = {
    id: String(attachment.ticket.number),
    requesterId: attachment.ticket.requesterId,
    requesterDepartmentId: attachment.ticket.requesterDepartmentId,
    assigneeId: attachment.ticket.assigneeId,
    confidential: attachment.ticket.confidential,
    status: attachment.ticket.status,
    legs: attachment.ticket.legs,
    mentions: attachment.ticket.mentions.map((mention) => ({
      type: mention.type === 'PERSON' ? ('person' as const) : ('department' as const),
      id: (mention.type === 'PERSON' ? mention.userId : mention.departmentId) ?? '',
    })),
  };

  const requiredAction = attachment.event.type === 'NOTE' ? 'readNotes' : 'view';
  if (!can(requiredAction, session.user, permissionTicket)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { buffer } = await retrieveAttachment(attachment.storageKey);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.filename)}"`,
      'Cache-Control': 'private, max-age=0, no-cache',
    },
  });
}
