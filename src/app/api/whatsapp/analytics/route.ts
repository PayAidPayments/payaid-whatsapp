import { NextRequest, NextResponse } from 'next/server'
import { requireModuleAccess, handleLicenseError } from '@/lib/middleware/auth'
import { prisma } from '@payaid/db'

// GET /api/whatsapp/analytics - Get WhatsApp usage analytics
export async function GET(request: NextRequest) {
  try {
    // Check WhatsApp module license
    const { tenantId } = await requireModuleAccess(request, 'marketing')

    const searchParams = request.nextUrl.searchParams
    const accountId = searchParams.get('accountId')
    const sessionId = searchParams.get('sessionId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId required' },
        { status: 400 }
      )
    }

    // Verify ownership
    const account = await prisma.whatsappAccount.findUnique({
      where: { id: accountId },
    })

    if (!account || account.tenantId !== tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    const dateFilter: any = {}
    if (startDate) dateFilter.gte = new Date(startDate)
    if (endDate) dateFilter.lte = new Date(endDate)

    const where: any = {
      conversation: { accountId },
    }
    if (sessionId) where.sessionId = sessionId
    if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter

    const totalMessages = await prisma.whatsappMessage.count({ where })
    const inMessages = await prisma.whatsappMessage.count({
      where: { ...where, direction: 'in' },
    })
    const outMessages = await prisma.whatsappMessage.count({
      where: { ...where, direction: 'out' },
    })
    const failedMessages = await prisma.whatsappMessage.count({
      where: { ...where, status: 'failed' },
    })

    // Per-session breakdown
    const sessionsData = await prisma.whatsappSession.findMany({
      where: { accountId },
      select: {
        id: true,
        phoneNumber: true,
        deviceName: true,
        dailySentCount: true,
        dailyRecvCount: true,
        status: true,
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    // Get message counts per session for the date range
    const sessionStats = await Promise.all(
      sessionsData.map(async (session) => {
        const sessionWhere = { ...where, sessionId: session.id }
        const sent = await prisma.whatsappMessage.count({
          where: { ...sessionWhere, direction: 'out' },
        })
        const received = await prisma.whatsappMessage.count({
          where: { ...sessionWhere, direction: 'in' },
        })
        return {
          ...session,
          periodSentCount: sent,
          periodRecvCount: received,
        }
      })
    )

    return NextResponse.json({
      totalMessages,
      inMessages,
      outMessages,
      failedMessages,
      successRate:
        totalMessages > 0
          ? ((totalMessages - failedMessages) / totalMessages * 100).toFixed(2)
          : '100',
      sessionsData: sessionStats,
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
    })
  } catch (error) {
    // Handle license errors
    if (error && typeof error === 'object' && 'moduleId' in error) {
      return handleLicenseError(error)
    }
    console.error('GET /api/whatsapp/analytics error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
