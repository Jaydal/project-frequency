import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    controllerLog: { findFirst: vi.fn() },
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Re-import after mocks are set up
const { getControllerUrl, pushDisplay, pushDisplayRow, getDisplayState } =
  await import('@/lib/esp32')

const makeLog = (ip: string) => ({
  id: '1', status: 'Online', ipAddress: ip,
  firmwareVersion: '1.0', temperature: null, lastSync: new Date(),
})

describe('getControllerUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.CONTROLLER_URL
  })

  afterEach(() => {
    delete process.env.CONTROLLER_URL
  })

  it('returns CONTROLLER_URL env var when set, skipping DB', async () => {
    process.env.CONTROLLER_URL = 'http://override:3000'
    const url = await getControllerUrl()
    expect(url).toBe('http://override:3000')
    expect(prisma.controllerLog.findFirst).not.toHaveBeenCalled()
  })

  it('queries ControllerLog and builds URL from IP', async () => {
    vi.mocked(prisma.controllerLog.findFirst).mockResolvedValue(makeLog('10.0.0.5'))
    const url = await getControllerUrl()
    expect(url).toBe('http://10.0.0.5')
  })

  it('returns null when no log entry exists', async () => {
    vi.mocked(prisma.controllerLog.findFirst).mockResolvedValue(null)
    const url = await getControllerUrl()
    expect(url).toBeNull()
  })
})

describe('pushDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.CONTROLLER_URL
  })

  it('POSTs all 3 lines to /display and returns true on success', async () => {
    process.env.CONTROLLER_URL = 'http://esp32'
    mockFetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

    const ok = await pushDisplay(['COURT 1', '2V2', 'RUNNING'])

    expect(ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://esp32/display',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ lines: ['COURT 1', '2V2', 'RUNNING'] }),
      })
    )
  })

  it('returns false when fetch throws (controller unreachable)', async () => {
    process.env.CONTROLLER_URL = 'http://esp32'
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    const ok = await pushDisplay(['A', 'B', 'C'])
    expect(ok).toBe(false)
  })

  it('returns false when no controller URL is known', async () => {
    vi.mocked(prisma.controllerLog.findFirst).mockResolvedValue(null)
    const ok = await pushDisplay(['A', 'B', 'C'])
    expect(ok).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('pushDisplayRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CONTROLLER_URL = 'http://esp32'
  })

  it('POSTs text to /display/{row}', async () => {
    mockFetch.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    const ok = await pushDisplayRow(1, 'HELLO')
    expect(ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://esp32/display/1',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'HELLO' }) })
    )
  })
})

describe('getDisplayState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CONTROLLER_URL = 'http://esp32'
  })

  it('returns parsed lines from ESP32', async () => {
    const payload = { lines: ['A', 'B', 'C'] }
    mockFetch.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    const state = await getDisplayState()
    expect(state).toEqual(payload)
  })

  it('returns null when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('timeout'))
    const state = await getDisplayState()
    expect(state).toBeNull()
  })
})
