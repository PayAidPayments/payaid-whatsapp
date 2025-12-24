import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@payaid/db'

// POST /api/whatsapp/webhooks/status - WAHA sends message status updates (delivered, read, etc.)
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

    const { id, status: wahaStatus, timestamp } = data

    if (!id) {
      return NextResponse.json(
        { error: 'Missing message ID' },
        { status: 400 }
      )
    }

    // Find message
    const message = await prisma.whatsappMessage.findFirst({
      where: { whatsappMessageId: id },
    })

    if (!message) {
      console.warn(`Message not found: ${id}`)
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    // Map WAHA status to our status
    let newStatus = message.status
    let deliveredAt = message.deliveredAt
    let readAt = message.readAt

    const statusUpper = (wahaStatus || '').toUpperCase()
    if (statusUpper === 'DELIVERED' || statusUpper === 'ACK') {
      newStatus = 'delivered'
      if (!deliveredAt) {
        deliveredAt = timestamp ? new Date(timestamp * 1000) : new Date()
      }
    } else if (statusUpper === 'READ') {
      newStatus = 'read'
      readAt = timestamp ? new Date(timestamp * 1000) : new Date()
    } else if (statusUpper === 'FAILED' || statusUpper === 'ERROR') {
      newStatus = 'failed'
    }

    // Update message
    await prisma.whatsappMessage.update({
      where: { id: message.id },
      data: {
        status: newStatus,
        deliveredAt,
        readAt,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/whatsapp/webhooks/status error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
