import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'
import { z } from 'zod'
import axios from 'axios'

const createWhatsappAccountSchema = z.object({
  deploymentType: z.enum(['payaid_hosted', 'self_hosted']).optional(),
  channelType: z.enum(['web', 'cloud']).default('web'),
  wahaBaseUrl: z.string().url().optional(),
  wahaApiKey: z.string().optional(),
  businessName: z.string().optional(),
  primaryPhone: z.string().optional(),
})

// GET /api/whatsapp/accounts - List all WhatsApp accounts for tenant
export async function GET(request: NextRequest) {
  try {
    // Check WhatsApp module license
    const { tenantId } = await requireModuleAccess(request, 'marketing')

    const accounts = await prisma.whatsappAccount.findMany({
      where: {
        tenantId: tenantId,
      },
      include: {
        sessions: {
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
        templates: true,
        _count: {
          select: {
            conversations: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Don't return API keys or internal URLs
    const safeAccounts = accounts.map((account) => {
      const { wahaApiKey, internalApiKey, accessToken, metaAppSecret, internalWahaUrl, ...safeAccount } = account
      return safeAccount
    })

    return NextResponse.json({ accounts: safeAccounts })
  } catch (error) {
    // Handle license errors
    if (error && typeof error === 'object' && 'moduleId' in error) {
      return handleLicenseError(error)
    }
    console.error('GET /api/whatsapp/accounts error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch WhatsApp accounts' },
      { status: 500 }
    )
  }
}

// POST /api/whatsapp/accounts - Create a new WhatsApp account (web channel only for now)
export async function POST(request: NextRequest) {
  try {
    // Check WhatsApp module license
    const { tenantId, userId } = await requireWhatsAppAccess(request)

    const body = await request.json()
    const validated = createWhatsappAccountSchema.parse(body)

    // Determine deployment type
    const deploymentType = validated.deploymentType || 'self_hosted' // Default to self_hosted for backward compatibility

    // For self-hosted, require WAHA URL and API key
    if (deploymentType === 'self_hosted') {
      if (validated.channelType !== 'web') {
        return NextResponse.json(
          { error: 'Only web channel supported now' },
          { status: 400 }
        )
      }

      if (!validated.wahaBaseUrl) {
        return NextResponse.json(
          { error: 'wahaBaseUrl required for self-hosted deployment' },
          { status: 400 }
        )
      }

      // Test connection to WAHA
      try {
        const testResponse = await axios.get(`${validated.wahaBaseUrl}/api/health`, {
          headers: validated.wahaApiKey
            ? { Authorization: `Bearer ${validated.wahaApiKey}` }
            : {},
          timeout: 5000,
        })
        if (!testResponse.data) throw new Error('WAHA health check failed')
      } catch (error) {
        console.error('WAHA connection test failed:', error)
        return NextResponse.json(
          { error: 'Failed to connect to WAHA server. Please check the URL and API key.' },
          { status: 400 }
        )
      }
    }

    // For payaid_hosted, redirect to one-click setup
    if (deploymentType === 'payaid_hosted') {
      return NextResponse.json(
        { 
          error: 'Please use the one-click setup at /dashboard/whatsapp/setup for automatic deployment',
          redirectTo: '/dashboard/whatsapp/setup'
        },
        { status: 400 }
      )
    }

    // Create account (self-hosted)
    const account = await prisma.whatsappAccount.create({
      data: {
        tenantId: tenantId,
        deploymentType: 'self_hosted',
        channelType: validated.channelType || 'web',
        wahaBaseUrl: validated.wahaBaseUrl || null,
        wahaApiKey: validated.wahaApiKey || null, // In production, encrypt this
        businessName: validated.businessName || null,
        primaryPhone: validated.primaryPhone || null,
        isWebConnected: true,
        status: 'active',
      },
    })

    // Log to audit
    await prisma.whatsappAuditLog.create({
      data: {
        accountId: account.id,
        action: 'account_create',
        status: 'success',
        description: `Created WAHA account at ${validated.wahaBaseUrl}`,
        userId: userId,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      },
    })

    // Don't return API keys or internal URLs
    const { wahaApiKey, internalApiKey, accessToken, metaAppSecret, internalWahaUrl, ...safeAccount } = account

    return NextResponse.json(safeAccount, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    // Handle license errors
    if (error && typeof error === 'object' && 'moduleId' in error) {
      return handleLicenseError(error)
    }
    
    console.error('POST /api/whatsapp/accounts error:', error)
    return NextResponse.json(
      { error: 'Failed to create WhatsApp account' },
      { status: 500 }
    )
  }
}
