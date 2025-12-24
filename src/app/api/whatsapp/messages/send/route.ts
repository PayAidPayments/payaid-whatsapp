import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'
import { z } from 'zod'
import axios from 'axios'

const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  templateId: z.string().optional(),
})

// POST /api/whatsapp/messages/send - Send a WhatsApp message
export async function POST(request: NextRequest) {
  try {
    // Check WhatsApp module license
    const { tenantId, userId } = await requireModuleAccess(request, 'marketing')

    const body = await request.json()
    const validated = sendMessageSchema.parse(body)

    if (!validated.text && !validated.mediaUrl && !validated.templateId) {
      return NextResponse.json(
        { error: 'text, mediaUrl, or templateId required' },
        { status: 400 }
      )
    }

    // Fetch conversation
    const conversation = await prisma.whatsappConversation.findUnique({
      where: { id: validated.conversationId },
      include: {
        account: true,
        contact: true,
        session: true,
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

    // Use preferred session or first available
    let session = conversation.session
    if (!session) {
      session = await prisma.whatsappSession.findFirst({
        where: {
          accountId: conversation.accountId,
          status: 'connected',
          isActive: true,
        },
      })
    }

    if (!session) {
      return NextResponse.json(
        { error: 'No active WhatsApp session' },
        { status: 400 }
      )
    }

    // Get contact's WhatsApp number
    const identity = await prisma.whatsappContactIdentity.findFirst({
      where: { contactId: conversation.contactId },
    })

    if (!identity) {
      return NextResponse.json(
        { error: 'Contact has no WhatsApp number' },
        { status: 400 }
      )
    }

    const toNumber = identity.whatsappNumber
    const fromNumber = session.phoneNumber

    if (!fromNumber) {
      return NextResponse.json(
        { error: 'Session phone number not available' },
        { status: 400 }
      )
    }

    // Send via WAHA
    let whatsappMessageId = ''
    let status = 'sent'
    let errorCode = ''
    let errorMessage = ''

    if (!conversation.account.wahaBaseUrl || !conversation.account.wahaApiKey) {
      return NextResponse.json(
        { error: 'WAHA configuration incomplete' },
        { status: 400 }
      )
    }

    try {
      const sendPayload: any = {
        to: toNumber,
      }

      if (validated.text) {
        sendPayload.body = validated.text
      } else if (validated.mediaUrl) {
        sendPayload.media = { url: validated.mediaUrl }
        if (validated.text) {
          sendPayload.caption = validated.text
        }
      } else if (validated.templateId) {
        const template = await prisma.whatsappTemplate.findUnique({
          where: { id: validated.templateId },
        })
        if (!template) {
          return NextResponse.json(
            { error: 'Template not found' },
            { status: 404 }
          )
        }
        sendPayload.body = template.bodyTemplate
      }

      const wahaResponse = await axios.post(
        `${conversation.account.wahaBaseUrl}/api/instances/${session.providerSessionId}/messages`,
        sendPayload,
        {
          headers: { Authorization: `Bearer ${conversation.account.wahaApiKey}` },
          timeout: 10000,
        }
      )

      whatsappMessageId = wahaResponse.data.messageId || wahaResponse.data.id || ''
      status = 'sent'
    } catch (error: any) {
      status = 'failed'
      errorCode = error.response?.status?.toString() || 'UNKNOWN'
      errorMessage = error.response?.data?.message || error.message || 'Failed to send message'
      console.error('WAHA send error:', error)
    }

    // Store message
    const message = await prisma.whatsappMessage.create({
      data: {
        conversationId: validated.conversationId,
        sessionId: session.id,
        employeeId: userId,
        direction: 'out',
        messageType: validated.templateId
          ? 'template'
          : validated.mediaUrl
            ? 'image'
            : 'text',
        whatsappMessageId,
        fromNumber,
        toNumber,
        text: validated.text || null,
        mediaUrl: validated.mediaUrl || null,
        templateId: validated.templateId || null,
        status,
        errorCode: errorCode || null,
        errorMessage: errorMessage || null,
        sentAt: new Date(),
      },
    })

    // Update conversation
    await prisma.whatsappConversation.update({
      where: { id: validated.conversationId },
      data: {
        lastMessageAt: new Date(),
        lastDirection: 'out',
      },
    })

    // Update session daily counter
    await prisma.whatsappSession.update({
      where: { id: session.id },
      data: {
        dailySentCount: { increment: 1 },
        lastSeenAt: new Date(),
      },
    })

    await prisma.whatsappAuditLog.create({
      data: {
        accountId: conversation.accountId,
        sessionId: session.id,
        action: 'message_send',
        status: status === 'failed' ? 'failure' : 'success',
        errorCode: errorCode || null,
        errorMessage: errorMessage || null,
        userId: userId,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      },
    })

    return NextResponse.json(message, { status: 201 })
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

    console.error('POST /api/whatsapp/messages/send error:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}
