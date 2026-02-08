// ============================================
// FIREBASE ES MODULE IMPORTS
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ============================================
// FIREBASE CONFIG
// ============================================
const firebaseConfig = {
    apiKey: "AIzaSyAWeKykGVxR1wIllTfYq_FAYYohuI-2rcQ",
    authDomain: "game-isi.firebaseapp.com",
    databaseURL: "https://game-isi-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "game-isi",
    storageBucket: "game-isi.firebasestorage.app",
    messagingSenderId: "696580761179",
    appId: "1:696580761179:web:98fa7890e446f282bb017e"
};

// ============================================
// FIREBASE INITIALIZATION
// ============================================
let firebaseApp = null;
let database = null;

function initFirebase() {
    console.log("Initializing Firebase...");
    firebaseApp = initializeApp(firebaseConfig);
    database = getDatabase(firebaseApp);
    console.log("Firebase initialized, database:", database ? "OK" : "FAILED");

    // Connection test
    const testRef = ref(database, "debug/ping");
    set(testRef, { connected: true, timestamp: Date.now() })
        .then(() => console.log("Firebase connection verified"))
        .catch((e) => console.error("Firebase write error:", e));
}

initFirebase();

function getDB() {
    if (!database) throw new Error("Database not initialized");
    return database;
}

// ============================================
// CONSTANTS
// ============================================
const ROOM_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// POKER LOGIC
// ============================================
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

class Deck {
    constructor() { this.cards = []; this.reset(); }
    reset() {
        this.cards = [];
        for (let suit of SUITS) {
            for (let rank of RANKS) {
                this.cards.push({ suit, rank, value: RANK_VALUES[rank] });
            }
        }
    }
    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }
    deal(count) { return this.cards.splice(0, count); }
}

const HAND_TYPES = { HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, THREE_OF_A_KIND: 3, STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, FOUR_OF_A_KIND: 7, STRAIGHT_FLUSH: 8, ROYAL_FLUSH: 9 };

function evaluateHand(cards) {
    if (!cards || cards.length < 5) return { type: -1, values: [], name: "Invalid" };
    if (cards.length > 5) return getBestHand(cards);
    return score5CardHand(cards);
}

function getBestHand(cards) {
    const combos = getCombinations(cards, 5);
    let best = null;
    for (let hand of combos) {
        const info = score5CardHand(hand);
        if (!best || compareHands(info, best) > 0) best = info;
    }
    return best;
}

function getCombinations(arr, k) {
    if (k === 1) return arr.map(e => [e]);
    const result = [];
    for (let i = 0; i <= arr.length - k; i++) {
        const head = [arr[i]];
        const tails = getCombinations(arr.slice(i + 1), k - 1);
        for (const tail of tails) result.push(head.concat(tail));
    }
    return result;
}

function compareHands(h1, h2) {
    if (h1.type !== h2.type) return h1.type - h2.type;
    for (let i = 0; i < h1.values.length; i++) {
        if (h1.values[i] !== h2.values[i]) return h1.values[i] - h2.values[i];
    }
    return 0;
}

function score5CardHand(cards) {
    const sorted = [...cards].sort((a, b) => b.value - a.value);
    const values = sorted.map(c => c.value);
    const suits = sorted.map(c => c.suit);
    const isFlush = suits.every(s => s === suits[0]);
    const uniqueValues = [...new Set(values)];
    let isStraight = false, straightHigh = 0;
    if (uniqueValues.length === 5) {
        if (values[0] - values[4] === 4) { isStraight = true; straightHigh = values[0]; }
        else if (values[0] === 14 && values[1] === 5) { isStraight = true; straightHigh = 5; }
    }
    if (isFlush && isStraight && straightHigh === 14 && values[1] === 13) return { type: HAND_TYPES.ROYAL_FLUSH, values, name: "Royal Flush" };
    if (isFlush && isStraight) return { type: HAND_TYPES.STRAIGHT_FLUSH, values: (straightHigh === 5) ? [5, 4, 3, 2, 1] : values, name: "Straight Flush" };
    const counts = {};
    for (let v of values) counts[v] = (counts[v] || 0) + 1;
    const countValues = Object.values(counts);
    const countKeys = Object.keys(counts).map(Number).sort((a, b) => (counts[b] - counts[a]) || (b - a));
    if (countValues.includes(4)) return { type: HAND_TYPES.FOUR_OF_A_KIND, values: countKeys, name: "Four of a Kind" };
    if (countValues.includes(3) && countValues.includes(2)) return { type: HAND_TYPES.FULL_HOUSE, values: countKeys, name: "Full House" };
    if (isFlush) return { type: HAND_TYPES.FLUSH, values, name: "Flush" };
    if (isStraight) return { type: HAND_TYPES.STRAIGHT, values: (straightHigh === 5) ? [5, 4, 3, 2, 1] : values, name: "Straight" };
    if (countValues.includes(3)) return { type: HAND_TYPES.THREE_OF_A_KIND, values: countKeys, name: "Three of a Kind" };
    if (countValues.filter(x => x === 2).length === 2) return { type: HAND_TYPES.TWO_PAIR, values: countKeys, name: "Two Pair" };
    if (countValues.includes(2)) return { type: HAND_TYPES.PAIR, values: countKeys, name: "Pair" };
    return { type: HAND_TYPES.HIGH_CARD, values, name: "High Card" };
}

// ============================================
// GAME ENGINE (Multi-Player)
// ============================================
const PHASES = { PRE_FLOP: 'pre-flop', FLOP: 'flop', TURN: 'turn', RIVER: 'river', SHOWDOWN: 'showdown', GAME_OVER: 'game-over' };

function createInitialState(playerCount) {
    const players = [];
    for (let i = 0; i < playerCount; i++) {
        players.push({ id: `p${i}`, name: `Player ${i + 1}`, chips: 1000, hand: [], currentBet: 0, folded: false, isAllIn: false, connected: false });
    }
    return {
        status: 'waiting',
        maxPlayers: playerCount,
        connectedCount: 0,
        pot: 0,
        communityCards: [],
        deck: [],
        dealerIndex: 0,
        turnIndex: 0,
        phase: PHASES.PRE_FLOP,
        minBet: 20,
        players,
        lastAction: null,
        winner: null,
        lastActive: Date.now()
    };
}

function startHand(state) {
    const deck = new Deck(); deck.shuffle();
    state.pot = 0; state.communityCards = []; state.deck = deck.cards; state.phase = PHASES.PRE_FLOP; state.winner = null; state.lastAction = 'New Hand';
    state.lastActive = Date.now();

    state.players.forEach(p => { p.hand = []; p.currentBet = 0; p.folded = false; p.isAllIn = false; });

    // Deal 2 cards to each connected player
    state.players.forEach(p => {
        if (p.connected && p.chips > 0) p.hand = deck.deal(2);
        else p.folded = true;
    });

    // Blinds (SB = dealer+1, BB = dealer+2)
    const activePlayers = state.players.filter(p => p.connected && !p.folded);
    if (activePlayers.length < 2) return state;

    const sbIndex = (state.dealerIndex + 1) % state.players.length;
    const bbIndex = (state.dealerIndex + 2) % state.players.length;

    postBlind(state, sbIndex, state.minBet / 2);
    postBlind(state, bbIndex, state.minBet);

    // First to act is after BB
    state.turnIndex = getNextActivePlayer(state, bbIndex);
    return state;
}

function postBlind(state, playerIndex, amount) {
    const player = state.players[playerIndex];
    if (!player || player.folded) return;
    const actual = Math.min(player.chips, amount);
    player.chips -= actual; player.currentBet += actual;
    player.isAllIn = (player.chips === 0);
    state.pot += actual;
}

function getNextActivePlayer(state, fromIndex) {
    let idx = (fromIndex + 1) % state.players.length;
    let count = 0;
    while (count < state.players.length) {
        const p = state.players[idx];
        if (p.connected && !p.folded && !p.isAllIn) return idx;
        idx = (idx + 1) % state.players.length;
        count++;
    }
    return -1; // No active players
}

function countActivePlayers(state) {
    return state.players.filter(p => p.connected && !p.folded).length;
}

function handleAction(state, playerIndex, action, amount = 0) {
    if (state.turnIndex !== playerIndex) return state;
    const player = state.players[playerIndex];
    if (!player || player.folded) return state;

    state.lastActive = Date.now();

    const highBet = Math.max(...state.players.map(p => p.currentBet));
    const toCall = highBet - player.currentBet;

    if (action === 'fold') {
        player.folded = true;
        state.lastAction = `${player.name} folds`;
        if (countActivePlayers(state) === 1) {
            const winner = state.players.find(p => p.connected && !p.folded);
            return endHand(state, winner.id);
        }
    } else if (action === 'check') {
        if (toCall > 0) return state;
        state.lastAction = `${player.name} checks`;
    } else if (action === 'call') {
        const callAmt = Math.min(toCall, player.chips);
        player.chips -= callAmt; player.currentBet += callAmt;
        player.isAllIn = (player.chips === 0);
        state.pot += callAmt;
        state.lastAction = `${player.name} calls ${callAmt}`;
    } else if (action === 'raise') {
        const raiseAmt = amount - player.currentBet;
        if (raiseAmt > player.chips || amount <= highBet) return state;
        player.chips -= raiseAmt; player.currentBet = amount;
        player.isAllIn = (player.chips === 0);
        state.pot += raiseAmt;
        state.lastAction = `${player.name} raises to ${amount}`;
    }

    if (isRoundOver(state)) return nextPhase(state);

    const next = getNextActivePlayer(state, playerIndex);
    if (next === -1) return nextPhase(state);
    state.turnIndex = next;
    return state;
}

function isRoundOver(state) {
    const active = state.players.filter(p => p.connected && !p.folded && !p.isAllIn);
    if (active.length <= 1) return true;
    const bets = active.map(p => p.currentBet);
    return bets.every(b => b === bets[0]) && bets[0] > 0;
}

function nextPhase(state) {
    state.players.forEach(p => p.currentBet = 0);

    if (state.phase === PHASES.PRE_FLOP) { state.phase = PHASES.FLOP; dealCommunity(state, 3); }
    else if (state.phase === PHASES.FLOP) { state.phase = PHASES.TURN; dealCommunity(state, 1); }
    else if (state.phase === PHASES.TURN) { state.phase = PHASES.RIVER; dealCommunity(state, 1); }
    else if (state.phase === PHASES.RIVER) { state.phase = PHASES.SHOWDOWN; return determineWinner(state); }

    const first = getNextActivePlayer(state, state.dealerIndex);
    if (first === -1) return determineWinner(state);
    state.turnIndex = first;
    return state;
}

function dealCommunity(state, count) {
    for (let i = 0; i < count && state.deck.length > 0; i++) {
        state.communityCards.push(state.deck.shift());
    }
}

function determineWinner(state) {
    const contenders = state.players.filter(p => p.connected && !p.folded);
    if (contenders.length === 0) return endHand(state, null);
    if (contenders.length === 1) return endHand(state, contenders[0].id);

    let best = null, winners = [];
    for (const p of contenders) {
        const hand = evaluateHand([...p.hand, ...state.communityCards]);
        if (!best || compareHands(hand, best) > 0) { best = hand; winners = [p]; }
        else if (compareHands(hand, best) === 0) winners.push(p);
    }

    if (winners.length === 1) return endHand(state, winners[0].id);
    return endHand(state, 'split', winners.map(w => w.id));
}

function endHand(state, winnerId, splitIds = null) {
    state.phase = PHASES.GAME_OVER;
    state.winner = winnerId;
    state.lastActive = Date.now();

    if (winnerId === 'split' && splitIds) {
        const share = Math.floor(state.pot / splitIds.length);
        splitIds.forEach(id => {
            const p = state.players.find(pl => pl.id === id);
            if (p) p.chips += share;
        });
    } else if (winnerId) {
        const winner = state.players.find(p => p.id === winnerId);
        if (winner) winner.chips += state.pot;
    }

    state.pot = 0;
    state.dealerIndex = (state.dealerIndex + 1) % state.players.length;
    return state;
}

// ============================================
// NETWORK FUNCTIONS
// ============================================
function generateRoomId() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

async function createRoom(playerCount) {
    const db = getDB();
    const roomId = generateRoomId();
    const state = createInitialState(playerCount);
    state.players[0].connected = true;
    state.connectedCount = 1;
    await set(ref(db, 'rooms/' + roomId), state);
    console.log("Room created:", roomId);
    return roomId;
}

function subscribeToRoom(roomId, callback) {
    const db = getDB();
    onValue(ref(db, 'rooms/' + roomId), (snap) => {
        const data = snap.val();
        if (data) callback(data);
    });
}

async function joinRoom(roomId, playerIndex) {
    const db = getDB();
    const roomRef = ref(db, 'rooms/' + roomId);
    const snap = await get(roomRef);
    const state = snap.val();
    if (!state) { console.error("Room not found"); return false; }
    if (playerIndex >= state.maxPlayers) { console.error("Room full"); return false; }

    state.players[playerIndex].connected = true;
    state.connectedCount = state.players.filter(p => p.connected).length;
    state.lastActive = Date.now();

    // Auto-start when enough players
    if (state.connectedCount >= 2 && state.status === 'waiting') {
        startHand(state);
        state.status = 'playing';
    }

    await set(roomRef, state);
    return true;
}

async function sendAction(roomId, playerIndex, action, amount) {
    const db = getDB();
    const roomRef = ref(db, 'rooms/' + roomId);
    try {
        const snap = await get(roomRef);
        const state = snap.val();
        if (!state) return;
        const newState = handleAction(JSON.parse(JSON.stringify(state)), playerIndex, action, amount);
        await set(roomRef, newState);
    } catch (e) { console.error("sendAction failed:", e); }
}

async function triggerStartGame(roomId) {
    const db = getDB();
    const roomRef = ref(db, 'rooms/' + roomId);
    try {
        const snap = await get(roomRef);
        const state = snap.val();
        if (!state) return;
        const newState = startHand(JSON.parse(JSON.stringify(state)));
        newState.status = 'playing';
        await set(roomRef, newState);
    } catch (e) { console.error("triggerStartGame failed:", e); }
}

// ============================================
// ROOM CLEANUP
// ============================================
async function runCleanup() {
    const db = getDB();
    const roomsRef = ref(db, 'rooms');
    try {
        const snap = await get(roomsRef);
        const rooms = snap.val();
        if (!rooms) return;

        const now = Date.now();
        for (const roomId in rooms) {
            if (roomId === 'ping' || roomId === 'testRoom') continue;
            const room = rooms[roomId];
            const lastActive = room.lastActive || 0;
            if (now - lastActive > ROOM_TIMEOUT_MS) {
                console.log("Cleaning up inactive room:", roomId);
                await remove(ref(db, 'rooms/' + roomId));
            }
        }
    } catch (e) { console.error("Cleanup error:", e); }
}

// Run cleanup every 5 minutes
setInterval(runCleanup, CLEANUP_INTERVAL_MS);
runCleanup(); // Initial cleanup

// ============================================
// GAME STATE & DOM
// ============================================
let myRoomId = null;
let myPlayerIndex = null;
let gameState = null;

const screenLobby = document.getElementById('lobby');
const screenGame = document.getElementById('game');
const playerCountSelect = document.getElementById('player-count');
const inpRoomCode = document.getElementById('inp-room-code');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const lobbyMsg = document.getElementById('lobby-msg');
const displayRoomCode = document.getElementById('display-room-code');
const playerCountDisplay = document.getElementById('player-count-display');
const opponentsContainer = document.getElementById('opponents-container');
const boardEl = document.getElementById('board');
const potEl = document.getElementById('pot-amount');
const sliderContainer = document.getElementById('raise-slider-container');
const slider = document.getElementById('raise-slider');
const raiseVal = document.getElementById('raise-val');
const btnConfirmRaise = document.getElementById('btn-confirm-raise');

// ============================================
// LOBBY EVENTS
// ============================================
btnCreate.addEventListener('click', async () => {
    btnCreate.disabled = true;
    lobbyMsg.textContent = "Creating room...";
    try {
        const count = parseInt(playerCountSelect.value);
        const roomId = await createRoom(count);
        enterGame(roomId, 0);
    } catch (e) {
        console.error(e);
        lobbyMsg.textContent = "Error creating room.";
        btnCreate.disabled = false;
    }
});

btnJoin.addEventListener('click', async () => {
    const code = inpRoomCode.value.trim().toUpperCase();
    if (code.length < 4) return;
    lobbyMsg.textContent = "Joining...";

    // Find next available slot
    const db = getDB();
    const snap = await get(ref(db, 'rooms/' + code));
    const state = snap.val();
    if (!state) { lobbyMsg.textContent = "Room not found."; return; }

    let slot = -1;
    for (let i = 0; i < state.players.length; i++) {
        if (!state.players[i].connected) { slot = i; break; }
    }
    if (slot === -1) { lobbyMsg.textContent = "Room is full."; return; }

    const success = await joinRoom(code, slot);
    if (success) enterGame(code, slot);
    else lobbyMsg.textContent = "Failed to join.";
});

function enterGame(roomId, playerIndex) {
    myRoomId = roomId;
    myPlayerIndex = playerIndex;
    screenLobby.classList.remove('active');
    screenGame.classList.add('active');
    displayRoomCode.textContent = roomId;
    subscribeToRoom(roomId, (state) => {
        gameState = state;
        renderGame(state);
    });
}

// ============================================
// RENDER LOGIC
// ============================================
function renderGame(state) {
    playerCountDisplay.textContent = `${state.connectedCount}/${state.maxPlayers}`;

    if (state.status === 'waiting') {
        potEl.textContent = "Waiting for players...";
        renderOpponents(state);
        renderMyArea(state);
        return;
    }

    potEl.textContent = state.pot;
    renderOpponents(state);
    renderMyArea(state);
    renderBoard(state.communityCards);
    updateControls(state);

    const overlay = document.getElementById('game-overlay');
    if (state.phase === 'game-over') {
        overlay.style.display = 'flex';
        const title = document.getElementById('overlay-msg');
        const me = state.players[myPlayerIndex];
        if (state.winner === 'split') title.textContent = "Split Pot!";
        else if (state.winner === me.id) title.textContent = "You Win!";
        else title.textContent = state.players.find(p => p.id === state.winner)?.name + " Wins!";
        document.getElementById('btn-next-hand').onclick = () => { triggerStartGame(myRoomId); overlay.style.display = 'none'; };
    } else { overlay.style.display = 'none'; }
}

function renderOpponents(state) {
    opponentsContainer.innerHTML = '';
    state.players.forEach((p, i) => {
        if (i === myPlayerIndex) return;
        const div = document.createElement('div');
        div.className = 'player-area opponent';
        div.innerHTML = `
            <div class="cards">${renderCards(p, state, false)}</div>
            <div class="player-info">
                <div class="avatar">${p.connected ? `P${i + 1}` : '?'}</div>
                <div class="details">
                    <span class="name">${p.name}${p.folded ? ' (Folded)' : ''}</span>
                    <span class="chips">$${p.chips}</span>
                </div>
            </div>
            ${state.turnIndex === i ? '<div class="status-bubble show">TURN</div>' : ''}
            ${p.currentBet > 0 ? `<div class="bet-chip" style="display:block">${p.currentBet}</div>` : ''}
        `;
        opponentsContainer.appendChild(div);
    });
}

function renderMyArea(state) {
    const me = state.players[myPlayerIndex];
    const cardsEl = document.getElementById('player-cards');
    const chipsEl = document.querySelector('#player-area .chips');
    const statusEl = document.getElementById('player-status');
    const betEl = document.getElementById('player-bet');

    cardsEl.innerHTML = renderCards(me, state, true);
    chipsEl.textContent = `$${me.chips}${me.isAllIn ? ' (All-In)' : ''}`;

    if (state.turnIndex === myPlayerIndex && state.phase !== 'showdown' && state.phase !== 'game-over') {
        statusEl.classList.add('show');
        statusEl.textContent = 'YOUR TURN';
    } else { statusEl.classList.remove('show'); }

    if (me.currentBet > 0) { betEl.style.display = 'block'; betEl.textContent = me.currentBet; }
    else { betEl.style.display = 'none'; }
}

function renderCards(player, state, isMe) {
    if (!player.hand || player.hand.length === 0) return '';
    const showFace = isMe || state.phase === 'showdown' || state.phase === 'game-over';
    return player.hand.map(c => {
        if (showFace && !player.folded) {
            const sym = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[c.suit];
            return `<div class="card ${c.suit}">${c.rank}${sym}</div>`;
        }
        return '<div class="card back"></div>';
    }).join('');
}

function renderBoard(cards) {
    boardEl.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        if (cards && cards[i]) {
            const c = cards[i];
            const sym = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[c.suit];
            boardEl.innerHTML += `<div class="card ${c.suit}">${c.rank}${sym}</div>`;
        } else {
            boardEl.innerHTML += '<div class="card-slot"></div>';
        }
    }
}

// ============================================
// ACTION HANDLERS
// ============================================
document.querySelectorAll('.btn-action').forEach(btn => {
    btn.addEventListener('click', () => handleUserAction(btn.dataset.action));
});

function handleUserAction(action) {
    if (!gameState) return;
    const me = gameState.players[myPlayerIndex];

    if (action === 'raise') {
        if (sliderContainer.style.display === 'flex') { sliderContainer.style.display = 'none'; return; }
        const highBet = Math.max(...gameState.players.map(p => p.currentBet));
        const minRaise = highBet + gameState.minBet;
        const maxBet = me.chips + me.currentBet;
        slider.min = Math.min(minRaise, maxBet);
        slider.max = maxBet;
        slider.value = slider.min;
        raiseVal.value = slider.min;
        raiseVal.min = slider.min;
        raiseVal.max = slider.max;
        sliderContainer.style.display = 'flex';
        return;
    }
    sendAction(myRoomId, myPlayerIndex, action, 0);
}

slider.addEventListener('input', () => {
    raiseVal.value = slider.value;
});

raiseVal.addEventListener('input', () => {
    let val = parseInt(raiseVal.value) || 0;
    val = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), val));
    slider.value = val;
    raiseVal.value = val;
});

btnConfirmRaise.addEventListener('click', () => {
    const val = parseInt(raiseVal.value) || parseInt(slider.value);
    sendAction(myRoomId, myPlayerIndex, 'raise', val);
    sliderContainer.style.display = 'none';
});

function updateControls(state) {
    const me = state.players[myPlayerIndex];
    const isMyTurn = state.turnIndex === myPlayerIndex && state.phase !== 'showdown' && state.phase !== 'game-over' && !me.folded;

    document.querySelectorAll('.btn-action').forEach(b => b.disabled = !isMyTurn);

    if (isMyTurn) {
        const highBet = Math.max(...state.players.map(p => p.currentBet));
        const toCall = highBet - me.currentBet;
        const btnCheck = document.querySelector('.btn-action.check');
        const btnCall = document.querySelector('.btn-action.call');

        if (toCall > 0) {
            btnCheck.disabled = true;
            btnCall.textContent = `Call ${toCall}`;
        } else {
            btnCall.disabled = true;
            btnCheck.disabled = false;
            btnCall.textContent = 'Call';
        }
    }
}

console.log("game.js loaded");
