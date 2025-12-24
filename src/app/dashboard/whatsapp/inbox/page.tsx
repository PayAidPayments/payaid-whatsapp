'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface WhatsappConversation {
  id: string
  status: string
  lastMessageAt?: string
  lastDirection?: string
  unreadCount: number
  contact: {
    id: string
    name: string
    phone?: string
    email?: string
  }
  session?: {
    id: string
    deviceName?: string
    phoneNumber?: string
  }
  _count?: {
    messages: number
  }
}

interface WhatsappMessage {
  id: string
  direction: 'in' | 'out'
  messageType: string
  text?: string
  mediaUrl?: string
  status?: string
  createdAt: string
  employee?: {
    id: string
    name?: string
    email: string
  }
}

export default function WhatsAppInboxPage() {
  const queryClient = useQueryClient()
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [statusFilter, setStatusFilter] = useState('open')

  // Get conversations
  const { data: conversationsData } = useQuery<{ conversations: WhatsappConversation[] }>({
    queryKey: ['whatsapp-conversations', statusFilter],
    queryFn: async () => {
      const response = await apiRequest(`/api/whatsapp/conversations?status=${statusFilter}&limit=50`)
      if (!response.ok) throw new Error('Failed to fetch conversations')
      return response.json()
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  // Get messages for selected conversation
  const { data: messagesData } = useQuery<{ messages: WhatsappMessage[] }>({
    queryKey: ['whatsapp-messages', selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return { messages: [] }
      const response = await apiRequest(
        `/api/whatsapp/conversations/${selectedConversationId}/messages?limit=100`
      )
      if (!response.ok) throw new Error('Failed to fetch messages')
      return response.json()
    },
    enabled: !!selectedConversationId,
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  const conversations = conversationsData?.conversations || []
  const messages = messagesData?.messages || []
  const selectedConversation = conversations.find((c) => c.id === selectedConversationId)

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!selectedConversationId) throw new Error('No conversation selected')
      const response = await apiRequest('/api/whatsapp/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: selectedConversationId,
          text,
        }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send message')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] })
      setReplyText('')
    },
  })

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (replyText.trim() && selectedConversationId) {
      sendMessageMutation.mutate(replyText.trim())
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">WhatsApp Inbox</h1>
          <p className="mt-2 text-gray-600">
            Manage WhatsApp conversations with your customers
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={statusFilter === 'open' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('open')}
          >
            Open ({conversations.filter((c) => c.status === 'open').length})
          </Button>
          <Button
            variant={statusFilter === 'closed' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('closed')}
          >
            Closed
          </Button>
          <Button
            variant={statusFilter === 'archived' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('archived')}
          >
            Archived
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-250px)]">
        {/* Conversations List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Conversations ({conversations.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-y-auto max-h-[calc(100vh-350px)]">
            {conversations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No conversations found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversationId(conv.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedConversationId === conv.id
                        ? 'bg-blue-50 border-blue-300'
                        : 'hover:bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {conv.contact.name || conv.contact.phone || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          {conv.contact.phone}
                        </p>
                        {conv.lastMessageAt && (
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(conv.lastMessageAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      {conv.unreadCount > 0 && (
                        <span className="ml-2 px-2 py-1 bg-blue-500 text-white text-xs rounded-full">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Message View */}
        <div className="lg:col-span-2 flex flex-col">
          {selectedConversation ? (
            <>
              <Card className="flex-1 flex flex-col">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>
                        {selectedConversation.contact.name || selectedConversation.contact.phone}
                      </CardTitle>
                      <CardDescription>
                        {selectedConversation.contact.phone}
                        {selectedConversation.session?.deviceName && (
                          <span className="ml-2">
                            • {selectedConversation.session.deviceName}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          selectedConversation.status === 'open'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {selectedConversation.status}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto space-y-4">
                  {messages.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <p>No messages yet</p>
                      <p className="text-sm mt-2">Start the conversation!</p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${
                          msg.direction === 'out' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {msg.direction === 'in' && (
                          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-medium">
                            {selectedConversation.contact.name?.[0]?.toUpperCase() ||
                              selectedConversation.contact.phone?.[0]?.toUpperCase() ||
                              '?'}
                          </div>
                        )}
                        <div
                          className={`max-w-[70%] rounded-lg p-3 ${
                            msg.direction === 'out'
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          {msg.text && (
                            <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                          )}
                          {msg.mediaUrl && (
                            <div className="mt-2">
                              <a
                                href={msg.mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs underline"
                              >
                                📎 Media attachment
                              </a>
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs opacity-70">
                              {new Date(msg.createdAt).toLocaleTimeString()}
                            </span>
                            {msg.direction === 'out' && msg.status && (
                              <span className="text-xs opacity-70 ml-2">
                                {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        {msg.direction === 'out' && (
                          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                            {msg.employee?.name?.[0]?.toUpperCase() ||
                              msg.employee?.email[0].toUpperCase() ||
                              'U'}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Message Input */}
              <Card className="mt-4">
                <CardContent className="pt-6">
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <Input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type a reply..."
                      disabled={sendMessageMutation.isPending}
                    />
                    <Button
                      type="submit"
                      disabled={sendMessageMutation.isPending || !replyText.trim()}
                    >
                      {sendMessageMutation.isPending ? 'Sending...' : 'Send'}
                    </Button>
                  </form>
                  {sendMessageMutation.isError && (
                    <div className="mt-2 p-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                      {sendMessageMutation.error instanceof Error
                        ? sendMessageMutation.error.message
                        : 'Failed to send message'}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <p>Select a conversation to start messaging</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
