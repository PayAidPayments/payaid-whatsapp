import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'
import { z } from 'zod'

const updateConversationSchema = z.object({
  sessionId: z.string().optional(),
  ticketId: z.string().optional(),
  status: z.enum(['open', 'closed', 'archived']).optional(),
})

// GET /api/whatsapp/conversations/[conversationId] - Get single conversation details
export async function GET(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  try {
    // Check WhatsApp module license
    const { tenantId } = await requireModuleAccess(request, 'marketing')

    const conversation = await prisma.whatsappConversation.findUnique({
      where: { id: params.conversationId },
      include: {
        contact: true,
        session: {
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        account: {
          select: {
            id: true,
            businessName: true,
            status: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (conversation.account.tenantId !== tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    return NextResponse.json(conversation)
  } catch (error) {
    // Handle license errors
    if (error && typeof error === 'object' && 'moduleId' in error) {
      return handleLicenseError(error)
    }
    console.error('GET /api/whatsapp/conversations/[conversationId] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch conversation' },
      { status: 500 }
    )
  }
}

// PATCH /api/whatsapp/conversations/[conversationId] - Update conversation
export async function PATCH(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  try {
    // Check WhatsApp module license
    const { tenantId } = await requireModuleAccess(request, 'marketing')

    const body = await request.json()
    const validated = updateConversationSchema.parse(body)

    const conversation = await prisma.whatsappConversation.findUnique({
      where: { id: params.conversationId },
      include: { account: true },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (conversation.account.tenantId !== tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Validate sessionId if provided
    if (validated.sessionId) {
      const session = await prisma.whatsappSession.findUnique({
        where: { id: validated.sessionId },
      })
      if (!session || session.accountId !== conversation.accountId) {
        return NextResponse.json(
          { error: 'Invalid session' },
          { status: 400 }
        )
      }
    }

    const updateData: any = {}
    if (validated.sessionId !== undefined) updateData.sessionId = validated.sessionId
    if (validated.ticketId !== undefined) updateData.ticketId = validated.ticketId
    if (validated.status !== undefined) updateData.status = validated.status

    const updated = await prisma.whatsappConversation.update({
      where: { id: params.conversationId },
      data: updateData,
      include: {
        contact: true,
        session: true,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    // Handle license errors
    if (error && typeof error === 'object' && 'moduleId' in error) {
      return handleLicenseError(error)
    }
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('PATCH /api/whatsapp/conversations/[conversationId] error:', error)
    return NextResponse.json(
      { error: 'Failed to update conversation' },
      { status: 500 }
    )
  }
}
