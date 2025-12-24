import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@payaid/db'

// POST /api/whatsapp/webhooks/message - WAHA sends incoming messages via webhook
// This endpoint should be public (no auth) as WAHA calls it
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { instance, data } = body

    if (!instance || !data) {
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      )
    }

    // Find session by providerSessionId
    const session = await prisma.whatsappSession.findFirst({
      where: { providerSessionId: instance },
      include: { account: true },
    })

    if (!session) {
      console.warn(`Session not found: ${instance}`)
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    const fromNumber = data.from || data.fromNumber || ''
    const text = data.body || data.text || ''
    const messageType = data.type || 'text'
    const whatsappMessageId = data.id || data.messageId || ''
    const timestamp = data.timestamp ? new Date(data.timestamp * 1000) : new Date()

    if (!fromNumber) {
      return NextResponse.json(
        { error: 'Missing from number' },
        { status: 400 }
      )
    }

    // Find or create contact
    let contactIdentity = await prisma.whatsappContactIdentity.findUnique({
      where: { whatsappNumber: fromNumber },
      include: { contact: true },
    })

    if (!contactIdentity) {
      // Create new contact
      const contact = await prisma.contact.create({
        data: {
          tenantId: session.account.tenantId,
          name: fromNumber, // Use phone as temp name
          email: '',
          phone: fromNumber,
          type: 'lead',
          status: 'active',
          source: 'whatsapp',
        },
      })

      contactIdentity = await prisma.whatsappContactIdentity.create({
        data: {
          contactId: contact.id,
          whatsappNumber: fromNumber,
          verified: true,
          verificationDate: new Date(),
        },
        include: { contact: true },
      })
    }

    // Find or create conversation
    let conversation = await prisma.whatsappConversation.findUnique({
      where: {
        accountId_contactId: {
          accountId: session.accountId,
          contactId: contactIdentity.contactId,
        },
      },
    })

    if (!conversation) {
      conversation = await prisma.whatsappConversation.create({
        data: {
          accountId: session.accountId,
          contactId: contactIdentity.contactId,
          sessionId: session.id,
          status: 'open',
        },
      })
    }

    // Store message
    await prisma.whatsappMessage.create({
      data: {
        conversationId: conversation.id,
        sessionId: session.id,
        direction: 'in',
        messageType,
        whatsappMessageId,
        fromNumber,
        toNumber: session.phoneNumber || '',
        text: text || null,
        mediaUrl: data.mediaUrl || data.media?.url || null,
        mediaMimeType: data.mediaMimeType || data.media?.mimeType || null,
        mediaCaption: data.mediaCaption || data.media?.caption || null,
        status: 'delivered',
        createdAt: timestamp,
      },
    })

    // Update conversation
    await prisma.whatsappConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: timestamp,
        lastDirection: 'in',
        unreadCount: { increment: 1 },
      },
    })

    // Update session daily counter
    await prisma.whatsappSession.update({
      where: { id: session.id },
      data: {
        dailyRecvCount: { increment: 1 },
        lastSeenAt: new Date(),
      },
    })

    // Log to audit
    await prisma.whatsappAuditLog.create({
      data: {
        accountId: session.accountId,
        sessionId: session.id,
        action: 'message_receive',
        status: 'success',
        description: `Received message from ${fromNumber}`,
        details: JSON.stringify({ messageType, hasMedia: !!data.mediaUrl }),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/whatsapp/webhooks/message error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
