import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'

// GET /api/whatsapp/conversations/[conversationId]/messages - Get message history for a conversation (paginated)
export async function GET(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  try {
    // Check WhatsApp module license
    const { tenantId } = await requireModuleAccess(request, 'marketing')

    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Verify conversation belongs to tenant
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

    if (conversation.account.tenantId !== tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    const messages = await prisma.whatsappMessage.findMany({
      where: { conversationId: params.conversationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      skip: offset,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        template: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
        session: {
          select: {
            id: true,
            deviceName: true,
            phoneNumber: true,
          },
        },
      },
    })

    const total = await prisma.whatsappMessage.count({
      where: { conversationId: params.conversationId },
    })

    return NextResponse.json({
      messages: messages.reverse(), // Reverse to show chronologically
      total,
      limit,
      offset,
    })
  } catch (error) {
    // Handle license errors
    if (error && typeof error === 'object' && 'moduleId' in error) {
      return handleLicenseError(error)
    }
    console.error('GET /api/whatsapp/conversations/[conversationId]/messages error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}
