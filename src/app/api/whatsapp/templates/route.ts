import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'
import { z } from 'zod'

const createTemplateSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['welcome', 'order_update', 'support', 'delivery', 'payment', 'custom']).optional(),
  languageCode: z.string().optional(),
  bodyTemplate: z.string().min(1),
  headerType: z.enum(['text', 'image', 'video', 'document']).optional(),
  headerContent: z.string().optional(),
  footerContent: z.string().optional(),
  buttons: z.string().optional(), // JSON string
})

// GET /api/whatsapp/templates - List templates for an account
export async function GET(request: NextRequest) {
  try {
    // Check WhatsApp module license
    const { tenantId } = await requireModuleAccess(request, 'marketing')

    const searchParams = request.nextUrl.searchParams
    const accountId = searchParams.get('accountId')
    const category = searchParams.get('category')

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId required' },
        { status: 400 }
      )
    }

    // Verify account ownership
    const account = await prisma.whatsappAccount.findUnique({
      where: { id: accountId },
    })

    if (!account || account.tenantId !== tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    const where: any = { accountId }
    if (category) {
      where.category = category
    }

    const templates = await prisma.whatsappTemplate.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ templates })
  } catch (error) {
    // Handle license errors
    if (error && typeof error === 'object' && 'moduleId' in error) {
      return handleLicenseError(error)
    }
    console.error('GET /api/whatsapp/templates error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    )
  }
}

// POST /api/whatsapp/templates - Create a new template
export async function POST(request: NextRequest) {
  try {
    // Check WhatsApp module license
    const { tenantId, userId } = await requireModuleAccess(request, 'marketing')

    const body = await request.json()
    const validated = createTemplateSchema.parse(body)

    // Verify account
    const account = await prisma.whatsappAccount.findUnique({
      where: { id: validated.accountId },
    })

    if (!account || account.tenantId !== tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    const template = await prisma.whatsappTemplate.create({
      data: {
        accountId: validated.accountId,
        name: validated.name,
        category: validated.category || 'custom',
        languageCode: validated.languageCode || 'en',
        bodyTemplate: validated.bodyTemplate,
        headerType: validated.headerType || null,
        headerContent: validated.headerContent || null,
        footerContent: validated.footerContent || null,
        buttons: validated.buttons || null,
        createdById: userId,
      },
    })

    await prisma.whatsappAuditLog.create({
      data: {
        accountId: validated.accountId,
        action: 'template_create',
        status: 'success',
        description: `Created template ${validated.name}`,
        userId: userId,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      },
    })

    return NextResponse.json(template, { status: 201 })
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

    console.error('POST /api/whatsapp/templates error:', error)
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    )
  }
}
