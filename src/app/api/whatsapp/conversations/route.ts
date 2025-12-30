import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'

// GET /api/whatsapp/conversations - List conversations for a tenant (with filtering)
export async function GET(request: NextRequest) {
  try {
    // Check WhatsApp module license
    const { tenantId } = await requireModuleAccess(request, 'marketing')

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') || 'open'
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    const conversations = await prisma.whatsappConversation.findMany({
      where: {
        account: { tenantId: tenantId },
        status: status as string,
      },
      orderBy: { lastMessageAt: 'desc' },
      take: Math.min(limit, 100),
      skip: offset,
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        session: {
          select: {
            id: true,
            deviceName: true,
            phoneNumber: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
    })

    const total = await prisma.whatsappConversation.count({
      where: {
        account: { tenantId: tenantId },
        status: status as string,
      },
    })

    return NextResponse.json({
      conversations,
      total,
      limit,
      offset,
    })
  } catch (error) {
    // Handle license errors
    if (error && typeof error === 'object' && 'moduleId' in error) {
      return handleLicenseError(error)
    }
    console.error('GET /api/whatsapp/conversations error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    )
  }
}
