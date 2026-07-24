

import { randomUUID } from 'crypto'

/**
 * @deprecated Use generateAgentDeviceId() instead for multi-agent support
 */
export const deviceUUID = (): string => {
    return randomUUID()
}

/**
 * Generates a fresh UUID for new agent sessions
 * This is used as the `cuid` when creating or selecting agents
 */
export const generateAgentDeviceId = (): string => {
    return randomUUID()
}
