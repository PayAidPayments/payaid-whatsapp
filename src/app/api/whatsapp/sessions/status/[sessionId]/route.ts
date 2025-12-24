import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'
import axios from 'axios'

// GET /api/whatsapp/sessions/status/[sessionId] - Check session connection status
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    // Check WhatsApp module license
    const { tenantId, userId } = await requireModuleAccess(request, 'marketing')

    const session = await prisma.whatsappSession.findUnique({
      where: { id: params.sessionId },
      include: { account: true },
    })

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (session.account.tenantId !== tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Check status with WAHA
    let newStatus = session.status
    let phoneNumber = session.phoneNumber

    if (session.account.wahaBaseUrl && session.account.wahaApiKey && session.providerSessionId) {
      try {
        const statusResponse = await axios.get(
          `${session.account.wahaBaseUrl}/api/instances/${session.providerSessionId}`,
          {
            headers: { Authorization: `Bearer ${session.account.wahaApiKey}` },
            timeout: 5000,
          }
        )

        const wahaState = statusResponse.data.state || statusResponse.data.status || 'DISCONNECTED'
        newStatus = wahaState === 'CONNECTED' || wahaState === 'connected' ? 'connected' : 'pending_qr'
        phoneNumber = statusResponse.data.me?.user || statusResponse.data.phoneNumber || session.phoneNumber

        // Update if changed
        if (newStatus !== session.status || phoneNumber !== session.phoneNumber) {
          await prisma.whatsappSession.update({
            where: { id: params.sessionId },
            data: {
              status: newStatus,
              phoneNumber,
              lastSyncAt: new Date(),
              lastSeenAt: newStatus === 'connected' ? new Date() : session.lastSeenAt,
            },
          })
        }
      } catch (error) {
        console.error('WAHA status check error:', error)
        // Return cached status if WAHA is unreachable
      }
    }

    return NextResponse.json({
      status: newStatus,
      phoneNumber,
      lastSyncAt: session.lastSyncAt,
      lastSeenAt: session.lastSeenAt,
    })
  } catch (error) {
    // Handle license errors
    if (error && typeof error === 'object' && 'moduleId' in error) {
      return handleLicenseError(error)
    }
    console.error('GET /api/whatsapp/sessions/status/[sessionId] error:', error)
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    )
  }
}
