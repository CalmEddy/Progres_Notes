'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabaseClient';
import MessageBubble from './MessageBubble';
import { HumoristId, VoiceContract } from '@/lib/comedy/voiceContracts';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface VoiceContractOption {
  id: string;
  name: string;
  contract: VoiceContract;
}

export default function ChatInterface() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [comedyMode, setComedyMode] = useState(false);
  const [jokeCount, setJokeCount] = useState(10);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedVoiceContract, setSelectedVoiceContract] = useState<HumoristId | 'none'>('none');
  const [voiceContracts, setVoiceContracts] = useState<VoiceContractOption[]>([]);
  const [loadingVoiceContracts, setLoadingVoiceContracts] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // Fetch voice contracts on mount
  useEffect(() => {
    const fetchVoiceContracts = async () => {
      try {
        setLoadingVoiceContracts(true);
        const response = await fetch('/api/voice-contracts');
        
        if (!response.ok) {
          throw new Error('Failed to fetch voice contracts');
        }
        
        const data = await response.json();
        setVoiceContracts(data.contracts || []);
      } catch (err) {
        console.error('Error loading voice contracts:', err);
        setError('Failed to load voice contracts');
      } finally {
        setLoadingVoiceContracts(false);
      }
    };

    fetchVoiceContracts();
  }, []);

  const getAuthHeaders = async () => {
    const supabase = createSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = {};
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message to UI immediately
    const newUserMessage: Message = { role: 'user', content: userMessage };
    setMessages(prev => [...prev, newUserMessage]);

    if (comedyMode && aiEnabled) {
      // Comedy Mode: Generate jokes
      setIsLoading(true);

      try {
        const headers = await getAuthHeaders();
        const response = await fetch('/api/comedy/generate', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            topic: userMessage,
            jokeCount: jokeCount,
            humoristId: selectedVoiceContract !== 'none' ? selectedVoiceContract : 'dave_barry',
          }),
        });

        if (!response.ok) {
          if (response.status === 401) {
            router.push('/auth/login');
            return;
          }
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to generate jokes');
        }

        const result = await response.json();
        
        // Add assistant message with jokes
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: result.text },
        ]);

        // Show success message that note was saved
        if (result.note) {
          setMessages(prev => [
            ...prev,
            { role: 'system', content: `✓ Jokes saved as note: ${result.note.title || 'Untitled'}` },
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate jokes');
        // Remove user message on error
        setMessages(prev => prev.slice(0, -1));
      } finally {
        setIsLoading(false);
      }
    } else if (aiEnabled) {
      // AI mode: Send to chat API
      setIsLoading(true);
      setIsStreaming(true);

      try {
        const headers = await getAuthHeaders();
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: userMessage,
            conversationId,
            model: 'gpt-4o-mini',
            humoristId: selectedVoiceContract !== 'none' ? selectedVoiceContract : undefined,
          }),
        });

        if (!response.ok) {
          if (response.status === 401) {
            router.push('/auth/login');
            return;
          }
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to send message');
        }

        // Handle streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = '';
        let currentConversationId = conversationId;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.content) {
                    assistantMessage += data.content;
                    // Update streaming message
                    setMessages(prev => {
                      const newMessages = [...prev];
                      const lastMessage = newMessages[newMessages.length - 1];
                      if (lastMessage && lastMessage.role === 'assistant') {
                        lastMessage.content = assistantMessage;
                      } else {
                        newMessages.push({ role: 'assistant', content: assistantMessage });
                      }
                      return newMessages;
                    });
                  }
                  if (data.done) {
                    setIsStreaming(false);
                    if (data.conversationId) {
                      currentConversationId = data.conversationId;
                      setConversationId(data.conversationId);
                    }
                  }
                  if (data.error) {
                    throw new Error(data.error);
                  }
                } catch (e) {
                  // Ignore JSON parse errors for incomplete chunks
                }
              }
            }
          }
        }

        // Ensure assistant message is in the list
        setMessages(prev => {
          const hasAssistant = prev.some(m => m.role === 'assistant' && m.content === assistantMessage);
          if (!hasAssistant && assistantMessage) {
            return [...prev, { role: 'assistant', content: assistantMessage }];
          }
          return prev;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
        // Remove user message on error
        setMessages(prev => prev.slice(0, -1));
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
      }
    } else {
      // AI off mode: Direct text ingestion
      setIsLoading(true);

      try {
        const headers = await getAuthHeaders();
        const response = await fetch('/api/chat/ingest', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            text: userMessage,
            title: null,
          }),
        });

        if (!response.ok) {
          if (response.status === 401) {
            router.push('/auth/login');
            return;
          }
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to ingest text');
        }

        const result = await response.json();
        // Show success message
        setMessages(prev => [
          ...prev,
          { role: 'system', content: `✓ Text saved as note: ${result.note.title || 'Untitled'}` },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to ingest text');
        // Remove user message on error
        setMessages(prev => prev.slice(0, -1));
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Chat</h1>
        <div className="flex items-center gap-4">
          {/* Voice Contract Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="voice-contract" className="text-sm text-gray-600">
              Voice:
            </label>
            <select
              id="voice-contract"
              value={selectedVoiceContract}
              onChange={(e) => setSelectedVoiceContract(e.target.value as HumoristId | 'none')}
              disabled={!aiEnabled || loadingVoiceContracts}
              className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="none">Default</option>
              {voiceContracts.map((vc) => (
                <option key={vc.id} value={vc.id}>
                  {vc.name}
                </option>
              ))}
            </select>
          </div>
          {/* AI Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">AI</span>
            <button
              onClick={() => {
                const newAiEnabled = !aiEnabled;
                setAiEnabled(newAiEnabled);
                // Disable Comedy Mode when AI is disabled
                if (!newAiEnabled) {
                  setComedyMode(false);
                }
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                aiEnabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  aiEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {/* Comedy Mode Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Comedy</span>
            <button
              onClick={() => {
                if (aiEnabled) {
                  setComedyMode(!comedyMode);
                }
              }}
              disabled={!aiEnabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                comedyMode && aiEnabled ? 'bg-purple-600' : 'bg-gray-300'
              } ${!aiEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  comedyMode && aiEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <button
            onClick={() => router.push('/notes')}
            className="btn-secondary text-sm"
          >
            Back to Notes
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <p className="text-lg mb-2">
                {comedyMode && aiEnabled 
                  ? 'Generate comedy jokes' 
                  : aiEnabled 
                  ? 'Start a conversation with AI' 
                  : 'Enter or paste text to save as notes'}
              </p>
              <p className="text-sm">
                {comedyMode && aiEnabled
                  ? 'Enter a topic below to generate jokes'
                  : aiEnabled
                  ? 'Type your message below and press Enter'
                  : 'Text will be automatically saved and processed'}
              </p>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <MessageBubble
            key={index}
            role={message.role}
            content={message.content}
            isStreaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
          />
        ))}

        {error && (
          <div className="alert-error mt-4">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        {comedyMode && aiEnabled && (
          <div className="mb-3">
            <label htmlFor="joke-count" className="block text-sm font-medium text-gray-700 mb-1">
              Number of Jokes
            </label>
            <input
              id="joke-count"
              type="number"
              min="1"
              max="25"
              value={jokeCount}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value >= 1 && value <= 25) {
                  setJokeCount(value);
                }
              }}
              className="input-field w-24"
              disabled={isLoading}
            />
          </div>
        )}
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              comedyMode && aiEnabled
                ? 'Enter topic for jokes...'
                : aiEnabled
                ? 'Type your message...'
                : 'Enter or paste text to save...'
            }
            className="input-field flex-1 min-h-[44px] max-h-32 resize-none"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {comedyMode && aiEnabled ? 'Generating...' : 'Sending...'}
              </span>
            ) : (
              'Send'
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {comedyMode && aiEnabled
            ? 'Enter a topic and press Enter to generate jokes'
            : aiEnabled
            ? 'Press Enter to send, Shift+Enter for new line'
            : 'Press Enter to save text as a note'}
        </p>
      </div>
    </div>
  );
}

