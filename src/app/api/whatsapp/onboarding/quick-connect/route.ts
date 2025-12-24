import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'
import { z } from 'zod'
import {
  allocatePort,
  deallocatePort,
  generateSecureKey,
  deployWahaContainer,
  waitAndGetQrCode,
  configureWahaWebhooks,
  cleanupContainer,
} from '@/lib/whatsapp/docker-helpers'

const INTERNAL_BASE_URL = process.env.INTERNAL_WAHA_BASE_URL || 'http://127.0.0.1'

const quickConnectSchema = z.object({
  businessName: z.string().min(1, 'Business name required'),
  primaryPhone: z.string().min(1, 'Phone number required'),
})

/**
 * POST /api/whatsapp/onboarding/quick-connect
 *
 * USER INPUT:
 * - businessName: string (required)
 * - primaryPhone: string (required, E.164 format)
 *
 * WHAT HAPPENS (HIDDEN FROM USER):
 * 1. Generate unique instance ID
 * 2. Generate secure API key
 * 3. Spawn Docker container with WAHA
 * 4. Wait for container to be ready
 * 5. Get QR code from WAHA
 * 6. Configure webhooks
 * 7. Store account in database
 * 8. Return QR code to UI
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validated = quickConnectSchema.parse(body)

    // Validate E.164 format
    const phoneRegex = /^\+?[1-9]\d{1,14}$/
    const cleanPhone = validated.primaryPhone.trim().startsWith('+')
      ? validated.primaryPhone.trim()
      : '+' + validated.primaryPhone.trim()

    if (!phoneRegex.test(cleanPhone)) {
      return NextResponse.json(
        { error: 'Phone must be in format: +919876543210' },
        { status: 400 }
      )
    }

    // ========================================
    // STEP 1: Generate instance ID and API key
    // ========================================
    const instanceId = `waha-${tenantId.substring(0, 8)}-${Date.now()}`
    const apiKey = generateSecureKey()
    const allocatedPort = allocatePort()

    console.log(`[WHATSAPP] Creating account for ${validated.businessName} (${instanceId})`)

    // ========================================
    // STEP 2: Deploy WAHA container
    // ========================================
    let containerData
    try {
      containerData = await deployWahaContainer(instanceId, apiKey, allocatedPort)
      console.log(`[WHATSAPP] Container deployed: ${containerData.containerId}`)
    } catch (error: any) {
      console.error(`[WHATSAPP] Container deployment failed:`, error)
      deallocatePort(allocatedPort)
      return NextResponse.json(
        {
          error: 'Failed to set up WhatsApp. Please try again in a moment.',
        },
        { status: 500 }
      )
    }

    // ========================================
    // STEP 3: Wait for container ready + get QR code
    // ========================================
    let qrCodeData
    try {
      qrCodeData = await waitAndGetQrCode(
        `${INTERNAL_BASE_URL}:${allocatedPort}`,
        apiKey,
        instanceId,
        60000 // 60 second timeout (container startup + QR retrieval)
      )
      console.log(`[WHATSAPP] QR code obtained for ${instanceId}`)
    } catch (error: any) {
      console.error(`[WHATSAPP] QR code retrieval failed:`, error)
      const errorMessage = error.message || 'Unknown error'
      console.error(`[WHATSAPP] Error details:`, {
        message: errorMessage,
        instanceId,
        wahaUrl: `${INTERNAL_BASE_URL}:${allocatedPort}`,
        containerId: containerData.containerId,
      })
      await cleanupContainer(containerData.containerId, allocatedPort)
      return NextResponse.json(
        {
          error: `WhatsApp connection failed: ${errorMessage}. Please try again.`,
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        },
        { status: 500 }
      )
    }

    // ========================================
    // STEP 4: Configure webhooks
    // ========================================
    try {
      await configureWahaWebhooks(
        `${INTERNAL_BASE_URL}:${allocatedPort}`,
        apiKey,
        instanceId
      )
      console.log(`[WHATSAPP] Webhooks configured for ${instanceId}`)
    } catch (error: any) {
      console.error(`[WHATSAPP] Webhook config failed (non-fatal):`, error)
      // Continue anyway - webhooks can be retried
    }

    // ========================================
    // STEP 5: Store in database
    // ========================================
    const account = await prisma.whatsappAccount.create({
      data: {
        tenantId: tenantId,
        deploymentType: 'payaid_hosted',
        paynaidInstanceId: instanceId,
        internalWahaUrl: `${INTERNAL_BASE_URL}:${allocatedPort}`,
        internalApiKey: apiKey, // In production, encrypt this
        businessName: validated.businessName.trim(),
        primaryPhone: cleanPhone,
        status: 'waiting_qr',
        // Legacy fields for backward compatibility
        channelType: 'web',
        isWebConnected: true,
      },
    })

    console.log(`[WHATSAPP] Account created: ${account.id}`)

    // ========================================
    // STEP 6: Log to audit
    // ========================================
    await prisma.whatsappAuditLog.create({
      data: {
        accountId: account.id,
        action: 'account_quick_connect_start',
        status: 'success',
        description: `Quick-connect setup initiated for ${validated.businessName}`,
        userId: userId,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      },
    })

    // ========================================
    // STEP 7: Return response to UI
    // ========================================
    return NextResponse.json(
      {
        accountId: account.id,
        businessName: account.businessName,
        qrCodeUrl: qrCodeData.qr, // Base64 image or data URL
        qrCodeText: qrCodeData.qrText || 'Scan with WhatsApp', // Fallback text
        instruction: 'Open WhatsApp on your phone and scan the code below to connect',
        status: 'waiting_for_scan',
      },
      { status: 201 }
    )
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

    console.error(`[WHATSAPP] POST /quick-connect error:`, error)
    return NextResponse.json(
      {
        error: 'An unexpected error occurred. Please try again.',
      },
      { status: 500 }
    )
  }
}
