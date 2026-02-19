/**
 * DeepSeek API. Re-export from main deepseek module with same chat(messages, options) signature.
 */

import { chat as deepseekChat } from '../../deepseek.js'

export async function chat(messages, options = {}) {
  const apiKey = options.apiKey && String(options.apiKey).trim()
  return deepseekChat(messages, {
    apiKey,
    model: options.model,
    temperature: options.temperature,
    max_tokens: options.max_tokens,
    timeout: options.timeout,
  })
}

export const defaultModel = 'deepseek-chat'
