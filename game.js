// ============================================
// FIREBASE ES MODULE IMPORTS
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ============================================
// FIREBASE CONFIG & INIT
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

let database = null;
function initFirebase() {
    const app = initializeApp(firebaseConfig);
    database = getDatabase(app);
    console.log("Firebase initialized");
}
initFirebase();

function getDB() {
    if (!database) throw new Error("DB not ready");
    return database;
}

// ============================================
// CONSTANTS
// ============================================
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const STARTING_CHIPS = 1000;

// ============================================
// DECK & CARDS
// ============================================
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ suit, rank });
        }
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// ============================================
// HAND EVALUATION (Simplified)
// ============================================
function getCardValue(rank) {
    const vals = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    return vals[rank];
}

function evaluateHand(cards) {
    // Returns a score array for comparison
    // Higher is better
    const sorted = [...cards].sort((a, b) => getCardValue(b.rank) - getCardValue(a.rank));
    const values = sorted.map(c => getCardValue(c.rank));
    const suits = sorted.map(c => c.suit);

    const isFlush = suits.every(s => s === suits[0]);
    const uniqueVals = [...new Set(values)];

    // Check straight
    let isStraight = false;
    if (uniqueVals.length === 5) {
        if (values[0] - values[4] === 4) isStraight = true;
        if (values[0] === 14 && values[1] === 5) isStraight = true; // A-2-3-4-5
    }

    // Count occurrences
    const counts = {};
    values.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const countVals = Object.values(counts).sort((a, b) => b - a);

    // Determine hand type (higher = better)
    let handType = 0;
    if (isFlush && isStraight) handType = 8; // Straight flush
    else if (countVals[0] === 4) handType = 7; // Four of a kind
    else if (countVals[0] === 3 && countVals[1] === 2) handType = 6; // Full house
    else if (isFlush) handType = 5;
    else if (isStraight) handType = 4;
    else if (countVals[0] === 3) handType = 3; // Three of a kind
    else if (countVals[0] === 2 && countVals[1] === 2) handType = 2; // Two pair
    else if (countVals[0] === 2) handType = 1; // Pair

    return { type: handType, values };
}

function getBestHand(allCards) {
    // Get best 5-card hand from 7 cards
    if (allCards.length <= 5) return evaluateHand(allCards);

    let best = null;
    const combos = getCombinations(allCards, 5);
    for (const combo of combos) {
        const hand = evaluateHand(combo);
        if (!best || compareHands(hand, best) > 0) best = hand;
    }
    return best;
}

function getCombinations(arr, k) {
    if (k === 1) return arr.map(x => [x]);
    const result = [];
    for (let i = 0; i <= arr.length - k; i++) {
        const rest = getCombinations(arr.slice(i + 1), k - 1);
        for (const r of rest) result.push([arr[i], ...r]);
    }
    return result;
}

function compareHands(h1, h2) {
    if (h1.type !== h2.type) return h1.type - h2.type;
    for (let i = 0; i < Math.min(h1.values.length, h2.values.length); i++) {
        if (h1.values[i] !== h2.values[i]) return h1.values[i] - h2.values[i];
    }
    return 0;
}

// ============================================
// GAME STATE MANAGEMENT
// ============================================

function createNewGame(playerCount) {
    const players = [];
    for (let i = 0; i < playerCount; i++) {
        players.push({
            id: i,
            name: `Player ${i + 1}`,
            chips: STARTING_CHIPS,
            cards: [],
            bet: 0,
            folded: false,
            allIn: false,
            connected: false
        });
    }

    return {
        status: 'waiting', // waiting, playing, finished
        players,
        maxPlayers: playerCount,
        connectedCount: 0,

        // Game state
        deck: [],
        community: [],
        pot: 0,
        phase: 'waiting', // waiting, preflop, flop, turn, river, showdown

        // Betting
        dealer: 0,
        currentPlayer: 0,
        lastRaise: 0, // Who raised last (to know when betting round ends)
        currentBet: 0, // Current bet to match
        minRaise: BIG_BLIND,

        // Tracking
        lastActive: Date.now(),
        winner: null,
        message: ''
    };
}

function dealCards(state) {
    state.deck = createDeck();
    state.community = [];
    state.pot = 0;
    state.phase = 'preflop';
    state.currentBet = 0;
    state.minRaise = BIG_BLIND;
    state.winner = null;
    state.message = 'New hand';

    // Reset players
    state.players.forEach(p => {
        p.cards = [];
        p.bet = 0;
        p.folded = false;
        p.allIn = false;
    });

    // Deal 2 cards to connected players
    state.players.forEach(p => {
        if (p.connected && p.chips > 0) {
            p.cards = [state.deck.pop(), state.deck.pop()];
        } else {
            p.folded = true;
        }
    });

    // Post blinds (heads-up: dealer is SB)
    const sb = state.dealer;
    const bb = (state.dealer + 1) % state.players.length;

    postBlind(state, sb, SMALL_BLIND);
    postBlind(state, bb, BIG_BLIND);

    state.currentBet = BIG_BLIND;
    state.actedThisRound = 0; // Track how many have acted this betting round

    // First to act preflop (UTG, which is after BB... in heads-up that's the SB/dealer)
    if (state.players.length === 2) {
        state.currentPlayer = sb; // Dealer/SB acts first preflop in heads-up
    } else {
        state.currentPlayer = nextActivePlayer(state, bb);
    }

    state.lastRaise = bb; // BB is the last "raiser" initially
    console.log(`Deal: SB=${sb}, BB=${bb}, first to act=${state.currentPlayer}`);

    return state;
}

function postBlind(state, playerIdx, amount) {
    const p = state.players[playerIdx];
    if (!p || p.folded) return;
    const actual = Math.min(p.chips, amount);
    p.chips -= actual;
    p.bet = actual;
    p.allIn = p.chips === 0;
    state.pot += actual;
}

function nextActivePlayer(state, fromIdx) {
    let idx = (fromIdx + 1) % state.players.length;
    let count = 0;
    while (count < state.players.length) {
        const p = state.players[idx];
        if (p.connected && !p.folded && !p.allIn) return idx;
        idx = (idx + 1) % state.players.length;
        count++;
    }
    return -1;
}

function activePlayers(state) {
    return state.players.filter(p => p.connected && !p.folded);
}

function activeNonAllIn(state) {
    return state.players.filter(p => p.connected && !p.folded && !p.allIn);
}

// ============================================
// ACTIONS
// ============================================

function handlePlayerAction(state, playerIdx, action, amount = 0) {
    console.log(`ACTION: Player ${playerIdx} does ${action} with amount ${amount}`);

    if (state.currentPlayer !== playerIdx) {
        console.log("Not your turn!");
        return state;
    }

    const player = state.players[playerIdx];
    if (!player || player.folded || player.allIn) {
        console.log("Invalid player state");
        return state;
    }

    state.lastActive = Date.now();
    const toCall = state.currentBet - player.bet;

    if (action === 'fold') {
        player.folded = true;
        state.message = `${player.name} folds`;
        state.actedThisRound++; // Player has acted

        // Check if only one player left
        const remaining = activePlayers(state);
        if (remaining.length === 1) {
            return endHand(state, remaining[0].id);
        }
    }
    else if (action === 'check') {
        if (toCall > 0) {
            console.log("Cannot check, must call/fold/raise");
            return state;
        }
        state.message = `${player.name} checks`;
        state.actedThisRound++; // Player has acted
    }
    else if (action === 'call') {
        const callAmount = Math.min(toCall, player.chips);
        player.chips -= callAmount;
        player.bet += callAmount;
        state.pot += callAmount;
        player.allIn = player.chips === 0;
        state.message = `${player.name} calls ${callAmount}`;
        state.actedThisRound++; // Player has acted
    }
    else if (action === 'raise') {
        // amount = total bet size
        if (amount <= state.currentBet) {
            console.log("Raise must be more than current bet");
            return state;
        }
        const totalNeeded = amount - player.bet;
        if (totalNeeded > player.chips) {
            console.log("Not enough chips");
            return state;
        }
        player.chips -= totalNeeded;
        player.bet = amount;
        state.pot += totalNeeded;
        state.currentBet = amount;
        state.minRaise = amount - state.currentBet + BIG_BLIND;
        state.lastRaise = playerIdx;
        player.allIn = player.chips === 0;
        state.message = `${player.name} raises to ${amount}`;

        // Reset action counter because a raise re-opens betting for everyone else
        // The raiser has acted, so count starts at 1
        state.actedThisRound = 1;
    }
    else if (action === 'allin') {
        const allInAmount = player.chips;
        player.chips = 0;
        player.bet += allInAmount;
        state.pot += allInAmount;
        player.allIn = true;

        if (player.bet > state.currentBet) {
            state.currentBet = player.bet;
            state.lastRaise = playerIdx;
            state.actedThisRound = 1; // Treat as raise
        } else {
            state.actedThisRound++; // Treat as call/check
        }
        state.message = `${player.name} all-in!`;
    }

    // Check if betting round is over
    if (isBettingRoundOver(state)) {
        return advancePhase(state);
    }

    // Move to next player
    state.currentPlayer = nextActivePlayer(state, playerIdx);
    if (state.currentPlayer === -1) {
        return advancePhase(state);
    }

    return state;
}

function isBettingRoundOver(state) {
    const active = activeNonAllIn(state);

    // Only 0 or 1 players can act
    if (active.length <= 1) {
        console.log("Round over: 1 or fewer active players");
        return true;
    }

    // All bets must be equal
    const allEqual = active.every(p => p.bet === state.currentBet);
    if (!allEqual) {
        console.log(`Round NOT over: bets not equal (currentBet=${state.currentBet})`);
        return false;
    }

    // All active players must have acted this round
    const allActed = state.actedThisRound >= active.length;
    console.log(`Round check: actedThisRound=${state.actedThisRound}, activeCount=${active.length}, allActed=${allActed}`);

    return allActed;
}

function advancePhase(state) {
    console.log(`Advancing from ${state.phase}`);

    // Safety checks for Firebase arrays
    if (!state.community) state.community = [];
    if (!state.deck) state.deck = [];

    // Reset bets for new round
    state.players.forEach(p => p.bet = 0);
    state.currentBet = 0;
    state.actedThisRound = 0; // Reset action counter

    if (state.phase === 'preflop') {
        state.phase = 'flop';
        if (state.deck.length >= 3) {
            state.deck.pop(); // Burn
            state.community.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
        }
        state.message = 'Flop';
    }
    else if (state.phase === 'flop') {
        state.phase = 'turn';
        if (state.deck.length >= 1) {
            state.deck.pop(); // Burn
            state.community.push(state.deck.pop());
        }
        state.message = 'Turn';
    }
    else if (state.phase === 'turn') {
        state.phase = 'river';
        if (state.deck.length >= 1) {
            state.deck.pop(); // Burn
            state.community.push(state.deck.pop());
        }
        state.message = 'River';
    }
    else if (state.phase === 'river') {
        return showdown(state);
    }

    // Check if we can continue betting or go straight to showdown
    const canAct = activeNonAllIn(state);
    if (canAct.length <= 1) {
        // Everyone is all-in or only 1 player left, deal remaining cards
        while (state.community.length < 5 && state.phase !== 'showdown') {
            if (state.community.length < 3) {
                state.deck.pop();
                state.community.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
            } else if (state.community.length < 4) {
                state.deck.pop();
                state.community.push(state.deck.pop());
            } else if (state.community.length < 5) {
                state.deck.pop();
                state.community.push(state.deck.pop());
            }
        }
        return showdown(state);
    }

    // First to act post-flop is first active after dealer
    state.currentPlayer = nextActivePlayer(state, state.dealer);
    state.lastRaise = state.currentPlayer; // Reset for new round

    console.log(`Now in ${state.phase}, current player: ${state.currentPlayer}`);
    return state;
}

function showdown(state) {
    state.phase = 'showdown';
    console.log("SHOWDOWN!");

    const contenders = activePlayers(state);
    if (contenders.length === 1) {
        return endHand(state, contenders[0].id);
    }

    // Evaluate hands
    let bestHand = null;
    let winners = [];

    for (const p of contenders) {
        const allCards = [...p.cards, ...state.community];
        const hand = getBestHand(allCards);

        if (!bestHand || compareHands(hand, bestHand) > 0) {
            bestHand = hand;
            winners = [p];
        } else if (compareHands(hand, bestHand) === 0) {
            winners.push(p);
        }
    }

    // Distribute pot
    const share = Math.floor(state.pot / winners.length);
    winners.forEach(w => w.chips += share);

    state.winner = winners.length === 1 ? winners[0].id : 'split';
    state.message = winners.length === 1 ? `${winners[0].name} wins!` : 'Split pot!';
    state.phase = 'finished';

    return state;
}

function endHand(state, winnerId) {
    const winner = state.players.find(p => p.id === winnerId);
    if (winner) {
        winner.chips += state.pot;
        state.message = `${winner.name} wins the pot!`;
    }
    state.pot = 0;
    state.winner = winnerId;
    state.phase = 'finished';
    state.dealer = (state.dealer + 1) % state.players.length;
    return state;
}

function startNewHand(state) {
    state.dealer = (state.dealer + 1) % state.players.length;
    return dealCards(state);
}

// ============================================
// FIREBASE FUNCTIONS
// ============================================

function genRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function createRoom(playerCount) {
    const db = getDB();
    const roomId = genRoomId();
    const state = createNewGame(playerCount);
    state.players[0].connected = true;
    state.connectedCount = 1;
    await set(ref(db, 'rooms/' + roomId), state);
    console.log("Room created:", roomId);
    return roomId;
}

function sanitizeState(state) {
    if (!state) return null;
    if (!state.players) state.players = [];
    if (!state.deck) state.deck = [];
    if (!state.community) state.community = [];

    state.players.forEach(p => {
        if (!p.cards) p.cards = [];
    });

    return state;
}

async function joinRoom(roomId, playerIdx) {
    const db = getDB();
    const roomRef = ref(db, 'rooms/' + roomId);
    const snap = await get(roomRef);
    let state = snap.val();
    if (!state) return false;

    state = sanitizeState(state);

    state.players[playerIdx].connected = true;
    state.connectedCount = state.players.filter(p => p.connected).length;
    state.lastActive = Date.now();

    // Start game when 2+ players connected
    if (state.connectedCount >= 2 && state.status === 'waiting') {
        dealCards(state);
        state.status = 'playing';
    }

    await set(roomRef, state);
    return true;
}

function subscribeToRoom(roomId, callback) {
    const db = getDB();
    onValue(ref(db, 'rooms/' + roomId), (snap) => {
        let data = snap.val();
        if (data) {
            data = sanitizeState(data);
            callback(data);
        }
    });
}

async function sendPlayerAction(roomId, playerIdx, action, amount) {
    const db = getDB();
    const roomRef = ref(db, 'rooms/' + roomId);
    const snap = await get(roomRef);
    let state = snap.val();
    if (!state) return;

    state = sanitizeState(state);
    const newState = handlePlayerAction(state, playerIdx, action, amount);
    await set(roomRef, newState);
}

async function requestNewHand(roomId) {
    const db = getDB();
    const roomRef = ref(db, 'rooms/' + roomId);
    const snap = await get(roomRef);
    let state = snap.val();
    if (!state) return;

    state = sanitizeState(state);
    const newState = startNewHand(state);
    newState.status = 'playing';
    await set(roomRef, newState);
}

// Room cleanup
async function cleanupOldRooms() {
    const db = getDB();
    const snap = await get(ref(db, 'rooms'));
    const rooms = snap.val();
    if (!rooms) return;

    const now = Date.now();
    const TIMEOUT = 30 * 60 * 1000;

    for (const id in rooms) {
        if (id === 'ping' || id === 'testRoom') continue;
        const room = rooms[id];
        if (now - (room.lastActive || 0) > TIMEOUT) {
            console.log("Deleting old room:", id);
            await remove(ref(db, 'rooms/' + id));
        }
    }
}

setInterval(cleanupOldRooms, 5 * 60 * 1000);

// ============================================
// UI LOGIC
// ============================================
let myRoomId = null;
let myPlayerIdx = null;
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

// Lobby
btnCreate.addEventListener('click', async () => {
    btnCreate.disabled = true;
    lobbyMsg.textContent = "Creating...";
    try {
        const count = parseInt(playerCountSelect.value);
        const roomId = await createRoom(count);
        enterGame(roomId, 0);
    } catch (e) {
        console.error(e);
        lobbyMsg.textContent = "Error";
        btnCreate.disabled = false;
    }
});

btnJoin.addEventListener('click', async () => {
    const code = inpRoomCode.value.trim().toUpperCase();
    if (code.length < 4) return;

    lobbyMsg.textContent = "Joining...";
    const db = getDB();
    const snap = await get(ref(db, 'rooms/' + code));
    const state = snap.val();

    if (!state) {
        lobbyMsg.textContent = "Room not found";
        return;
    }

    // Find slot
    let slot = -1;
    for (let i = 0; i < state.players.length; i++) {
        if (!state.players[i].connected) { slot = i; break; }
    }

    if (slot === -1) {
        lobbyMsg.textContent = "Room full";
        return;
    }

    const ok = await joinRoom(code, slot);
    if (ok) enterGame(code, slot);
    else lobbyMsg.textContent = "Failed to join";
});

function enterGame(roomId, playerIdx) {
    myRoomId = roomId;
    myPlayerIdx = playerIdx;
    screenLobby.classList.remove('active');
    screenGame.classList.add('active');
    displayRoomCode.textContent = roomId;

    subscribeToRoom(roomId, (state) => {
        gameState = state;
        render(state);
    });
}

// Rendering
function render(state) {
    playerCountDisplay.textContent = `${state.connectedCount}/${state.maxPlayers}`;

    if (state.status === 'waiting') {
        potEl.textContent = "Waiting for players...";
        renderOpponents(state);
        renderMyCards(state);
        return;
    }

    potEl.textContent = `${state.pot} | ${state.message || state.phase}`;

    renderOpponents(state);
    renderMyCards(state);
    renderBoard(state);
    updateButtons(state);

    // Handle game over overlay
    const overlay = document.getElementById('game-overlay');
    if (state.phase === 'finished' || state.phase === 'showdown') {
        overlay.style.display = 'flex';
        document.getElementById('overlay-msg').textContent = state.message;
        document.getElementById('btn-next-hand').onclick = () => {
            requestNewHand(myRoomId);
            overlay.style.display = 'none';
        };
    } else {
        overlay.style.display = 'none';
    }
}

function renderOpponents(state) {
    opponentsContainer.innerHTML = '';
    state.players.forEach((p, i) => {
        if (i === myPlayerIdx) return;

        const div = document.createElement('div');
        div.className = 'player-area opponent';

        let cardsHtml = '';
        if (p.cards && p.cards.length > 0) {
            const showCards = state.phase === 'showdown' || state.phase === 'finished';
            p.cards.forEach(c => {
                if (showCards && !p.folded) {
                    const sym = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[c.suit];
                    cardsHtml += `<div class="card ${c.suit}">${c.rank}${sym}</div>`;
                } else {
                    cardsHtml += '<div class="card back"></div>';
                }
            });
        }

        const isTurn = state.currentPlayer === i && state.phase !== 'showdown' && state.phase !== 'finished';

        div.innerHTML = `
            <div class="cards">${cardsHtml}</div>
            <div class="player-info">
                <div class="avatar">${p.connected ? `P${i + 1}` : '?'}</div>
                <div class="details">
                    <span class="name">${p.name}${p.folded ? ' (Folded)' : ''}</span>
                    <span class="chips">$${p.chips}${p.bet > 0 ? ` | Bet: ${p.bet}` : ''}</span>
                </div>
            </div>
            ${isTurn ? '<div class="status-bubble show">TURN</div>' : ''}
        `;
        opponentsContainer.appendChild(div);
    });
}

function renderMyCards(state) {
    const me = state.players[myPlayerIdx];
    const cardsEl = document.getElementById('player-cards');
    const chipsEl = document.querySelector('#player-area .chips');
    const statusEl = document.getElementById('player-status');
    const betEl = document.getElementById('player-bet');

    cardsEl.innerHTML = '';
    if (me.cards && me.cards.length > 0) {
        me.cards.forEach(c => {
            const sym = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[c.suit];
            cardsEl.innerHTML += `<div class="card ${c.suit}">${c.rank}${sym}</div>`;
        });
    }

    chipsEl.textContent = `$${me.chips}${me.allIn ? ' (ALL-IN)' : ''}`;

    const isTurn = state.currentPlayer === myPlayerIdx && state.phase !== 'showdown' && state.phase !== 'finished';
    if (isTurn) {
        statusEl.classList.add('show');
        statusEl.textContent = 'YOUR TURN';
    } else {
        statusEl.classList.remove('show');
    }

    if (me.bet > 0) {
        betEl.style.display = 'block';
        betEl.textContent = me.bet;
    } else {
        betEl.style.display = 'none';
    }
}

function renderBoard(state) {
    boardEl.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        if (state.community && state.community[i]) {
            const c = state.community[i];
            const sym = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[c.suit];
            boardEl.innerHTML += `<div class="card ${c.suit}">${c.rank}${sym}</div>`;
        } else {
            boardEl.innerHTML += '<div class="card-slot"></div>';
        }
    }
}

function updateButtons(state) {
    const me = state.players[myPlayerIdx];
    const isTurn = state.currentPlayer === myPlayerIdx &&
        state.phase !== 'showdown' &&
        state.phase !== 'finished' &&
        !me.folded && !me.allIn;

    document.querySelectorAll('.btn-action').forEach(b => b.disabled = !isTurn);

    if (isTurn) {
        const toCall = state.currentBet - me.bet;
        const btnCheck = document.querySelector('.btn-action.check');
        const btnCall = document.querySelector('.btn-action.call');

        if (toCall > 0) {
            btnCheck.disabled = true;
            btnCall.textContent = `Call ${toCall}`;
            btnCall.disabled = false;
        } else {
            btnCall.disabled = true;
            btnCheck.disabled = false;
            btnCall.textContent = 'Call';
        }
    }
}

// Actions
document.querySelectorAll('.btn-action').forEach(btn => {
    btn.addEventListener('click', () => doAction(btn.dataset.action));
});

const sliderContainer = document.getElementById('raise-slider-container');
const slider = document.getElementById('raise-slider');
const raiseVal = document.getElementById('raise-val');
const btnConfirmRaise = document.getElementById('btn-confirm-raise');

function doAction(action) {
    if (!gameState) return;
    const me = gameState.players[myPlayerIdx];

    if (action === 'raise') {
        if (sliderContainer.style.display === 'flex') {
            sliderContainer.style.display = 'none';
            return;
        }

        const minBet = gameState.currentBet + BIG_BLIND;
        const maxBet = me.chips + me.bet;

        slider.min = Math.min(minBet, maxBet);
        slider.max = maxBet;
        slider.value = slider.min;
        raiseVal.value = slider.min;
        sliderContainer.style.display = 'flex';
        return;
    }

    sendPlayerAction(myRoomId, myPlayerIdx, action, 0);
}

slider.addEventListener('input', () => raiseVal.value = slider.value);
raiseVal.addEventListener('input', () => {
    let v = parseInt(raiseVal.value) || parseInt(slider.min);
    v = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), v));
    slider.value = v;
    raiseVal.value = v;
});

btnConfirmRaise.addEventListener('click', () => {
    const amount = parseInt(raiseVal.value) || parseInt(slider.value);
    sendPlayerAction(myRoomId, myPlayerIdx, 'raise', amount);
    sliderContainer.style.display = 'none';
});

console.log("Game loaded!");
