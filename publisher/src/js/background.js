const values = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({"handsFolded": 0});
    
        let hands = [];
        for (let i = 0; i < values.length; i++) {
            for(let j = 0; j < values.length; j++) {
                if (i > j) {
                    hands.push(values[j] + " " + values[i] + " " + "o");
                }
                else {
                    hands.push(values[i] + " " + values[j] + " " + "s");
                }
            }
        }

        chrome.storage.local.set({"range": hands});

        let fold = new Array(169).fill(false);
        chrome.storage.local.set({"fold": fold});
});

// ===== Configuration =====
const AUTH_URL = "https://dom-auth.onrender.com"; // Change this to your dom_auth service URL
const HUB_HOST = "dom-hub.onrender.com";
const MAX_RETRIES = 100;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10000;
const AUTH_ERROR_BACKOFF_MS = 60000; // Heavy backoff for 401 errors (1 minute)
const QUEUE_CAP = 100;
const RETRY_ALARM_NAME = "hub-retry";

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function getPublisherId(roomId) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['publisherIds'], (result) => {
            let publisherIds = result.publisherIds || {};
            
            if (!publisherIds[roomId]) {
                publisherIds[roomId] = generateUUID();
                chrome.storage.local.set({ publisherIds: publisherIds });
            }
            
            resolve(publisherIds[roomId]);
        });
    });
}

/**
 * Fetches a short-lived JWT from the auth service
 * @param {Object} params - Parameters for token request
 * @param {string} params.roomId - The poker room ID (derived from PokerNow gameId)
 * @param {string} params.role - Role (always "pub" for publisher)
 * @param {string} params.publisherId - Stable UUID for this publisher
 * @returns {Promise<{token: string|null, error: string|null, isAuthError: boolean}>}
 */
async function fetchHubToken({ roomId, role, publisherId }) {
    try {
        const response = await fetch(`${AUTH_URL}/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                room: roomId,
                role: role,
                publisherId: publisherId
            })
        });

        if (response.ok) {
            const data = await response.json();
            return { token: data.token, error: null, isAuthError: false };
        } else if (response.status === 401) {
            return { token: null, error: "Authentication failed", isAuthError: true };
        } else {
            return { token: null, error: `HTTP ${response.status}`, isAuthError: false };
        }
    } catch (e) {
        return { token: null, error: e.message, isAuthError: false };
    }
}

class HubPublisher {
    constructor() {
        this.ws = null;
        this.queue = [];
        this.retryCount = 0;
        this.currentRoom = null;
        this.isConnecting = false;
        this.authErrorBackoff = false; // Track if we're in auth error backoff
    }

    /**
     * Extracts roomId from URL - the last segment after the final '/'
     * e.g., https://www.pokernow.club/games/abc123 -> abc123
     */
    extractRoomFromUrl(url) {
        try {
            // Remove trailing slash, query string, and hash, then get last segment
            const cleanUrl = url.split('?')[0].split('#')[0].replace(/\/$/, '');
            const segments = cleanUrl.split('/');
            const lastSegment = segments[segments.length - 1];
            return lastSegment && lastSegment.trim() !== '' ? lastSegment : null;
        } catch (e) {
            return null;
        }
    }

    async connect(roomId) {
        if (!roomId) {
            return;
        }
        
        if (this.currentRoom === roomId && this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        if (this.currentRoom !== roomId) {
            this.disconnect();
            this.currentRoom = roomId;
            this.retryCount = 0;
            this.authErrorBackoff = false;
        }

        if (this.isConnecting) return;
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        this.isConnecting = true;
        this.clearRetryAlarm();

        try {
            // Get publisher ID for this room
            const publisherId = await getPublisherId(roomId);
            
            // Fetch JWT from auth service
            const tokenResult = await fetchHubToken({
                roomId: roomId,
                role: "pub",
                publisherId: publisherId
            });

            if (!tokenResult.token) {
                this.isConnecting = false;
                
                if (tokenResult.isAuthError) {
                    // Heavy backoff for auth errors
                    this.authErrorBackoff = true;
                    this.scheduleRetry(roomId, AUTH_ERROR_BACKOFF_MS);
                } else {
                    // Normal backoff for network/other errors
                    this.scheduleRetry(roomId);
                }
                return;
            }

            // Reset auth error state on successful token fetch
            this.authErrorBackoff = false;

            const wsUrl = `wss://${HUB_HOST}/?room=${roomId}&role=pub&token=${tokenResult.token}`;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.isConnecting = false;
                this.retryCount = 0;
                this.flushQueue();
            };

            this.ws.onerror = (error) => {
            };

            this.ws.onclose = (event) => {
                this.isConnecting = false;
                this.ws = null;
                this.scheduleRetry(roomId);
            };

        } catch (e) {
            this.isConnecting = false;
            this.scheduleRetry(roomId);
        }
    }

    scheduleRetry(roomId, overrideBackoff = null) {
        if (this.retryCount >= MAX_RETRIES) {
            this.clearRetryAlarm();
            return;
        }

        this.clearRetryAlarm();
        this.retryCount++;
        
        let backoff;
        if (overrideBackoff !== null) {
            backoff = overrideBackoff;
        } else {
            backoff = Math.min(
                INITIAL_BACKOFF_MS * Math.pow(2, this.retryCount - 1),
                MAX_BACKOFF_MS
            );
        }

        // Use chrome.alarms for MV3 service worker reliability
        chrome.alarms.create(RETRY_ALARM_NAME, { when: Date.now() + backoff });
    }

    clearRetryAlarm() {
        chrome.alarms.clear(RETRY_ALARM_NAME);
    }

    disconnect() {
        this.clearRetryAlarm();
        if (this.ws) {
            try {
                // Remove onclose handler to prevent retry scheduling on explicit disconnect
                this.ws.onclose = null;
                this.ws.close();
            } catch (e) {
            }
            this.ws = null;
        }
        this.isConnecting = false;
    }

    publish(message) {
        try {
            const msgStr = JSON.stringify(message);
            
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(msgStr);
                } catch (e) {
                    this.enqueue(message);
                }
            } else {
                this.enqueue(message);
            }
        } catch (e) {
        }
    }

    enqueue(message) {
        this.queue.push(message);
        if (this.queue.length > QUEUE_CAP) {
            this.queue.shift();
        }
    }

    flushQueue() {
        while (this.queue.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = this.queue.shift();
            try {
                const msgStr = JSON.stringify(message);
                this.ws.send(msgStr);
            } catch (e) {
                this.queue.unshift(message);
                break;
            }
        }
    }
}

const hubPublisher = new HubPublisher();

// ===== MV3 Alarm Handler for Retry Scheduling =====
// Service workers can be suspended; chrome.alarms survive suspension
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RETRY_ALARM_NAME) {
        if (hubPublisher.currentRoom) {
            hubPublisher.connect(hubPublisher.currentRoom);
        }
    }
});

// ===== Shared handler for HAND_DATA messages =====
// Used by both persistent port connections and one-off messages
function handleHandData(handData) {
    if (!handData.url) {
        return;
    }
    
    const roomId = hubPublisher.extractRoomFromUrl(handData.url);
    if (!roomId) {
        return;
    }
    
    hubPublisher.connect(roomId);
    
    // Helper function to publish message
    const publishMessage = ({ publisherId, pokerNowPlayerId }) => {
        const message = {
            type: "hand",
            publisherId: publisherId,
            // PokerNow's own per-table player identifier (NOT used as publisherId)
            pokerNowPlayerId: pokerNowPlayerId || null,
            playerName: handData.playerName || null,
            data: handData,
            timestamp: Date.now()
        };
        hubPublisher.publish(message);
    };
    
    // Always use the stored publisher UUID as publisherId
    // (PokerNow's playerId is sent separately as pokerNowPlayerId)
    getPublisherId(roomId).then(publisherId => {
        publishMessage({
            publisherId,
            pokerNowPlayerId: handData.playerId
        });
    }).catch(e => {
        // Last-resort fallback; should be rare in MV3 background context
        publishMessage({
            publisherId: generateUUID(),
            pokerNowPlayerId: handData.playerId
        });
    });
}

// ===== Persistent Port Connection Handler =====
// Handles long-lived connections from content scripts
// This enables automatic detection of extension reload/update
const PORT_NAME = "hand-data-port";

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) {
        return;
    }
    
    port.onMessage.addListener((request) => {
        try {
            if (request.type === "HAND_DATA") {
                handleHandData(request.data);
            }
        } catch (e) {
        }
    });
    
    port.onDisconnect.addListener(() => {
        // Check for lastError to avoid "Unchecked runtime.lastError" warning
        if (chrome.runtime.lastError) {
            // Expected when content script context is invalidated (e.g., bfcache)
            // No action needed - port cleanup is automatic
        }
    });
});

// ===== Legacy One-Off Message Handler =====
// Kept for backwards compatibility with any existing content scripts
// that haven't been updated yet
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (request.type === "HAND_DATA") {
            handleHandData(request.data);
        }
    } catch (e) {
    }
    
    return false;
});
