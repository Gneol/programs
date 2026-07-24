

export type callbackType = (method: string, params?: any) => Promise<any>;
export type mediaCallbackType = (method: string, params?: any, file?: any) => Promise<any>;

export type rpcResponseType<T = any> = {
    status: 'success' | 'error';
    data?: T;
}

let _Scid_server_cache: string = '';

const getDefault = () => {
    const fs = require('fs');
    const path = ".ttc_id.txt";
    if(fs.existsSync(path)){
        const scid = fs.readFileSync(path, "utf8");
        if(scid){
            return scid;
        }
    }
}

const saveScid = (scid: string) => {
    const fs = require('fs');
    const path = ".ttc_id.txt";
    fs.writeFileSync(path, scid);
}

const uuid = () => {
    const key = 'ttc_scid';
    let sid = (typeof localStorage !== 'undefined') ? localStorage.getItem(key) : _Scid_server_cache ? _Scid_server_cache : getDefault();
    if (!sid) {
        sid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(key, sid);
        } else {
            saveScid(sid);
        }
    }
    _Scid_server_cache = sid;
    return sid;
}

// Minimal EventSource interface
interface TTCEventSource {
    addEventListener(type: string, listener: (event: any) => void): void;
    removeEventListener(type: string, listener: (event: any) => void): void;
    close(): void;
    onopen: ((event: any) => void) | null;
    onmessage: ((event: any) => void) | null;
    onerror: ((event: any) => void) | null;
    readyState: number; // 0=CONNECTING, 1=OPEN, 2=CLOSED
}

type EventCallback = (data: any) => any;

export class SSEClient {

    private eventSource: TTCEventSource = {} as any;
    private EventSourceClass: any;
    private callbackMap: Map<string, Map<EventCallback, (event: any) => void>> = new Map();
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private lastHeartbeat: number = 0;
    private isConnected: boolean = false;
    private heartbeatTimeout = 30000; // 30 seconds

    constructor() {
        // Check if we're in a browser environment
        if (typeof window !== 'undefined' && 'EventSource' in window) {
            // Use native browser EventSource
            this.EventSourceClass = window.EventSource;
        } else {
            // Node.js environment - will dynamically import
            this.EventSourceClass = null;
        }
    }

    async connect(url: string, scid: string, token_cb: () => Promise<string>,
        socket_cb: (socket: SSEClient) => Promise<any>) {
        // For Node.js, dynamically import eventsource if not already available
        if (!this.EventSourceClass && typeof window === 'undefined') {
            try {
                // Dynamic import for Node.js
                const { EventSource } = await import('eventsource');
                this.EventSourceClass = EventSource;
            } catch (error) {
                throw new Error('eventsource package is required for Node.js environments, Please install it with: npm install eventsource');
            }
        }

        const _url = `${url}/stream?scid=${scid}`;
        const token = await token_cb();

        // Create EventSource connection
        this.eventSource = new this.EventSourceClass(_url, {
            fetch: (input: any, init: any) =>
                fetch(input, {
                    ...init,
                    headers: {
                        ...init.headers,
                        Authorization: token
                    },
                }),
        }) as TTCEventSource;

        // Set up standard EventSource handlers
        this.eventSource.onopen = () => {
            // console.log('[SSEClient] Connection established');
            this.isConnected = true;
            this.startHeartbeat();
        };

        this.eventSource.onerror = (error) => {
            // console.error('[SSEClient] Connection error:', error);
            this.handleDisconnect('error', error);
        };

        // Wait for 'open' event before calling socket callback
        this.eventSource.addEventListener('connect', async () => {
            // console.log('[SSEClient] SSE open event received');
            await socket_cb(this);
        });

        // Listen for server-sent heartbeat/ping events
        this.eventSource.addEventListener('ping', () => {
            this.lastHeartbeat = Date.now();
        });
    }

    on(event: string, cb: EventCallback) {
        // Create wrapper function that parses the data
        const wrapper = (eventObj: any) => {
            try {
                const data = eventObj.data ? JSON.parse(eventObj.data) : eventObj.data;
                cb(data);
            } catch (error) {
                // If parsing fails, pass the raw data
                cb(eventObj.data);
            }
        };

        // Store the mapping
        if (!this.callbackMap.has(event)) {
            this.callbackMap.set(event, new Map());
        }
        this.callbackMap.get(event)!.set(cb, wrapper);

        // Add the wrapper as listener
        this.eventSource.addEventListener(event, wrapper);
    }

    off(event: string, cb: EventCallback) {
        // Get the wrapper for this callback
        const eventCallbacks = this.callbackMap.get(event);
        if (eventCallbacks) {
            const wrapper = eventCallbacks.get(cb);
            if (wrapper) {
                // Remove the wrapper listener
                this.eventSource.removeEventListener(event, wrapper);
                // Clean up the mapping
                eventCallbacks.delete(cb);

                // Clean up empty event maps
                if (eventCallbacks.size === 0) {
                    this.callbackMap.delete(event);
                }
            }
        }
    }

    private startHeartbeat() {
        this.lastHeartbeat = Date.now();

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.heartbeatInterval = setInterval(() => {
            if (!this.isConnected) return;

            // Check if we've missed heartbeats
            const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
            if (timeSinceLastHeartbeat > this.heartbeatTimeout) {
                console.warn('[SSEClient] Heartbeat timeout, assuming disconnect');
                this.handleDisconnect('timeout', `No heartbeat for ${timeSinceLastHeartbeat}ms`);
            }

            // Check EventSource readyState
            if (this.eventSource.readyState === 2) { // CLOSED
                console.warn('[SSEClient] EventSource in CLOSED state');
                this.handleDisconnect('closed', 'EventSource readyState is CLOSED');
            }
        }, 5000); // Check every 5 seconds
    }

    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private handleDisconnect(reason: string, details?: any) {
        if (!this.isConnected) return;

        this.isConnected = false;
        this.stopHeartbeat();

        // Trigger disconnect event for all registered callbacks
        this.triggerDisconnectEvent(reason, details);
    }

    private triggerDisconnectEvent(reason: string, details?: any) {
        const disconnectCallbacks = this.callbackMap.get('disconnect');
        if (disconnectCallbacks) {
            const disconnectData = { reason, details, timestamp: Date.now() };

            // Call each disconnect callback
            for (const [callback, wrapper] of disconnectCallbacks.entries()) {
                try {
                    callback(disconnectData);
                } catch (error) {
                    console.error('[SSEClient] Error in disconnect callback:', error);
                }
            }
        }
    }

    close() {
        if (this.eventSource) {
            this.handleDisconnect('manual', 'Manual close called');
            this.eventSource.close();
            // Clear all callback mappings
            this.callbackMap.clear();
            this.stopHeartbeat();
        }
    }

    getConnectionState() {
        return {
            isConnected: this.isConnected,
            readyState: this.eventSource?.readyState ?? -1,
            lastHeartbeat: this.lastHeartbeat,
            timeSinceLastHeartbeat: Date.now() - this.lastHeartbeat
        };
    }
}


export class RPCClient {
    // keep static aliases for backward compatibility with existing calls
    static token_cb: () => Promise<string>;
    static url = 'http://localhost:3000/rpc';
    static _scid: string;
    static socket: SSEClient;

    constructor(url: string, token_cb: () => Promise<string>, socket_cb?: (socket: SSEClient) => Promise<any>) {
        RPCClient.token_cb = token_cb;
        RPCClient.url = url;
        RPCClient._scid = uuid()
        if(socket_cb)this.connectSocket(url, socket_cb);
    }

    static apiCallback: callbackType = async (method: string, params?: any) => {
        try {
            if (!RPCClient.token_cb) throw new Error('RPCClient.token_cb is not set');
            const token = await RPCClient.token_cb();
            const response = await fetch(`${RPCClient.url}/rpc`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}:${RPCClient._scid}`,
                },
                body: JSON.stringify({ method, params })
            });
            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error("Error calling API:", error);
            throw error;
        }
    }

    static mediaCallback: mediaCallbackType = async (method: string, params?: any, file?: any) => {
        try {
            if (!RPCClient.token_cb) throw new Error('RPCClient.token_cb is not set');
            const token = await RPCClient.token_cb();
            const formData = new FormData();
            formData.append('method', method);
            if (params) formData.append('params', JSON.stringify(params));
            if (file) formData.append('file', file);

            const response = await fetch(`${RPCClient.url}/rpc`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}:${RPCClient._scid}`,
                },
                body: formData
            });
            if (!response.ok) {
                throw new Error(`Media API error: ${response.status} ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error("Error calling Media API:", error);
            throw error;
        }
    }

     async connectSocket(url: string, socket_cb:(socket: SSEClient) => Promise<any>) {
            try {
                const socket = new SSEClient()
                socket.connect(url, RPCClient._scid, RPCClient.token_cb, socket_cb);
                RPCClient.socket = socket;
            } catch (error: any) {
                console.error('Error initializing socket:', error.message);
            }
        }


    GneolServer = {
        /**
         * list available template resources
         *
         * @param {}
         * @returns {Promise<rpcResponseType<any>>}
         */
        async listResources(): Promise<rpcResponseType<any>> {
            return await RPCClient.apiCallback('GneolServer.listResources');
        },
        /**
         * list resources
         *
         * @param {resource: string, page: number, limit: number, id: string}
         * @returns {Promise<rpcResponseType<any>>}
         */
        async list(resource: string, page: number, limit: number, id: string): Promise<rpcResponseType<any>> {
            return await RPCClient.apiCallback('GneolServer.list', [resource, page, limit, id]);
        },
        /**
         * get chat history for a soul with pagination
         *
         * @param {id: string, page: number, limit: number}
         * @returns {Promise<rpcResponseType<any>>}
         */
        async history(id: string, page: number, limit: number): Promise<rpcResponseType<any>> {
            return await RPCClient.apiCallback('GneolServer.history', [id, page, limit]);
        },
        /**
         * trigger an agent with a message (for schedules/automations)
         *
         * @param {id: string, message: string}
         * @returns {Promise<rpcResponseType<any>>}
         */
        async trigger(id: string, message: string): Promise<rpcResponseType<any>> {
            return await RPCClient.apiCallback('GneolServer.trigger', [id, message]);
        },
        /**
         * deploy a .gneol program file
         *
         * @param {programPath: string}
         * @returns {Promise<rpcResponseType<any>>}
         */
        async deploy(programPath: string): Promise<rpcResponseType<any>> {
            return await RPCClient.apiCallback('GneolServer.deploy', [programPath]);
        },
        /**
         * approve permission
         *
         * @param {pId: string, state: boolean, message: string}
         * @returns {Promise<rpcResponseType<any>>}
         */
        async approveFunction(pId: string, state: boolean, message: string): Promise<rpcResponseType<any>> {
            return await RPCClient.apiCallback('GneolServer.approveFunction', [pId, state, message]);
        },
        /**
         * chat an agent
         *
         * @param {id: string, message: string}
         * @returns {Promise<rpcResponseType<any>>}
         */
        async chat(id: string, message: string): Promise<rpcResponseType<any>> {
            return await RPCClient.apiCallback('GneolServer.chat', [id, message]);
        },
    }

}
