import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'
import { z } from 'zod'
import axios from 'axios'

const createSessionSchema = z.object({
  accountId: z.string().min(1),
  employeeId: z.string().optional(),
  deviceName: z.string().optional(),
})

// POST /api/whatsapp/sessions - Create a new session (get QR code for employee to scan)
export async function POST(request: NextRequest) {
  try {
    // Check WhatsApp module license
    const { tenantId, userId } = await requireModuleAccess(request, 'marketing')

    const body = await request.json()
    const validated = createSessionSchema.parse(body)

    // Verify account belongs to tenant
    const account = await prisma.whatsappAccount.findUnique({
      where: { id: validated.accountId },
    })

    if (!account || account.tenantId !== tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    if (!account.wahaBaseUrl || !account.wahaApiKey) {
      return NextResponse.json(
        { error: 'WAHA configuration incomplete' },
        { status: 400 }
      )
    }

    // Call WAHA to create session and get QR
    const sessionName = `${tenantId}-${validated.employeeId || 'shared'}-${Date.now()}`
    let qrCodeUrl = ''

    try {
      const wahaResponse = await axios.post(
        `${account.wahaBaseUrl}/api/instances`,
        { name: sessionName },
        {
          headers: { Authorization: `Bearer ${account.wahaApiKey}` },
          timeout: 10000,
        }
      )

      // Get QR code
      const qrResponse = await axios.get(
        `${account.wahaBaseUrl}/api/instances/${sessionName}/qr`,
        {
          headers: { Authorization: `Bearer ${account.wahaApiKey}` },
          timeout: 10000,
        }
      )

      qrCodeUrl = qrResponse.data.qr || qrResponse.data.qrcode || ''
    } catch (error: any) {
      console.error('WAHA session creation error:', error)
      const errorMessage = error.response?.data?.message || error.message || 'Failed to create WAHA session'
      return NextResponse.json(
        { error: `Failed to create WAHA session: ${errorMessage}` },
        { status: 500 }
      )
    }

    // Store session in DB
    const session = await prisma.whatsappSession.create({
      data: {
        accountId: validated.accountId,
        employeeId: validated.employeeId || null,
        providerSessionId: sessionName,
        qrCodeUrl,
        status: 'pending_qr',
        deviceName: validated.deviceName || 'Device',
      },
    })

    await prisma.whatsappAuditLog.create({
      data: {
        accountId: validated.accountId,
        sessionId: session.id,
        action: 'session_create',
        status: 'success',
        description: `Created session ${sessionName}`,
        userId: userId,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      },
    })

    return NextResponse.json(session, { status: 201 })
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

    console.error('POST /api/whatsapp/sessions error:', error)
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    )
  }
}
