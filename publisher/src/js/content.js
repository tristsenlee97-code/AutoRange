// ===== Persistent Port Connection with Auto-Reconnect =====
// Uses chrome.runtime.connect() for long-lived connection
// Automatically detects disconnection and reconnects when extension is reloaded

const PORT_NAME = "hand-data-port";
const RECONNECT_INTERVAL_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 50;

let port = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let messageQueue = []; // Queue messages while disconnected
const MESSAGE_QUEUE_CAP = 20;

/**
 * Establishes a persistent port connection to the background script.
 * Returns true if connection was successful, false otherwise.
 */
function connectPort() {
    try {
        // Check if extension context is valid
        if (!chrome || !chrome.runtime || !chrome.runtime.id) {
            return false;
        }

        port = chrome.runtime.connect({ name: PORT_NAME });
        
        // Note: chrome.runtime.connect() always returns a port object, but it may be disconnected
        // if the extension context is invalidated. The onDisconnect listener will handle that.

        port.onDisconnect.addListener(() => {
            port = null;
            // Check if this was due to extension context invalidation or bfcache
            if (chrome.runtime.lastError) {
                // Expected when context is invalidated (e.g., bfcache)
            }
            // Schedule reconnect attempt
            scheduleReconnect();
        });

        // Connection successful - reset reconnect counter and flush queue
        reconnectAttempts = 0;
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        flushMessageQueue();
        return true;
    } catch (e) {
        // Extension context invalidated or other error
        port = null;
        return false;
    }
}

/**
 * Schedules a reconnection attempt with exponential backoff
 */
function scheduleReconnect() {
    if (reconnectTimer) {
        return; // Already scheduled
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        return;
    }

    reconnectAttempts++;
    const delay = Math.min(RECONNECT_INTERVAL_MS * Math.pow(1.5, reconnectAttempts - 1), 30000);

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectPort();
    }, delay);
}

/**
 * Sends a message through the persistent port connection.
 * If disconnected, queues the message and attempts to reconnect.
 */
function sendPortMessage(msg) {
    if (port) {
        try {
            port.postMessage(msg);
            return true;
        } catch (e) {
            // Port became invalid, queue message and reconnect
            port = null;
        }
    }

    // Queue message for later delivery
    enqueueMessage(msg);

    // Try to reconnect if not already scheduled
    if (!reconnectTimer) {
        scheduleReconnect();
    }

    return false;
}

/**
 * Adds a message to the queue (with cap to prevent memory issues)
 */
function enqueueMessage(msg) {
    messageQueue.push(msg);
    if (messageQueue.length > MESSAGE_QUEUE_CAP) {
        messageQueue.shift(); // Remove oldest message
    }
}

/**
 * Flushes all queued messages through the port
 */
function flushMessageQueue() {
    while (messageQueue.length > 0 && port) {
        const msg = messageQueue.shift();
        try {
            port.postMessage(msg);
        } catch (e) {
            // Put message back and stop flushing
            messageQueue.unshift(msg);
            break;
        }
    }
}

// Initialize port connection on script load
connectPort();

// ===== Safe wrappers for chrome APIs =====

// Safe wrapper for chrome.runtime.getURL
function safeGetURL(path) {
    try {
        if (!chrome || !chrome.runtime || !chrome.runtime.getURL) {
            return null;
        }
        return chrome.runtime.getURL(path);
    } catch (e) {
        return null;
    }
}

// Safe wrapper for chrome.storage.local.get
function safeStorageGet(keys, callback) {
    try {
        if (!chrome || !chrome.storage || !chrome.storage.local) {
            // Extension context invalidated - use defaults
            if (callback) callback({});
            return;
        }
        chrome.storage.local.get(keys, (result) => {
            // Check for lastError (e.g., if page is in bfcache)
            if (chrome.runtime.lastError) {
                // Silently fail and use defaults for bfcache case
                if (callback) callback({});
                return;
            }
            if (callback) callback(result || {});
        });
    } catch (e) {
        // Extension context invalidated - use defaults
        if (callback) callback({});
    }
}

// Safe wrapper for chrome.storage.local.set
function safeStorageSet(items, callback) {
    try {
        if (!chrome || !chrome.storage || !chrome.storage.local) {
            // Extension context invalidated - silently fail
            if (callback) callback();
            return;
        }
        chrome.storage.local.set(items, () => {
            // Check for lastError (e.g., if page is in bfcache)
            if (chrome.runtime.lastError) {
                // Silently fail for bfcache case
                if (callback) callback();
                return;
            }
            if (callback) callback();
        });
    } catch (e) {
        // Extension context invalidated - silently fail
        if (callback) callback();
    }
}

function injectScript(file_path, tag) {
    try {
        const url = safeGetURL(file_path);
        if (!url) {
            // Extension context invalidated - can't inject script
            return;
        }
        
        var node = document.getElementsByTagName(tag)[0];
        if (!node) {
            return;
        }
        
        var script = document.createElement('script');
        script.setAttribute('type', 'text/javascript');
        script.setAttribute('src', url);
        node.appendChild(script);
    } catch (e) {
        // Silently fail if extension context is invalidated
    }
}


if (document.location.href.includes("pokernow.club")) {
    injectScript('js/scripts/pokernow.js', 'body');
} else if (document.location.href.includes("ignitioncasino.eu")) {
    injectScript('js/scripts/ignition.js', 'body');
}


function compareHands(hand1, hand2) {
    if (!hand1 || !hand2) { return false; }

    if (hand1.value1 == hand2.value1 && hand1.suit1 == hand2.suit1) {
        if (hand1.value2 == hand2.value2 && hand1.suit2 == hand2.suit2) {
            return true;
        }
    }
    return false;
}


const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

// Background initializes these on install, but storage can be cleared or become corrupt.
// Content script must be resilient to missing data to avoid crashing on PokerNow pages.
const DEFAULT_RANGE_VALUES = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
const DEFAULT_RANGE_SIZE = 169;

function buildDefaultRange() {
    // Must match the same ordering used in src/js/background.js (and expected by popup indexing).
    const hands = [];
    for (let i = 0; i < DEFAULT_RANGE_VALUES.length; i++) {
        for (let j = 0; j < DEFAULT_RANGE_VALUES.length; j++) {
            if (i > j) {
                hands.push(DEFAULT_RANGE_VALUES[j] + " " + DEFAULT_RANGE_VALUES[i] + " " + "o");
            } else {
                hands.push(DEFAULT_RANGE_VALUES[i] + " " + DEFAULT_RANGE_VALUES[j] + " " + "s");
            }
        }
    }
    return hands;
}

function normalizeRangeFold(result) {
    const needsRange = !Array.isArray(result?.range) || result.range.length !== DEFAULT_RANGE_SIZE;
    const needsFold = !Array.isArray(result?.fold) || result.fold.length !== DEFAULT_RANGE_SIZE;

    const range = needsRange ? buildDefaultRange() : result.range;
    const fold = needsFold ? new Array(DEFAULT_RANGE_SIZE).fill(false) : result.fold;

    if (needsRange || needsFold) {
        safeStorageSet({ range, fold });
    }
    return { range, fold };
}

function checkRange(hand) {
    let suited = false;
    if (hand.suit1 == hand.suit2) { suited = true; }

    safeStorageGet(["fold", "range"], (result) => {
        const { range, fold } = normalizeRangeFold(result || {});

        let handString = "";
        let c1 = values.indexOf(hand.value1);
        let c2 = values.indexOf(hand.value2);

        // If we can't parse ranks, do nothing (but avoid crashing).
        if (c1 === -1 || c2 === -1) {
            window.postMessage({ type: "FROM_EXTENSION", text: false }, "*");
            return;
        }

        if (c1 < c2) {
            handString = `${hand.value2} ${hand.value1}`;
        } else {
            handString = `${hand.value1} ${hand.value2}`;
        }

        // IMPORTANT: background uses "s" for pocket pairs as well (i == j path),
        // so we must match that encoding here to ensure indexOf() finds pairs.
        if (hand.value1 == hand.value2) {
            handString = handString + " s";
        } else if (suited) {
            handString = handString + " s";
        } else {
            handString = handString + " o";
        }

        let i = range.indexOf(handString);
        // Safety: if not found, default to "do not fold" to avoid unintended auto-fold.
        let action = i >= 0 ? Boolean(fold[i]) : false;

        if (action == false) {
            const alertUrl = safeGetURL("media/alert.mp3");
            if (alertUrl) {
                var sound = new Audio(alertUrl);
                sound.volume = 0.1;
                sound.play().catch(() => {
                });
            }
        } else {
            safeStorageGet(["handsFolded"], (result) => {
                let i = (result.handsFolded || 0) + 1;
                safeStorageSet({"handsFolded": i});
            });
        }

        window.postMessage({type: "FROM_EXTENSION", text: action}, "*");
    });
}



var previousHand;

window.addEventListener("message", (event) => {
    if (event.source != window) {
        return;
    }

    if (event.data.type && (event.data.type == "FROM_PAGE")) {
        if (!event.data.text || typeof event.data.text !== "string") {
            return;
        }

        let hand;
        try {
            hand = JSON.parse(event.data.text);
        } catch (e) {
            return;
        }

        // Validate payload shape (avoid crashes / unintended auto-fold on malformed messages)
        if (!hand || typeof hand !== "object") {
            return;
        }
        if (
            typeof hand.value1 !== "string" ||
            typeof hand.suit1 !== "string" ||
            typeof hand.value2 !== "string" ||
            typeof hand.suit2 !== "string"
        ) {
            return;
        }

        if (!compareHands(hand, previousHand)) {
            checkRange(hand);
            const handData = {
                type: "HAND_DATA",
                data: {
                    value1: hand.value1,
                    suit1: hand.suit1,
                    value2: hand.value2,
                    suit2: hand.suit2,
                    url: hand.url,
                    playerId: hand.playerId,
                    playerName: hand.playerName,
                    timestamp: Date.now()
                }
            };
            sendPortMessage(handData);
        }

        previousHand = hand;
    }
}, false);
