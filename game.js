// ============================================
// FIREBASE ES MODULE IMPORTS
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
// FIREBASE INITIALIZATION (Exactly Once)
// ============================================
console.log("Initializing Firebase app...");
const app = initializeApp(firebaseConfig);
console.log("Firebase app initialized:", app.name);

console.log("Getting database instance...");
const database = getDatabase(app);
console.log("Database instance obtained:", database);

// Connection verification - write to rooms/ping
const pingRef = ref(database, 'rooms/ping');
set(pingRef, { connected: true, timestamp: Date.now() })
    .then(() => console.log("Firebase connection verified - wrote to rooms/ping"))
    .catch((e) => console.error("Firebase write failed:", e));

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
    if (cards.length > 5) return getBestHand(cards);
    return score5CardHand(cards);
}

function getBestHand(cards) {
    const combos = getCombinations(cards, 5);
    let bestHandInfo = null;
    for (let hand of combos) {
        const info = score5CardHand(hand);
        if (!bestHandInfo || compareHands(info, bestHandInfo) > 0) bestHandInfo = info;
    }
    return bestHandInfo;
}

function getCombinations(array, k) {
    if (k === 1) return array.map(e => [e]);
    const combinations = [];
    for (let i = 0; i < array.length - k + 1; i++) {
        const head = array.slice(i, i + 1);
        const tailCombinations = getCombinations(array.slice(i + 1), k - 1);
        for (const tail of tailCombinations) combinations.push(head.concat(tail));
    }
    return combinations;
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
        else if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) { isStraight = true; straightHigh = 5; }
    }
    if (isFlush && isStraight && straightHigh === 14 && values[1] === 13) return { type: HAND_TYPES.ROYAL_FLUSH, values, name: "Royal Flush" };
    if (isFlush && isStraight) { const cmpValues = (straightHigh === 5) ? [5, 4, 3, 2, 1] : values; return { type: HAND_TYPES.STRAIGHT_FLUSH, values: cmpValues, name: "Straight Flush" }; }
    const counts = {};
    for (let v of values) counts[v] = (counts[v] || 0) + 1;
    const countValues = Object.values(counts);
    const countKeys = Object.keys(counts).map(Number).sort((a, b) => { const diff = counts[b] - counts[a]; return diff !== 0 ? diff : b - a; });
    if (countValues.includes(4)) return { type: HAND_TYPES.FOUR_OF_A_KIND, values: [countKeys[0], countKeys[1]], name: "Four of a Kind" };
    if (countValues.includes(3) && countValues.includes(2)) return { type: HAND_TYPES.FULL_HOUSE, values: countKeys, name: "Full House" };
    if (isFlush) return { type: HAND_TYPES.FLUSH, values, name: "Flush" };
    if (isStraight) { const cmpValues = (straightHigh === 5) ? [5, 4, 3, 2, 1] : values; return { type: HAND_TYPES.STRAIGHT, values: cmpValues, name: "Straight" }; }
    if (countValues.includes(3)) return { type: HAND_TYPES.THREE_OF_A_KIND, values: countKeys, name: "Three of a Kind" };
    if (countValues.filter(x => x === 2).length === 2) return { type: HAND_TYPES.TWO_PAIR, values: countKeys, name: "Two Pair" };
    if (countValues.includes(2)) return { type: HAND_TYPES.PAIR, values: countKeys, name: "Pair" };
    return { type: HAND_TYPES.HIGH_CARD, values, name: "High Card" };
}

// ============================================
// GAME ENGINE
// ============================================
const PHASES = { PRE_FLOP: 'pre-flop', FLOP: 'flop', TURN: 'turn', RIVER: 'river', SHOWDOWN: 'showdown', GAME_OVER: 'game-over' };

function createInitialState() {
    return {
        status: 'waiting', pot: 0, communityCards: [], deck: [], dealerIndex: 0, turnIndex: 0, phase: PHASES.PRE_FLOP, minBet: 20,
        players: [
            { id: 'p1', name: 'Player 1', chips: 1000, hand: [], currentBet: 0, folded: false, isAllIn: false },
            { id: 'p2', name: 'Player 2', chips: 1000, hand: [], currentBet: 0, folded: false, isAllIn: false }
        ],
        lastAction: null, winner: null
    };
}

function startHand(state) {
    const deck = new Deck(); deck.shuffle();
    state.pot = 0; state.communityCards = []; state.deck = deck.cards; state.phase = PHASES.PRE_FLOP; state.winner = null; state.lastAction = 'New Hand';
    state.players.forEach(p => { p.hand = []; p.currentBet = 0; p.folded = false; p.isAllIn = false; });
    state.players[0].hand = deck.deal(2); state.players[1].hand = deck.deal(2);
    const sbIndex = state.dealerIndex, bbIndex = (sbIndex + 1) % 2;
    postBlind(state, sbIndex, state.minBet / 2); postBlind(state, bbIndex, state.minBet);
    state.turnIndex = sbIndex;
    return state;
}

function postBlind(state, playerIndex, amount) {
    const player = state.players[playerIndex];
    const actualAmount = Math.min(player.chips, amount);
    player.chips -= actualAmount; player.currentBet += actualAmount; player.isAllIn = (player.chips === 0); state.pot += actualAmount;
}

function handleAction(state, playerIndex, action, amount = 0) {
    if (state.turnIndex !== playerIndex) return state;
    const player = state.players[playerIndex], opponent = state.players[(playerIndex + 1) % 2];
    const currentHighBet = Math.max(state.players[0].currentBet, state.players[1].currentBet);
    const toCall = currentHighBet - player.currentBet;
    if (action === 'fold') { player.folded = true; return endHand(state, opponent.id); }
    if (action === 'check') { if (toCall > 0) return state; }
    if (action === 'call') {
        if (toCall > player.chips) { state.pot += player.chips; player.currentBet += player.chips; player.chips = 0; player.isAllIn = true; }
        else { player.chips -= toCall; player.currentBet += toCall; player.isAllIn = (player.chips === 0); state.pot += toCall; }
    }
    if (action === 'raise') {
        const raiseAmt = amount - player.currentBet;
        if (raiseAmt > player.chips) return state;
        player.chips -= raiseAmt; player.currentBet = amount; player.isAllIn = (player.chips === 0); state.pot += raiseAmt;
    }
    state.lastAction = `${player.name} ${action}`;
    if (isRoundOver(state)) return nextPhase(state);
    state.turnIndex = (state.turnIndex + 1) % 2;
    return state;
}

function isRoundOver(state) {
    const p1 = state.players[0], p2 = state.players[1];
    if (p1.folded || p2.folded) return true;
    return (p1.currentBet === p2.currentBet && p1.currentBet > 0) || (p1.isAllIn || p2.isAllIn);
}

function nextPhase(state) {
    state.players.forEach(p => p.currentBet = 0);
    if (state.phase === PHASES.PRE_FLOP) { state.phase = PHASES.FLOP; dealCommunity(state, 3); }
    else if (state.phase === PHASES.FLOP) { state.phase = PHASES.TURN; dealCommunity(state, 1); }
    else if (state.phase === PHASES.TURN) { state.phase = PHASES.RIVER; dealCommunity(state, 1); }
    else if (state.phase === PHASES.RIVER) { state.phase = PHASES.SHOWDOWN; return determineWinner(state); }
    state.turnIndex = (state.dealerIndex + 1) % 2;
    return state;
}

function dealCommunity(state, count) { state.communityCards.push(...state.deck.splice(0, count)); }

function determineWinner(state) {
    const p1 = state.players[0], p2 = state.players[1];
    if (p1.folded) return endHand(state, p2.id);
    if (p2.folded) return endHand(state, p1.id);
    const hand1 = evaluateHand([...p1.hand, ...state.communityCards]);
    const hand2 = evaluateHand([...p2.hand, ...state.communityCards]);
    const result = compareHands(hand1, hand2);
    if (result > 0) return endHand(state, p1.id);
    if (result < 0) return endHand(state, p2.id);
    return endHand(state, 'split');
}

function endHand(state, winnerId) {
    state.phase = PHASES.GAME_OVER; state.winner = winnerId;
    if (winnerId === 'split') { const half = Math.floor(state.pot / 2); state.players[0].chips += half; state.players[1].chips += half; }
    else { const winner = state.players.find(p => p.id === winnerId); winner.chips += state.pot; }
    state.pot = 0; state.dealerIndex = (state.dealerIndex + 1) % 2;
    return state;
}

// ============================================
// NETWORK FUNCTIONS (Using Firebase)
// ============================================
function generateRoomId() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

async function createRoom() {
    const roomId = generateRoomId();
    const initialState = createInitialState();
    const roomRef = ref(database, 'rooms/' + roomId);
    await set(roomRef, initialState);
    console.log("Room created:", roomId);
    return roomId;
}

function subscribeToRoom(roomId, callback) {
    const roomRef = ref(database, 'rooms/' + roomId);
    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        if (data) callback(data);
    });
}

async function updateRoomState(roomId, newState) {
    const roomRef = ref(database, 'rooms/' + roomId);
    await set(roomRef, newState);
}

async function sendAction(roomId, playerIndex, action, amount) {
    const roomRef = ref(database, 'rooms/' + roomId);
    try {
        const snapshot = await get(roomRef);
        const currentState = snapshot.val();
        if (!currentState) {
            console.error("Room not found:", roomId);
            return;
        }
        const newState = handleAction(JSON.parse(JSON.stringify(currentState)), playerIndex, action, amount);
        await set(roomRef, newState);
    } catch (e) {
        console.error("sendAction failed:", e);
    }
}

async function triggerStartGame(roomId) {
    const roomRef = ref(database, 'rooms/' + roomId);
    try {
        const snapshot = await get(roomRef);
        const currentState = snapshot.val();
        if (!currentState) {
            console.error("Room not found:", roomId);
            return;
        }
        const newState = startHand(JSON.parse(JSON.stringify(currentState)));
        newState.status = 'playing';
        await set(roomRef, newState);
    } catch (e) {
        console.error("triggerStartGame failed:", e);
    }
}

// ============================================
// GAME STATE & DOM
// ============================================
let myRoomId = null;
let myPlayerIndex = null;
let gameState = null;

const screenLobby = document.getElementById('lobby');
const screenGame = document.getElementById('game');
const inpRoomCode = document.getElementById('inp-room-code');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const lobbyMsg = document.getElementById('lobby-msg');
const displayRoomCode = document.getElementById('display-room-code');
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
        const roomId = await createRoom();
        enterGame(roomId, 0);
    } catch (e) {
        console.error("Create room error:", e);
        lobbyMsg.textContent = "Error creating room.";
        btnCreate.disabled = false;
    }
});

btnJoin.addEventListener('click', () => {
    const code = inpRoomCode.value.trim().toUpperCase();
    if (code.length < 4) return;
    enterGame(code, 1);
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
    if (state.status === 'waiting') {
        if (myPlayerIndex === 1) triggerStartGame(myRoomId);
        potEl.textContent = "Waiting for opponent...";
        return;
    }
    potEl.textContent = state.pot;
    const me = state.players[myPlayerIndex], opponent = state.players[(myPlayerIndex + 1) % 2];
    renderPlayer(me, 'player'); renderPlayer(opponent, 'opponent');
    renderBoard(state.communityCards);
    updateControls(state, me);
    const overlay = document.getElementById('game-overlay');
    if (state.phase === 'game-over') {
        overlay.style.display = 'flex';
        const title = document.getElementById('overlay-msg'), btnNext = document.getElementById('btn-next-hand');
        if (state.winner === 'split') title.textContent = "Split Pot!";
        else if (state.winner === me.id) title.textContent = "You Win!";
        else title.textContent = "Opponent Wins!";
        btnNext.onclick = () => { triggerStartGame(myRoomId); overlay.style.display = 'none'; };
    } else { overlay.style.display = 'none'; }
}

function renderPlayer(playerData, type) {
    const root = document.getElementById(`${type}-area`);
    const chipsEl = root.querySelector('.chips'), cardsEl = root.querySelector('.cards');
    const betEl = document.getElementById(`${type}-bet`), statusEl = document.getElementById(`${type}-status`);
    chipsEl.textContent = `$${playerData.chips}`; if (playerData.isAllIn) chipsEl.textContent += " (All-In)";
    statusEl.classList.remove('show'); let statusText = "";
    if (gameState.dealerIndex === (type === 'player' ? myPlayerIndex : (myPlayerIndex + 1) % 2)) statusText += "D ";
    if (gameState.turnIndex === (type === 'player' ? myPlayerIndex : (myPlayerIndex + 1) % 2) && gameState.phase !== 'showdown' && gameState.phase !== 'game-over') { statusEl.classList.add('show'); statusText += "TURN"; }
    statusEl.textContent = statusText;
    if (playerData.currentBet > 0) { betEl.style.display = 'block'; betEl.textContent = playerData.currentBet; } else { betEl.style.display = 'none'; }
    cardsEl.innerHTML = '';
    const showFaceUp = (type === 'player') || (gameState.phase === 'showdown' && !playerData.folded) || (gameState.phase === 'game-over' && !playerData.folded);
    playerData.hand.forEach(card => {
        if (showFaceUp) cardsEl.appendChild(createCardEl(card));
        else { const back = document.createElement('div'); back.className = 'card back'; cardsEl.appendChild(back); }
    });
}

function renderBoard(cards) {
    boardEl.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        if (cards && cards[i]) boardEl.appendChild(createCardEl(cards[i]));
        else { const slot = document.createElement('div'); slot.className = 'card-slot'; boardEl.appendChild(slot); }
    }
}

function createCardEl(card) {
    const el = document.createElement('div'); el.className = `card ${card.suit}`;
    const suitSymbol = { 'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠' }[card.suit];
    el.textContent = `${card.rank}${suitSymbol}`; return el;
}

// ============================================
// ACTION HANDLERS
// ============================================
document.querySelectorAll('.btn-action').forEach(btn => {
    btn.addEventListener('click', () => handleUserAction(btn.dataset.action));
});

function handleUserAction(action) {
    if (action === 'raise') {
        if (sliderContainer.style.display === 'flex') { sliderContainer.style.display = 'none'; return; }
        const me = gameState.players[myPlayerIndex], opp = gameState.players[(myPlayerIndex + 1) % 2];
        const highBet = Math.max(me.currentBet, opp.currentBet), minRaise = highBet + gameState.minBet, maxBet = me.chips + me.currentBet;
        slider.min = minRaise > maxBet ? maxBet : minRaise; slider.max = maxBet; slider.value = slider.min; raiseVal.textContent = slider.value;
        sliderContainer.style.display = 'flex'; return;
    }
    sendAction(myRoomId, myPlayerIndex, action, 0);
}

slider.addEventListener('input', () => { raiseVal.textContent = slider.value; });
btnConfirmRaise.addEventListener('click', () => { sendAction(myRoomId, myPlayerIndex, 'raise', parseInt(slider.value)); sliderContainer.style.display = 'none'; });

function updateControls(state, me) {
    const isMyTurn = state.turnIndex === myPlayerIndex && state.phase !== 'showdown' && state.phase !== 'game-over';
    document.querySelectorAll('.btn-action').forEach(b => b.disabled = !isMyTurn);
    if (isMyTurn) {
        const opp = state.players[(myPlayerIndex + 1) % 2], highBet = Math.max(me.currentBet, opp.currentBet), toCall = highBet - me.currentBet;
        const btnCheck = document.querySelector('.btn-action.check'), btnCall = document.querySelector('.btn-action.call');
        if (toCall > 0) { btnCheck.disabled = true; btnCall.textContent = `Call ${toCall}`; }
        else { btnCall.disabled = true; btnCheck.disabled = false; btnCall.textContent = "Call"; }
    }
}

console.log("game.js loaded successfully");
