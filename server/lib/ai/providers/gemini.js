/**
 * Google Gemini API (REST). AI Studio: https://aistudio.google.com/apikey
 * https://ai.google.dev/api/rest/v1beta/models/generateContent
 */

import axios from 'axios'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-1.5-flash'

/**
 * Преобразует messages (OpenAI-формат) в contents для Gemini.
 * system → systemInstruction; user/assistant → contents[].parts[].text
 */
function messagesToGeminiContents(messages) {
  let systemInstruction = ''
  const contents = []

  for (const m of messages) {
    const text = typeof m.content === 'string' ? m.content : String(m.content || '')
    if (m.role === 'system') {
      systemInstruction = systemInstruction ? `${systemInstruction}\n\n${text}` : text
      continue
    }
    const role = m.role === 'assistant' ? 'model' : 'user'
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += '\n\n' + text
    } else {
      contents.push({ role, parts: [{ text }] })
    }
  }

  return { systemInstruction: systemInstruction || undefined, contents: contents.length ? contents : [{ role: 'user', parts: [{ text: 'Hello' }] }] }
}

/**
 * @param {Array<{ role: 'system'|'user'|'assistant', content: string }>} messages
 * @param {{ apiKey: string, model?: string, temperature?: number, max_tokens?: number, timeout?: number }} options
 * @returns {Promise<{ ok: true, content: string, usage?: object } | { ok: false, error: string, code?: string }>}
 */
export async function chat(messages, options = {}) {
  const apiKey = options.apiKey && String(options.apiKey).trim()
  if (!apiKey) {
    return { ok: false, error: 'Gemini API key not set', code: 'NO_API_KEY' }
  }

  const model = (options.model || DEFAULT_MODEL).trim()
  const { systemInstruction, contents } = messagesToGeminiContents(messages)

  const payload = {
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    contents,
    generationConfig: {
      temperature: options.temperature != null ? options.temperature : 0.7,
      maxOutputTokens: options.max_tokens != null ? options.max_tokens : 2048,
    },
  }

  try {
    const url = `${BASE_URL}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: ((options.timeout != null ? options.timeout : 60) * 1000),
      validateStatus: () => true,
    })

    if (res.status !== 200) {
      const errBody = res.data && typeof res.data === 'object' ? res.data : {}
      const errMsg = errBody.error?.message || res.statusText || `HTTP ${res.status}`
      return { ok: false, error: errMsg, code: errBody.error?.code || `HTTP_${res.status}` }
    }

    const data = res.data || {}
    const candidates = data.candidates
    if (!Array.isArray(candidates) || candidates.length === 0) {
      const finishReason = data.candidates?.[0]?.finishReason
      if (finishReason === 'SAFETY') {
        return { ok: false, error: 'Gemini blocked response (safety)', code: 'SAFETY' }
      }
      return { ok: false, error: 'Empty response from model', code: 'EMPTY_RESPONSE' }
    }

    const parts = candidates[0].content?.parts
    const content = (parts && parts[0]?.text) ? String(parts[0].text).trim() : ''
    const usage = data.usageMetadata ? {
      prompt_tokens: data.usageMetadata.promptTokenCount,
      completion_tokens: data.usageMetadata.candidatesTokenCount,
      total_tokens: data.usageMetadata.totalTokenCount,
    } : undefined

    return { ok: true, content, usage }
  } catch (err) {
    const message = err.response?.data?.error?.message || err.message || 'Gemini request failed'
    const code = err.code === 'ECONNABORTED' ? 'TIMEOUT' : (err.response?.data?.error?.code || err.code || 'NETWORK_ERROR')
    return { ok: false, error: message, code }
  }
}

export const defaultModel = DEFAULT_MODEL
