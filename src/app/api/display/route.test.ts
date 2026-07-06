import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/esp32', () => ({
  getControllerUrl: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { getControllerUrl } from '@/lib/esp32'
import { GET, POST } from './route'

const ESP32_URL = 'http://esp32'

describe('GET /api/display', () => {
  beforeEach(() => vi.clearAllMocks())

  it('proxies to ESP32 and returns its response', async () => {
    vi.mocked(getControllerUrl).mockResolvedValue(ESP32_URL)
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ lines: ['A', 'B', 'C'] }), { status: 200 })
    )

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ lines: ['A', 'B', 'C'] })
    expect(mockFetch).toHaveBeenCalledWith(`${ESP32_URL}/display`, expect.any(Object))
  })

  it('returns 503 when no controller URL is available', async () => {
    vi.mocked(getControllerUrl).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(503)
  })

  it('returns 503 when ESP32 fetch throws', async () => {
    vi.mocked(getControllerUrl).mockResolvedValue(ESP32_URL)
    mockFetch.mockRejectedValue(new Error('timeout'))
    const res = await GET()
    expect(res.status).toBe(503)
  })
})

describe('POST /api/display', () => {
  beforeEach(() => vi.clearAllMocks())

  const makeReq = (body: unknown) =>
    new Request('http://localhost/api/display', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('forwards valid 3-line payload to ESP32', async () => {
    vi.mocked(getControllerUrl).mockResolvedValue(ESP32_URL)
    mockFetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

    const res = await POST(makeReq({ lines: ['X', 'Y', 'Z'] }))
    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith(
      `${ESP32_URL}/display`,
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('returns 400 when lines tuple is incomplete', async () => {
    const res = await POST(makeReq({ lines: ['only', 'two'] }))
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns 400 when a line exceeds 20 characters', async () => {
    const res = await POST(makeReq({ lines: ['A'.repeat(21), 'B', 'C'] }))
    expect(res.status).toBe(400)
  })

  it('returns 503 when controller is offline', async () => {
    vi.mocked(getControllerUrl).mockResolvedValue(null)
    const res = await POST(makeReq({ lines: ['A', 'B', 'C'] }))
    expect(res.status).toBe(503)
  })
})
