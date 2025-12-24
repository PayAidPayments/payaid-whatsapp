'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModuleGate } from '@/components/modules/ModuleGate'

interface WhatsappAccount {
  id: string
  channelType: string
  wahaBaseUrl?: string
  isWebConnected: boolean
  businessName?: string
  primaryPhone?: string
  status: string
  errorMessage?: string
  sessions: any[]
  templates: any[]
  _count?: {
    conversations: number
  }
}

function WhatsAppAccountsPageContent() {
  const queryClient = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    wahaBaseUrl: 'http://localhost:3000',
    wahaApiKey: '',
    businessName: '',
    primaryPhone: '',
  })

  const { data, isLoading } = useQuery<{ accounts: WhatsappAccount[] }>({
    queryKey: ['whatsapp-accounts'],
    queryFn: async () => {
      const response = await apiRequest('/api/whatsapp/accounts')
      if (!response.ok) throw new Error('Failed to fetch WhatsApp accounts')
      return response.json()
    },
  })

  const createAccountMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest('/api/whatsapp/accounts', {
        method: 'POST',
        body: JSON.stringify({
          channelType: 'web',
          wahaBaseUrl: data.wahaBaseUrl,
          wahaApiKey: data.wahaApiKey,
          businessName: data.businessName || undefined,
          primaryPhone: data.primaryPhone || undefined,
        }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create WhatsApp account')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-accounts'] })
      setShowAddForm(false)
      setFormData({
        wahaBaseUrl: 'http://localhost:3000',
        wahaApiKey: '',
        businessName: '',
        primaryPhone: '',
      })
    },
  })

  const accounts = data?.accounts || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">WhatsApp Accounts</h1>
          <p className="mt-2 text-gray-600">
            Connect your own self-hosted WAHA instance to enable WhatsApp messaging. Each business needs their own WAHA server.
          </p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? 'Cancel' : 'Connect WAHA Account'}
        </Button>
      </div>

      {/* Add Account Form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>Connect WAHA Instance</CardTitle>
            <CardDescription>
              Connect your own self-hosted WAHA (WhatsApp HTTP API) server. Each business needs their own WAHA instance and API key.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                createAccountMutation.mutate(formData)
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">WAHA Base URL *</label>
                  <Input
                    value={formData.wahaBaseUrl}
                    onChange={(e) => setFormData({ ...formData, wahaBaseUrl: e.target.value })}
                    placeholder="http://localhost:3000"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    URL where your WAHA server is running (e.g., http://your-server:3000)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">WAHA API Key *</label>
                  <Input
                    type="password"
                    value={formData.wahaApiKey}
                    onChange={(e) => setFormData({ ...formData, wahaApiKey: e.target.value })}
                    placeholder="Enter your WAHA server API key"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    API key from your WAHA server configuration (not a PayAid key)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Business Name</label>
                  <Input
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    placeholder="My Business"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Primary Phone</label>
                  <Input
                    value={formData.primaryPhone}
                    onChange={(e) => setFormData({ ...formData, primaryPhone: e.target.value })}
                    placeholder="+919876543210"
                  />
                </div>
              </div>
              {createAccountMutation.isError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {createAccountMutation.error instanceof Error
                    ? createAccountMutation.error.message
                    : 'Failed to create WhatsApp account'}
                </div>
              )}
              <Button type="submit" disabled={createAccountMutation.isPending}>
                {createAccountMutation.isPending ? 'Connecting...' : 'Connect Account'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Accounts List */}
      {isLoading ? (
        <div className="text-center py-12">Loading WhatsApp accounts...</div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <p>No WhatsApp accounts connected</p>
            <p className="text-sm mt-2">Connect your WAHA instance to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {account.businessName || 'WhatsApp Account'}
                    </CardTitle>
                    <CardDescription>
                      {account.wahaBaseUrl}
                      {account.primaryPhone && ` • ${account.primaryPhone}`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        account.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : account.status === 'error'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {account.status}
                    </span>
                    {account.isWebConnected && (
                      <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                        WAHA Connected
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Sessions</p>
                    <p className="text-2xl font-bold">{account.sessions.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Templates</p>
                    <p className="text-2xl font-bold">{account.templates.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Conversations</p>
                    <p className="text-2xl font-bold">{account._count?.conversations || 0}</p>
                  </div>
                </div>
                {account.errorMessage && (
                  <div className="mt-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                    Error: {account.errorMessage}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default function WhatsAppAccountsPage() {
  return (
    <ModuleGate module="marketing">
      <WhatsAppAccountsPageContent />
    </ModuleGate>
  )
}
