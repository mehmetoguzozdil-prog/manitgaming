// ============================================
// FIREBASE ES MODULE IMPORTS
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, remove, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
const TURN_TIME_LIMIT = 30000;

// ============================================
// MUSIC PLAYER LOGIC (Restored)
// ============================================
const PLAYLIST = [
    { name: "Neon Nights", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
    { name: "Felt & Smoke", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
    { name: "Midnight Bluff", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" }
];
let currentTrackIdx = 0;
const bgAudio = document.getElementById('bg-audio');
const trackNameEl = document.getElementById('track-name');

function initMusic() {
    updateTrack();
    document.getElementById('btn-play').onclick = () => {
        if (bgAudio.paused) { bgAudio.play(); document.getElementById('btn-play').textContent = "⏸"; }
        else { bgAudio.pause(); document.getElementById('btn-play').textContent = "▶"; }
    };
    document.getElementById('btn-next').onclick = () => { currentTrackIdx = (currentTrackIdx + 1) % PLAYLIST.length; updateTrack(); bgAudio.play(); };
    document.getElementById('btn-prev').onclick = () => { currentTrackIdx = (currentTrackIdx - 1 + PLAYLIST.length) % PLAYLIST.length; updateTrack(); bgAudio.play(); };
    document.getElementById('volume-slider').oninput = (e) => { bgAudio.volume = e.target.value; };
}

function updateTrack() {
    const track = PLAYLIST[currentTrackIdx];
    bgAudio.src = track.url;
    trackNameEl.textContent = track.name;
}

// ============================================
// CARD & HAND LOGIC
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
    const combos = getCombinations(allCards, 5);
    let best = null;
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
// CORE ENGINE
// ============================================

function createNewGame(playerCount) {
    const players = [];
    for (let i = 0; i < playerCount; i++) {
        players.push({
            id: i, name: `Player ${i + 1}`, chips: STARTING_CHIPS, cards: [], bet: 0, contributed: 0,
            folded: false, allIn: false, bankrupt: false, connected: false, avatar: '👤', status: ''
        });
    }
    return {
        status: 'waiting', maxPlayers: playerCount, connectedCount: 0,
        deck: [], community: [], pot: 0, pots: [], phase: 'waiting',
        dealer: 0, currentPlayer: -1, lastRaise: -1, currentBet: 0, minRaise: BIG_BLIND,
        actedThisRound: 0, turnEndTime: 0, winner: null, message: 'Welcome to the table!'
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
        p.cards = []; p.bet = 0; p.contributed = 0; p.status = '';
        p.folded = !(p.connected && !p.bankrupt && p.chips > 0);
        p.allIn = false;
        p.winningHand = null;
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

    applyBet(state, sbPtr, SMALL_BLIND, "SB");
    applyBet(state, bbPtr, BIG_BLIND, "BB");

    state.currentPlayer = (active.length === 2) ? sbPtr : findNextPlayer(state, bbPtr);
    state.lastRaise = bbPtr;
    return state;
}

function applyBet(state, idx, amount, status = "") {
    const p = state.players[idx];
    const actual = Math.min(p.chips, amount);
    p.chips -= actual;
    p.bet += actual;
    p.contributed += actual;
    p.allIn = p.chips === 0;
    state.pot += actual;
    if (status) p.status = status;
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
        player.status = "Fold";
    } else if (action === 'check') {
        if (toCall > 0) return state;
        player.status = "Check";
    } else if (action === 'call') {
        applyBet(state, playerIdx, toCall, "Call");
    } else if (action === 'raise') {
        const total = toCall + amount;
        if (total > player.chips) return state;
        applyBet(state, playerIdx, total, `Raise ${amount}`);
        state.currentBet = player.bet;
        state.lastRaise = playerIdx;
        state.actedThisRound = 0;
    } else if (action === 'allin') {
        applyBet(state, playerIdx, player.chips, "All-in");
        if (player.bet > state.currentBet) {
            state.currentBet = player.bet;
            state.lastRaise = playerIdx;
            state.actedThisRound = 0;
        }
    }

    state.actedThisRound++;
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
    state.players.forEach(p => { p.bet = 0; if (p.status !== "All-in" && !p.folded) p.status = ""; });
    state.currentBet = 0;
    state.actedThisRound = 0;

    if (state.phase === 'preflop') state.phase = 'flop';
    else if (state.phase === 'flop') state.phase = 'turn';
    else if (state.phase === 'turn') state.phase = 'river';
    else if (state.phase === 'river') return showdown(state);

    if (state.phase === 'flop') state.community.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
    else state.community.push(state.deck.pop());

    const canAct = state.players.filter(p => !p.folded && !p.bankrupt && !p.allIn);
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
        const eligible = contribs.filter(c => c.amt >= lvl && !c.f).map(c => c.id);
        const participants = contribs.filter(c => c.amt >= lvl).length;
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
        winners.forEach(w => {
            w.chips += share;
            w.winningHand = results[w.id].hand.cards;
        });
        const extra = pot.amount % winners.length;
        if (extra > 0) winners[0].chips += extra;
    });

    state.pot = 0;
    state.players.forEach(p => { if (p.chips <= 0 && p.connected) p.bankrupt = true; });
    const alive = state.players.filter(p => !p.bankrupt && p.connected);
    if (alive.length === 1) {
        state.isGameOver = true;
        state.message = `🏆 ${alive[0].name} is the CHAMPION!`;
    } else state.message = "Hand Finished.";
    state.phase = 'finished';

    // Record Stats (Restored)
    recordPlayerStats(state, results);

    return state;
}

async function recordPlayerStats(state, results) {
    try {
        for (const res of results) {
            if (!res) continue;
            const p = state.players[res.id];
            if (!p.name || p.name === "You") continue;
            const key = p.name.replace(/[.#$/\[\]]/g, "");
            const statsRef = ref(database, 'playerStats/' + key);
            const snap = await get(statsRef);
            let stats = snap.val() || { wins: 0, handsPlayed: 0, bestHandType: -1 };

            stats.handsPlayed++;
            if (p.winningHand) stats.wins++;
            if (res.hand.type > (stats.bestHandType || -1)) stats.bestHandType = res.hand.type;
            await set(statsRef, stats);
        }
    } catch (e) {
        console.error("Stats record failed:", e);
    }
}

// ============================================
// UI & EVENTS (Restored Features)
// ============================================
let myRoomId = null;
let myPlayerIdx = -1;

function render(state) {
    const lobby = document.getElementById('lobby');
    const game = document.getElementById('game');
    if (state.status === 'waiting') {
        lobby.classList.add('active'); game.classList.remove('active');
        document.getElementById('display-room-code').textContent = myRoomId || "---";
        document.getElementById('player-count-display').textContent = `${state.connectedCount}/${state.maxPlayers}`;
        document.getElementById('game-start-controls').style.display = 'block';
        document.getElementById('btn-start-game').style.display = (myPlayerIdx === 0) ? 'inline-block' : 'none';
        document.getElementById('host-waiting-msg').style.display = (myPlayerIdx !== 0) ? 'block' : 'none';
    } else {
        lobby.classList.remove('active'); game.classList.add('active');
        renderTable(state);
    }
}

function renderTable(state) {
    const me = state.players[myPlayerIdx];
    document.getElementById('pot-amount').textContent = state.pot;
    document.getElementById('display-room-code').textContent = myRoomId;
    document.getElementById('player-count-display').textContent = `${state.connectedCount}/${state.maxPlayers}`;

    // Timer & Hand Strength
    const strengthEl = document.getElementById('hand-strength');
    if (!me.folded && state.community.length >= 0 && state.status === 'playing') {
        const best = getBestHand([...me.cards, ...state.community]);
        strengthEl.textContent = `Current Hand: ${getHandName(best.type)}`;
    } else strengthEl.textContent = "";

    // Opponents
    const oppCont = document.getElementById('opponents-container');
    oppCont.innerHTML = '';
    state.players.forEach((p, i) => {
        if (i === myPlayerIdx) renderMe(p, state);
        else {
            const div = document.createElement('div');
            div.className = `player-area ${state.currentPlayer === i ? 'active-turn' : ''}`;
            const isWinner = p.winningHand;
            div.innerHTML = `
                ${state.currentPlayer === i ? `<div class="timer-circle">${Math.max(0, Math.ceil((state.turnEndTime - Date.now()) / 1000))}</div>` : ''}
                <div class="status-bubble">${p.status || ''}</div>
                <div class="cards">${p.cards.map(c => `
                    <div class="card ${state.phase === 'showdown' ? 'revealed' : ''} ${isWinner && isWinner.some(wc => wc.rank === c.rank && wc.suit === c.suit) ? 'winner-highlight' : ''}">
                        <div class="card-face card-back"></div>
                        <div class="card-face card-front ${c.suit}">${c.rank}</div>
                    </div>`).join('')}</div>
                <div class="player-info"><div class="avatar">${p.avatar}</div><div class="details"><span>${p.name}</span><span class="chips">$${p.chips}</span></div></div>
            `;
            oppCont.appendChild(div);
        }
    });

    // Board
    const board = document.getElementById('board');
    board.innerHTML = state.community.map(c => `<div class="card revealed"><div class="card-face card-back"></div><div class="card-face card-front ${c.suit}">${c.rank}</div></div>`).join('') + Array(5 - state.community.length).fill('<div class="card-slot"></div>').join('');

    // Controls
    document.getElementById('controls').style.display = (state.currentPlayer === myPlayerIdx) ? 'block' : 'none';
    const toCall = state.currentBet - me.bet;
    document.querySelector('.call').textContent = toCall > 0 ? `Call ${toCall}` : 'Check';
    document.getElementById('betting-shortcuts').style.display = (toCall > 0 || state.currentBet === 0) ? 'flex' : 'none';

    // Showdown Overlay
    if (state.phase === 'finished') {
        document.getElementById('game-overlay').style.display = 'flex';
        document.getElementById('overlay-msg').textContent = state.message;
    } else document.getElementById('game-overlay').style.display = 'none';

    if (state.isGameOver) {
        document.getElementById('tournament-over-overlay').style.display = 'flex';
        document.getElementById('tournament-champ-name').textContent = state.message;
    }
}

function renderMe(p, state) {
    const area = document.getElementById('player-area');
    area.className = `player-area me ${state.currentPlayer === myPlayerIdx ? 'active-turn' : ''}`;
    area.querySelector('.chips').textContent = `$${p.chips}`;
    area.querySelector('.name').textContent = p.name;
    document.getElementById('player-bet').textContent = p.bet > 0 ? `$${p.bet}` : '';
    document.getElementById('player-status').textContent = p.status || '';

    document.getElementById('player-cards').innerHTML = p.cards.map(c => {
        const highlight = p.winningHand && p.winningHand.some(wc => wc.rank === c.rank && wc.suit === c.suit) ? 'winner-highlight' : '';
        return `<div class="card revealed ${highlight}"><div class="card-face card-back"></div><div class="card-face card-front ${c.suit}">${c.rank}</div></div>`;
    }).join('');

    if (state.currentPlayer === myPlayerIdx) {
        let t = area.querySelector('.timer-circle');
        if (!t) { t = document.createElement('div'); t.className = 'timer-circle'; area.appendChild(t); }
        t.textContent = Math.max(0, Math.ceil((state.turnEndTime - Date.now()) / 1000));
    }
}

// ============================================
// DROPDOWN & PERSISTENCE (Restored)
// ============================================
function initDropdown() {
    const list = document.getElementById('custom-name-list');
    onValue(ref(database, 'playerNames/'), (snap) => {
        list.innerHTML = '';
        if (snap.exists()) {
            Object.values(snap.val()).forEach(name => {
                const div = document.createElement('div');
                div.textContent = name;
                div.onclick = () => { document.getElementById('player-name').value = name; list.style.display = 'none'; };
                list.appendChild(div);
            });
        }
    });
    document.getElementById('btn-toggle-names').onclick = () => list.style.display = list.style.display === 'none' ? 'block' : 'none';
}

async function saveNameLocally(name) {
    const key = name.replace(/[.#$/\[\]]/g, "");
    if (key) await set(ref(database, 'playerNames/' + key), name);
}

// ============================================
// MAIN EVENT LOOPS
// ============================================
document.getElementById('btn-create').onclick = async () => {
    const name = document.getElementById('player-name').value || "Host";
    const count = parseInt(document.getElementById('player-count').value);
    const id = Math.random().toString(36).substring(2, 7).toUpperCase();
    const state = createNewGame(count);
    state.players[0].connected = true; state.players[0].name = name;
    state.connectedCount = 1; myRoomId = id; myPlayerIdx = 0;
    if (document.getElementById('save-name-default').checked) saveNameLocally(name);
    await set(ref(database, 'rooms/' + id), state);
    onValue(ref(database, 'rooms/' + id), (s) => { if (s.exists()) render(s.val()); });
};

document.getElementById('btn-join').onclick = async () => {
    const id = document.getElementById('inp-room-code').value.toUpperCase();
    const name = document.getElementById('player-name').value || "Player";
    const roomRef = ref(database, 'rooms/' + id);
    const snap = await get(roomRef);
    if (!snap.exists()) return alert("Room not found");
    const state = snap.val();
    const idx = state.players.findIndex(p => !p.connected);
    if (idx === -1) return alert("Room full");
    state.players[idx].connected = true; state.players[idx].name = name;
    state.connectedCount++; myRoomId = id; myPlayerIdx = idx;
    if (document.getElementById('save-name-default').checked) saveNameLocally(name);
    await set(roomRef, state);
    onValue(roomRef, (s) => { if (s.exists()) render(s.val()); });
};

document.getElementById('btn-start-game').onclick = async () => {
    const roomRef = ref(database, 'rooms/' + myRoomId);
    const state = (await get(roomRef)).val();
    state.status = 'playing';
    await set(roomRef, dealCards(state));
};

document.querySelectorAll('.btn-action').forEach(btn => {
    btn.onclick = async () => {
        const action = btn.dataset.action;
        const snap = await get(ref(database, 'rooms/' + myRoomId));
        const state = snap.val();
        if (action === 'raise') {
            document.getElementById('raise-slider-container').style.display = 'flex';
            const me = state.players[myPlayerIdx];
            const toCall = state.currentBet - me.bet;
            document.getElementById('raise-slider').max = me.chips - toCall;
            document.getElementById('raise-slider').value = state.minRaise;
            document.getElementById('raise-val').value = state.minRaise;
            return;
        }
        await set(ref(database, 'rooms/' + myRoomId), handleAction(state, myPlayerIdx, action));
    };
});

// Local Timer Tick (Restored)
setInterval(() => {
    const timerCircle = document.querySelector('.player-area.active-turn .timer-circle');
    if (timerCircle) {
        const current = parseInt(timerCircle.textContent);
        if (current > 0) timerCircle.textContent = current - 1;
    }
}, 1000);

document.getElementById('btn-confirm-raise').onclick = async () => {
    const amt = parseInt(document.getElementById('raise-val').value);
    const state = (await get(ref(database, 'rooms/' + myRoomId))).val();
    document.getElementById('raise-slider-container').style.display = 'none';
    await set(ref(database, 'rooms/' + myRoomId), handleAction(state, myPlayerIdx, 'raise', amt));
};

document.getElementById('btn-reset-game').onclick = async () => {
    const id = myRoomId;
    const snap = await get(ref(database, 'rooms/' + id));
    const state = createNewGame(snap.val().maxPlayers);
    // Keep connected players but reset chips? Or just full reset?
    // Usually a tournament reset means new chips for all.
    state.status = 'waiting';
    await set(ref(database, 'rooms/' + id), state);
    location.reload(); // Simplest way to reset lobby state
};

document.getElementById('btn-back-lobby').onclick = () => location.reload();

document.getElementById('btn-next-hand').onclick = async () => {
    const roomRef = ref(database, 'rooms/' + myRoomId);
    const state = (await get(roomRef)).val();
    state.dealer = (state.dealer + 1) % state.players.length;
    await set(roomRef, dealCards(state));
};

// Shortcuts
document.querySelectorAll('.btn-shortcut').forEach(btn => {
    btn.onclick = async () => {
        const state = (await get(ref(database, 'rooms/' + myRoomId))).val();
        const mult = btn.dataset.mult;
        if (btn.dataset.action === 'allin') await set(ref(database, 'rooms/' + myRoomId), handleAction(state, myPlayerIdx, 'allin'));
        else {
            const amt = Math.floor(state.pot * parseFloat(mult));
            await set(ref(database, 'rooms/' + myRoomId), handleAction(state, myPlayerIdx, 'raise', amt));
        }
    };
});

// Modals
document.getElementById('btn-open-guide').onclick = () => document.getElementById('modal-guide').style.display = 'flex';
document.getElementById('btn-show-stats').onclick = async () => {
    const name = document.getElementById('player-name').value;
    if (!name) return alert("Enter a name to view stats");
    const key = name.replace(/[.#$/\[\]]/g, "");
    const snap = await get(ref(database, 'playerStats/' + key));
    const stats = snap.val() || { wins: 0, handsPlayed: 0, bestHandType: -1 };

    document.getElementById('modal-stats').style.display = 'flex';
    document.getElementById('stats-name').textContent = name;
    document.getElementById('stats-played').textContent = stats.handsPlayed;
    document.getElementById('stats-wins').textContent = stats.wins;
    document.getElementById('stats-rate').textContent = stats.handsPlayed > 0 ? Math.round((stats.wins / stats.handsPlayed) * 100) + "%" : "0%";
    document.getElementById('stats-best').textContent = getHandName(stats.bestHandType);
};
document.querySelectorAll('.btn-close-modal').forEach(b => b.onclick = () => b.closest('.modal-overlay').style.display = 'none');

initMusic();
initDropdown();
