import { NextRequest, NextResponse } from 'next/server'
import { clearTokenCookie } from '@payaid/oauth-client'

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true })
  clearTokenCookie(response)
  
  const coreLogoutUrl = process.env.CORE_AUTH_URL || 'https://payaid.io'
  const logoutUrl = new URL('/logout', coreLogoutUrl)
  logoutUrl.searchParams.set('redirect', request.headers.get('referer') || '/')
  
  return NextResponse.redirect(logoutUrl.toString())
}

export async function GET(request: NextRequest) {
  return POST(request)
}

