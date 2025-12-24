/**
 * WhatsApp Module - Authentication Middleware
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, optionalAuth, AuthMiddlewareResult } from '@payaid/oauth-client'

export function requireWhatsAppAuth(
  request: NextRequest,
  returnUrl?: string
): AuthMiddlewareResult {
  return requireAuth(request, returnUrl)
}

export function optionalWhatsAppAuth(request: NextRequest): AuthMiddlewareResult {
  return optionalAuth(request)
}

export function requireWhatsAppAccess(request: NextRequest): {
  authenticated: boolean
  payload: any
  response: NextResponse | null
} {
  const auth = requireWhatsAppAuth(request)
  
  if (!auth.authenticated) {
    return auth
  }

  const licensedModules = auth.payload?.licensedModules || []
  if (!licensedModules.includes('whatsapp') && !licensedModules.includes('marketing')) {
    return {
      authenticated: false,
      payload: null,
      response: NextResponse.json(
        { error: 'WhatsApp module not licensed for this tenant' },
        { status: 403 }
      ),
    }
  }

  return auth
}

