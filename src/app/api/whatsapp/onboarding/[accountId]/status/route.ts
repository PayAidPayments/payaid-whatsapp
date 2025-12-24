import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'
import axios from 'axios'

/**
 * GET /api/whatsapp/onboarding/[accountId]/status
 *
 * Check if QR has been scanned and session is connected
 *
 * RESPONSE:
 * {
 *   status: "waiting_qr" | "active" | "error",
 *   phoneNumber: "+919876543210" | null,
 *   errorMessage: "..." | null
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { accountId: string } }
) {
  try {
    // Check WhatsApp module license
    const { tenantId, userId } = await requireModuleAccess(request, 'marketing')

    // Verify ownership
    const account = await prisma.whatsappAccount.findUnique({
      where: { id: params.accountId },
    })

    if (!account || account.tenantId !== tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    if (!account.internalWahaUrl || !account.internalApiKey || !account.paynaidInstanceId) {
      return NextResponse.json(
        { error: 'Account not properly configured' },
        { status: 400 }
      )
    }

    // Check WAHA instance status
    try {
      const statusResponse = await axios.get(
        `${account.internalWahaUrl}/api/instances/${account.paynaidInstanceId}`,
        {
          headers: { Authorization: `Bearer ${account.internalApiKey}` },
          timeout: 5000,
        }
      )

      const state = statusResponse.data.state || 'UNKNOWN'
      const phoneNumber = statusResponse.data.me?.user || null

      // Update account if state changed
      let newStatus = account.status
      if (state === 'CONNECTED' || state === 'connected') {
        newStatus = 'active'
        if (account.status !== 'active') {
          await prisma.whatsappAccount.update({
            where: { id: params.accountId },
            data: {
              status: 'active',
              errorMessage: null,
            },
          })

          await prisma.whatsappAuditLog.create({
            data: {
              accountId: params.accountId,
              action: 'account_qr_scanned',
              status: 'success',
              description: `WhatsApp connected: ${phoneNumber}`,
              userId: userId,
            },
          })
        }
      } else if (state === 'DISCONNECTED' || state === 'disconnected') {
        newStatus = 'disconnected'
      }

      return NextResponse.json({
        status: newStatus,
        phoneNumber,
        errorMessage: account.errorMessage,
      })
    } catch (error: any) {
      // WAHA not responding, but account exists
      console.warn(`[WHATSAPP] WAHA status check failed for ${params.accountId}:`, error.message)
      return NextResponse.json({
        status: account.status,
        phoneNumber: null,
        errorMessage: 'Connection checking...',
      })
    }
  } catch (error) {
    // Handle license errors
    if (error && typeof error === 'object' && 'moduleId' in error) {
      return handleLicenseError(error)
    }
    console.error(`GET /:accountId/status error:`, error)
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    )
  }
}
