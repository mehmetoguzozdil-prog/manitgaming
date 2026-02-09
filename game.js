// ============================================
// FIREBASE ES MODULE IMPORTS
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ============================================
// CONFIG & CONSTANTS
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

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const STARTING_CHIPS = 1000;
const TURN_TIME_LIMIT = 30000; // 30s

// ============================================
// AUDIO MANAGER (Phase 3)
// ============================================
const sounds = {
    deal: new Audio('https://assets.mixkit.co/active_storage/sfx/2012/2012-preview.mp3'),
    chips: new Audio('https://assets.mixkit.co/active_storage/sfx/1070/1070-preview.mp3'),
    alert: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3')
};

function playSound(name) {
    const s = sounds[name];
    if (s) {
        s.currentTime = 0;
        s.play().catch(e => console.log("Audio play blocked"));
    }
}

// ============================================
// CARD LOGIC & HAND EVALUATION
// ============================================
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) deck.push({ suit, rank });
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function getCardValue(rank) {
    const vals = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    return vals[rank];
}

function evaluateHand(cards) {
    const sorted = [...cards].sort((a, b) => getCardValue(b.rank) - getCardValue(a.rank));
    const values = sorted.map(c => getCardValue(c.rank));
    const suits = sorted.map(c => c.suit);
    const isFlush = suits.every(s => s === suits[0]);
    const uniqueVals = [...new Set(values)];

    let isStraight = false;
    let straightHigh = -1;
    if (uniqueVals.length === 5) {
        if (values[0] - values[4] === 4) { isStraight = true; straightHigh = values[0]; }
        else if (values[0] === 14 && values[1] === 5 && values[4] === 2) { isStraight = true; straightHigh = 5; }
    }

    const counts = {};
    values.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const pairs = Object.entries(counts).filter(e => e[1] === 2).map(e => parseInt(e[0])).sort((a, b) => b - a);
    const trips = Object.entries(counts).filter(e => e[1] === 3).map(e => parseInt(e[0])).sort((a, b) => b - a);
    const quads = Object.entries(counts).filter(e => e[1] === 4).map(e => parseInt(e[0])).sort((a, b) => b - a);
    const singles = Object.entries(counts).filter(e => e[1] === 1).map(e => parseInt(e[0])).sort((a, b) => b - a);

    if (isFlush && isStraight) return { type: 8, subValues: [straightHigh] };
    if (quads.length > 0) return { type: 7, subValues: [quads[0], singles[0]] };
    if (trips.length > 0 && pairs.length > 0) return { type: 6, subValues: [trips[0], pairs[0]] };
    if (isFlush) return { type: 5, subValues: values };
    if (isStraight) return { type: 4, subValues: [straightHigh] };
    if (trips.length > 0) return { type: 3, subValues: [trips[0], ...singles.slice(0, 2)] };
    if (pairs.length >= 2) return { type: 2, subValues: [pairs[0], pairs[1], singles[0]] };
    if (pairs.length === 1) return { type: 1, subValues: [pairs[0], ...singles.slice(0, 3)] };
    return { type: 0, subValues: values };
}

function compareHands(h1, h2) {
    if (h1.type !== h2.type) return h1.type - h2.type;
    for (let i = 0; i < h1.subValues.length; i++) {
        if (h1.subValues[i] !== h2.subValues[i]) return h1.subValues[i] - h2.subValues[i];
    }
    return 0;
}

function getBestHand(allCards) {
    if (allCards.length < 5) return { ...evaluateHand(allCards), cards: allCards };
    let best = null;
    const combos = getCombinations(allCards, 5);
    for (const combo of combos) {
        const h = evaluateHand(combo);
        if (!best || compareHands(h, best) > 0) best = { ...h, cards: combo };
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

function getHandName(type) {
    return ["High Card", "Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush"][type];
}

// ============================================
// GAME LOGIC CORE
// ============================================

function createNewGame(playerCount) {
    const players = [];
    for (let i = 0; i < playerCount; i++) {
        players.push({ id: i, name: `Player ${i + 1}`, chips: STARTING_CHIPS, cards: [], bet: 0, contributed: 0, folded: false, allIn: false, bankrupt: false, connected: false, avatar: '👤' });
    }
    return {
        status: 'waiting', maxPlayers: playerCount, connectedCount: 0,
        deck: [], community: [], pot: 0, pots: [], phase: 'waiting',
        dealer: 0, currentPlayer: 0, lastRaise: 0, currentBet: 0, minRaise: BIG_BLIND,
        actedThisRound: 0, turnEndTime: 0, isGameOver: false, message: ''
    };
}

function dealCards(state) {
    state.deck = createDeck();
    state.community = [];
    state.pot = 0;
    state.pots = [];
    state.phase = 'preflop';
    state.currentBet = BIG_BLIND;
    state.minRaise = BIG_BLIND;
    state.actedThisRound = 0;
    state.turnEndTime = Date.now() + TURN_TIME_LIMIT;

    state.players.forEach(p => {
        p.cards = []; p.bet = 0; p.contributed = 0;
        p.folded = !(p.connected && !p.bankrupt && p.chips > 0);
        p.allIn = false;
    });

    const active = state.players.filter(p => !p.folded);
    active.forEach(p => p.cards = [state.deck.pop(), state.deck.pop()]);

    let sbPtr, bbPtr;
    if (active.length === 2) {
        sbPtr = state.dealer;
        bbPtr = findNextPlayer(state, sbPtr);
    } else {
        sbPtr = findNextPlayer(state, state.dealer);
        bbPtr = findNextPlayer(state, sbPtr);
    }

    applyBet(state, sbPtr, SMALL_BLIND);
    applyBet(state, bbPtr, BIG_BLIND);

    state.currentPlayer = (active.length === 2) ? sbPtr : findNextPlayer(state, bbPtr);
    state.lastRaise = bbPtr;
    playSound('deal');
    return state;
}

function applyBet(state, idx, amount) {
    const p = state.players[idx];
    const actual = Math.min(p.chips, amount);
    p.chips -= actual;
    p.bet += actual;
    p.contributed += actual;
    p.allIn = p.chips === 0;
    state.pot += actual;
}

function findNextPlayer(state, fromIdx) {
    let idx = (fromIdx + 1) % state.players.length;
    for (let i = 0; i < state.players.length; i++) {
        const p = state.players[idx];
        if (p.connected && !p.folded && !p.bankrupt && !p.allIn) return idx;
        idx = (idx + 1) % state.players.length;
    }
    return -1;
}

function handleAction(state, playerIdx, action, amount = 0) {
    if (state.currentPlayer !== playerIdx) return state;
    const player = state.players[playerIdx];
    const toCall = state.currentBet - player.bet;

    if (action === 'fold') {
        player.folded = true;
    } else if (action === 'check') {
        if (toCall > 0) return state;
    } else if (action === 'call') {
        applyBet(state, playerIdx, toCall);
    } else if (action === 'raise') {
        const total = toCall + amount;
        if (total > player.chips) return state;
        applyBet(state, playerIdx, total);
        state.currentBet = player.bet;
        state.lastRaise = playerIdx;
        state.actedThisRound = 0; // Reset
    } else if (action === 'allin') {
        const chips = player.chips;
        applyBet(state, playerIdx, chips);
        if (player.bet > state.currentBet) {
            state.currentBet = player.bet;
            state.lastRaise = playerIdx;
            state.actedThisRound = 0;
        }
    }

    state.actedThisRound++;
    playSound('chips');

    if (isRoundOver(state)) return advancePhase(state);
    state.currentPlayer = findNextPlayer(state, playerIdx);
    state.turnEndTime = Date.now() + TURN_TIME_LIMIT;
    if (state.currentPlayer === -1) return advancePhase(state);

    return state;
}

function isRoundOver(state) {
    const active = state.players.filter(p => p.connected && !p.folded && !p.bankrupt && !p.allIn);
    if (active.length === 0) return true;
    const allMatched = active.every(p => p.bet === state.currentBet);
    return allMatched && state.actedThisRound >= active.length;
}

function advancePhase(state) {
    state.players.forEach(p => p.bet = 0);
    state.currentBet = 0;
    state.actedThisRound = 0;

    if (state.phase === 'preflop') state.phase = 'flop';
    else if (state.phase === 'flop') state.phase = 'turn';
    else if (state.phase === 'turn') state.phase = 'river';
    else if (state.phase === 'river') return showdown(state);

    const burn = state.deck.pop();
    if (state.phase === 'flop') state.community.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
    else state.community.push(state.deck.pop());

    const canAct = state.players.filter(p => p.connected && !p.folded && !p.bankrupt && !p.allIn);
    if (canAct.length <= 1) {
        while (state.community.length < 5) state.community.push(state.deck.pop());
        return showdown(state);
    }

    state.currentPlayer = findNextPlayer(state, state.dealer);
    state.turnEndTime = Date.now() + TURN_TIME_LIMIT;
    return state;
}

function calculateSidePots(state) {
    const contribs = state.players.map(p => ({ id: p.id, amt: p.contributed, f: p.folded })).filter(c => c.amt > 0);
    const levels = [...new Set(contribs.map(c => c.amt))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    levels.forEach(lvl => {
        const slice = lvl - prev;
        const participants = contribs.filter(c => c.amt >= lvl).length;
        const eligible = contribs.filter(c => c.amt >= lvl && !c.f).map(c => c.id);
        if (eligible.length > 0) pots.push({ amount: slice * participants, eligible });
        prev = lvl;
    });
    return pots;
}

function showdown(state) {
    state.phase = 'showdown';
    const pots = calculateSidePots(state);
    const results = state.players.map(p => (p.folded || p.bankrupt) ? null : { id: p.id, hand: getBestHand([...p.cards, ...state.community]) });

    pots.forEach(pot => {
        let best = null, winners = [];
        pot.eligible.forEach(id => {
            const h = results[id].hand;
            if (!best || compareHands(h, best) > 0) { best = h; winners = [state.players[id]]; }
            else if (compareHands(h, best) === 0) winners.push(state.players[id]);
        });
        const share = Math.floor(pot.amount / winners.length);
        winners.forEach(w => w.chips += share);
        const extra = pot.amount % winners.length;
        if (extra > 0) {
            winners.sort((a, b) => ((a.id - state.dealer + state.players.length) % state.players.length) - ((b.id - state.dealer + state.players.length) % state.players.length));
            winners[0].chips += extra;
        }
    });

    state.pot = 0;
    state.players.forEach(p => { if (p.chips <= 0 && p.connected) p.bankrupt = true; });
    const alive = state.players.filter(p => !p.bankrupt && p.connected);
    if (alive.length === 1) {
        state.isGameOver = true;
        state.message = `🏆 ${alive[0].name} wins the tournament!`;
    } else {
        state.message = "Hand finished.";
    }
    state.phase = 'finished';
    return state;
}

// ============================================
// UI RENDERING & EVENTS
// ============================================
let myRoomId = null;
let myPlayerIdx = -1;

function render(state) {
    const app = document.getElementById('app');
    const lobby = document.getElementById('lobby');
    const game = document.getElementById('game');

    if (state.status === 'waiting') {
        lobby.classList.add('active'); game.classList.remove('active');
        document.getElementById('display-room-code').textContent = myRoomId;
        document.getElementById('player-count-display').textContent = `${state.connectedCount}/${state.maxPlayers}`;
        const startGroup = document.getElementById('game-start-controls');
        startGroup.style.display = 'block';
        document.getElementById('btn-start-game').style.display = (myPlayerIdx === 0) ? 'inline-block' : 'none';
        document.getElementById('host-waiting-msg').style.display = (myPlayerIdx !== 0) ? 'block' : 'none';
    } else {
        lobby.classList.remove('active'); game.classList.add('active');
        renderTable(state);
    }
}

function renderTable(state) {
    document.getElementById('pot-amount').textContent = state.pot;
    const me = state.players[myPlayerIdx];

    // Timer & Hand Strength
    if (state.currentPlayer === myPlayerIdx) playSound('alert');
    const strengthEl = document.getElementById('hand-strength');
    if (!me.folded && state.community.length >= 3) {
        strengthEl.textContent = `Hand: ${getHandName(getBestHand([...me.cards, ...state.community]).type)}`;
    } else strengthEl.textContent = "";

    // Opponents
    const container = document.getElementById('opponents-container');
    container.innerHTML = '';
    state.players.forEach((p, i) => {
        if (i === myPlayerIdx) renderMe(p, state);
        else {
            const div = document.createElement('div');
            div.className = `player-area ${state.currentPlayer === i ? 'active-turn' : ''}`;
            div.setAttribute('data-idx', i);
            const isWinner = p.winningHand;
            div.innerHTML = `
                <div class="cards">${p.cards.map((c, ci) => {
                const highlight = isWinner && isWinner.some(wc => wc.rank === c.rank && wc.suit === c.suit) ? 'winner-highlight' : '';
                return `<div class="card ${state.phase === 'showdown' ? 'revealed' : ''} ${highlight}"><div class="card-face card-back"></div><div class="card-face card-front ${c.suit}">${c.rank}</div></div>`;
            }).join('')}</div>
                <div class="player-info"><div class="avatar">${p.avatar}</div><div class="details"><span>${p.name}</span><span class="chips">$${p.chips}</span></div></div>
                ${state.currentPlayer === i ? `<div class="timer-circle"></div>` : ''}
            `;
            container.appendChild(div);
        }
    });

    // Board
    const board = document.getElementById('board');
    board.innerHTML = state.community.map(c => `<div class="card revealed"><div class="card-face card-back"></div><div class="card-face card-front ${c.suit}">${c.rank}</div></div>`).join('') + Array(5 - state.community.length).fill('<div class="card-slot"></div>').join('');

    // Controls
    const controls = document.getElementById('controls');
    controls.style.display = (state.currentPlayer === myPlayerIdx) ? 'block' : 'none';
    const toCall = state.currentBet - me.bet;
    document.querySelector('.call').textContent = toCall > 0 ? `Call ${toCall}` : 'Check';
    document.getElementById('betting-shortcuts').style.display = 'flex';
}

function renderMe(p, state) {
    const area = document.getElementById('player-area');
    area.className = `player-area me ${state.currentPlayer === myPlayerIdx ? 'active-turn' : ''}`;
    const cardsEl = document.getElementById('player-cards');
    cardsEl.innerHTML = p.cards.map(c => `<div class="card revealed"><div class="card-face card-back"></div><div class="card-face card-front ${c.suit}">${c.rank}</div></div>`).join('');
    area.querySelector('.chips').textContent = `$${p.chips}`;
    if (state.currentPlayer === myPlayerIdx) {
        let t = area.querySelector('.timer-circle');
        if (!t) { t = document.createElement('div'); t.className = 'timer-circle'; area.appendChild(t); }
        const left = Math.max(0, Math.ceil((state.turnEndTime - Date.now()) / 1000));
        t.textContent = left;
    }
}

// ============================================
// FIREBASE SYNC
// ============================================
async function joinRoom(roomId, name) {
    const roomRef = ref(database, 'rooms/' + roomId);
    const snap = await get(roomRef);
    if (!snap.exists()) return alert("Room not found");
    const state = snap.val();
    const idx = state.players.findIndex(p => !p.connected);
    if (idx === -1) return alert("Room full");

    myPlayerIdx = idx; myRoomId = roomId;
    state.players[idx].connected = true;
    state.players[idx].name = name || `Player ${idx + 1}`;
    state.connectedCount++;
    await set(roomRef, state);

    onValue(roomRef, (s) => { if (s.exists()) render(s.val()); });
}

// Event Listeners
document.getElementById('btn-create').onclick = async () => {
    const name = document.getElementById('player-name').value;
    const count = parseInt(document.getElementById('player-count').value);
    const id = Math.random().toString(36).substring(2, 7).toUpperCase();
    const state = createNewGame(count);
    state.players[0].connected = true; state.players[0].name = name || "Host";
    state.connectedCount = 1;
    myRoomId = id; myPlayerIdx = 0;
    await set(ref(database, 'rooms/' + id), state);
    onValue(ref(database, 'rooms/' + id), (s) => { if (s.exists()) render(s.val()); });
};

document.getElementById('btn-join').onclick = () => {
    const code = document.getElementById('inp-room-code').value;
    const name = document.getElementById('player-name').value;
    joinRoom(code, name);
};

document.getElementById('btn-start-game').onclick = async () => {
    const roomRef = ref(database, 'rooms/' + myRoomId);
    const snap = await get(roomRef);
    const state = dealCards(snap.val());
    state.status = 'playing';
    await set(roomRef, state);
};

document.querySelectorAll('.btn-shortcut').forEach(btn => {
    btn.onclick = async () => {
        const roomRef = ref(database, 'rooms/' + myRoomId);
        const snap = await get(roomRef);
        const state = snap.val();
        const me = state.players[myPlayerIdx];
        const mult = btn.dataset.mult;
        const action = btn.dataset.action;

        if (action === 'allin') {
            await set(roomRef, handleAction(state, myPlayerIdx, 'allin'));
        } else if (mult) {
            const amount = Math.floor(state.pot * parseFloat(mult));
            document.getElementById('raise-slider').value = amount;
            document.getElementById('raise-val').value = amount;
            // Optionally just trigger the raise
            const toCall = state.currentBet - me.bet;
            const raiseAmt = amount - toCall;
            if (raiseAmt > 0) await set(roomRef, handleAction(state, myPlayerIdx, 'raise', raiseAmt));
        }
    };
});

document.querySelectorAll('.btn-action').forEach(btn => {
    btn.onclick = async () => {
        const action = btn.dataset.action || btn.className.split(' ').pop();
        const roomRef = ref(database, 'rooms/' + myRoomId);
        const snap = await get(roomRef);
        const newState = handleAction(snap.val(), myPlayerIdx, action);
        await set(roomRef, newState);
    };
});
