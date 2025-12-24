'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface WhatsappAccount {
  id: string
  businessName?: string
  wahaBaseUrl?: string
  status: string
}

interface WhatsappSession {
  id: string
  providerSessionId?: string
  qrCodeUrl?: string
  status: string
  deviceName?: string
  phoneNumber?: string
  lastSyncAt?: string
  dailySentCount: number
  dailyRecvCount: number
  employee?: {
    id: string
    name?: string
    email: string
  }
}

export default function WhatsAppSessionsPage() {
  const queryClient = useQueryClient()
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    deviceName: '',
    employeeId: '',
  })

  // Get accounts
  const { data: accountsData } = useQuery<{ accounts: WhatsappAccount[] }>({
    queryKey: ['whatsapp-accounts'],
    queryFn: async () => {
      const response = await apiRequest('/api/whatsapp/accounts')
      if (!response.ok) throw new Error('Failed to fetch accounts')
      return response.json()
    },
  })

  const accounts = accountsData?.accounts || []
  const currentAccount = selectedAccountId
    ? accounts.find((a) => a.id === selectedAccountId)
    : accounts[0]

  // Get sessions for selected account
  const { data: sessionsData } = useQuery<{ sessions: WhatsappSession[] }>({
    queryKey: ['whatsapp-sessions', currentAccount?.id],
    queryFn: async () => {
      if (!currentAccount?.id) return { sessions: [] }
      const response = await apiRequest(`/api/whatsapp/sessions/${currentAccount.id}`)
      if (!response.ok) throw new Error('Failed to fetch sessions')
      return response.json()
    },
    enabled: !!currentAccount?.id,
    refetchInterval: 10000, // Refresh every 10 seconds to check status
  })

  const sessions = sessionsData?.sessions || []

  const createSessionMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!currentAccount?.id) throw new Error('No account selected')
      const response = await apiRequest('/api/whatsapp/sessions', {
        method: 'POST',
        body: JSON.stringify({
          accountId: currentAccount.id,
          deviceName: data.deviceName,
          employeeId: data.employeeId || undefined,
        }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create session')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-sessions'] })
      setShowCreateForm(false)
      setFormData({ deviceName: '', employeeId: '' })
    },
  })

  // Auto-select first account
  if (accounts.length > 0 && !selectedAccountId) {
    setSelectedAccountId(accounts[0].id)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">WhatsApp Sessions</h1>
          <p className="mt-2 text-gray-600">
            Manage WhatsApp device connections (QR code scanning)
          </p>
        </div>
        {currentAccount && (
          <Button onClick={() => setShowCreateForm(true)}>Create New Session</Button>
        )}
      </div>

      {/* Account Selector */}
      {accounts.length > 1 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-2">
              {accounts.map((account) => (
                <Button
                  key={account.id}
                  variant={selectedAccountId === account.id ? 'default' : 'outline'}
                  onClick={() => setSelectedAccountId(account.id)}
                >
                  {account.businessName || 'Account'}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Session Form */}
      {showCreateForm && currentAccount && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Session</CardTitle>
            <CardDescription>
              Generate a QR code to connect a WhatsApp device
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                createSessionMutation.mutate(formData)
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1">Device Name</label>
                <Input
                  value={formData.deviceName}
                  onChange={(e) => setFormData({ ...formData, deviceName: e.target.value })}
                  placeholder="e.g., Rohit's Phone"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Employee ID (Optional)</label>
                <Input
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  placeholder="Leave empty for shared inbox"
                />
              </div>
              {createSessionMutation.isError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {createSessionMutation.error instanceof Error
                    ? createSessionMutation.error.message
                    : 'Failed to create session'}
                </div>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={createSessionMutation.isPending}>
                  {createSessionMutation.isPending ? 'Creating...' : 'Create Session'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false)
                    setFormData({ deviceName: '', employeeId: '' })
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Sessions List */}
      {!currentAccount ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <p>No WhatsApp accounts found</p>
            <p className="text-sm mt-2">Create an account first</p>
          </CardContent>
        </Card>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <p>No sessions found</p>
            <p className="text-sm mt-2">Create a session to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sessions.map((session) => (
            <Card key={session.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {session.deviceName || 'Unnamed Device'}
                    </CardTitle>
                    <CardDescription>
                      {session.phoneNumber || 'Not connected'}
                      {session.employee && ` • ${session.employee.name || session.employee.email}`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        session.status === 'connected'
                          ? 'bg-green-100 text-green-800'
                          : session.status === 'pending_qr'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {session.status}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* QR Code Display */}
                  {session.status === 'pending_qr' && session.qrCodeUrl && (
                    <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium mb-2">Scan QR Code with WhatsApp</p>
                      <img
                        src={session.qrCodeUrl}
                        alt="WhatsApp QR Code"
                        className="w-64 h-64 border-2 border-gray-300 rounded"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        Open WhatsApp → Settings → Linked Devices → Link a Device
                      </p>
                    </div>
                  )}

                  {/* Session Stats */}
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-gray-600">Messages Sent (Today)</p>
                      <p className="text-2xl font-bold">{session.dailySentCount}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Messages Received (Today)</p>
                      <p className="text-2xl font-bold">{session.dailyRecvCount}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Last Sync</p>
                      <p className="text-sm font-medium">
                        {session.lastSyncAt
                          ? new Date(session.lastSyncAt).toLocaleString()
                          : 'Never'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
