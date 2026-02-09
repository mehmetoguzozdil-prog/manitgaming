// ============================================
// FIREBASE ES MODULE IMPORTS
// ============================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// UI References (Adjusted for restoration)
const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const btnShowStats = document.getElementById('btn-show-stats');
const btnToggleNames = document.getElementById('btn-toggle-names');
const nameList = document.getElementById('custom-name-list');
const playerNameInput = document.getElementById('player-name');
const lobbyMsg = document.getElementById('lobby-msg');

let myRoomId = sessionStorage.getItem('poker_room_id') || null;
let myPlayerIdx = parseInt(sessionStorage.getItem('poker_player_idx'));
if (isNaN(myPlayerIdx)) myPlayerIdx = -1;
let localState = null;

// ============================================
// MUSIC PLAYER (Restored as requested)
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
    if (!bgAudio) return;
    updateTrack();
    document.getElementById('btn-play').onclick = () => {
        if (bgAudio.paused) { bgAudio.play().catch(e => console.log(e)); document.getElementById('btn-play').textContent = "⏸"; }
        else { bgAudio.pause(); document.getElementById('btn-play').textContent = "▶"; }
    };
    document.getElementById('btn-next').onclick = () => { currentTrackIdx = (currentTrackIdx + 1) % PLAYLIST.length; updateTrack(); bgAudio.play(); };
    document.getElementById('btn-prev').onclick = () => { currentTrackIdx = (currentTrackIdx - 1 + PLAYLIST.length) % PLAYLIST.length; updateTrack(); bgAudio.play(); };
}

function updateTrack() {
    const track = PLAYLIST[currentTrackIdx];
    bgAudio.src = track.url; trackNameEl.textContent = track.name;
    bgAudio.load();
}

// ============================================
// HAND EVALUATION (User Version - Optimized)
// ============================================
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function getCardValue(rank) {
    const vals = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    return vals[rank];
}

function evaluateHand(cards) {
    if (cards.length < 1) return { type: 0, subValues: [0] };
    const sorted = [...cards].sort((a, b) => getCardValue(b.rank) - getCardValue(a.rank));
    const values = sorted.map(c => getCardValue(c.rank));
    const suits = sorted.map(c => c.suit);
    const isFlush = suits.length >= 5 && new Set(suits).size === 1;
    const uniqueVals = [...new Set(values)];

    let isStraight = false;
    let straightHigh = -1;
    if (uniqueVals.length >= 5) {
        for (let i = 0; i <= uniqueVals.length - 5; i++) {
            const win = uniqueVals.slice(i, i + 5);
            if (win[0] - win[4] === 4) { isStraight = true; straightHigh = win[0]; break; }
        }
        if (!isStraight && uniqueVals.includes(14) && uniqueVals.includes(5) && uniqueVals.includes(4) && uniqueVals.includes(3) && uniqueVals.includes(2)) {
            isStraight = true; straightHigh = 5;
        }
    }

    const counts = {}; values.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const pairs = Object.entries(counts).filter(e => e[1] === 2).map(e => parseInt(e[0])).sort((a, b) => b - a);
    const trips = Object.entries(counts).filter(e => e[1] === 3).map(e => parseInt(e[0])).sort((a, b) => b - a);
    const quads = Object.entries(counts).filter(e => e[1] === 4).map(e => parseInt(e[0])).sort((a, b) => b - a);
    const singles = Object.entries(counts).filter(e => e[1] === 1).map(e => parseInt(e[0])).sort((a, b) => b - a);

    if (isFlush && isStraight) return { type: 8, subValues: [straightHigh] };
    if (quads.length > 0) return { type: 7, subValues: [quads[0], singles[0] || 0] };
    if (trips.length > 0 && pairs.length > 0) return { type: 6, subValues: [trips[0], pairs[0]] };
    if (isFlush) return { type: 5, subValues: values.slice(0, 5) };
    if (isStraight) return { type: 4, subValues: [straightHigh] };
    if (trips.length > 0) return { type: 3, subValues: [trips[0], ...singles.slice(0, 2)] };
    if (pairs.length >= 2) return { type: 2, subValues: [pairs[0], pairs[1], singles[0] || 0] };
    if (pairs.length === 1) return { type: 1, subValues: [pairs[0], ...singles.slice(0, 3)] };
    return { type: 0, subValues: values.slice(0, 5) };
}

function compareHands(h1, h2) {
    if (h1.type !== h2.type) return h1.type - h2.type;
    for (let i = 0; i < 5; i++) {
        const v1 = h1.subValues[i] || 0;
        const v2 = h2.subValues[i] || 0;
        if (v1 !== v2) return v1 - v2;
    }
    return 0;
}

function getBestHand(allCards) {
    if (allCards.length < 5) return evaluateHand(allCards);
    const combos = getCombinations(allCards, 5);
    let best = null;
    combos.forEach(combo => {
        const h = evaluateHand(combo);
        if (!best || compareHands(h, best) > 0) best = { ...h, cards: combo };
    });
    return best;
}

function getCombinations(arr, k) {
    if (k === 1) return arr.map(x => [x]);
    const res = [];
    for (let i = 0; i <= arr.length - k; i++) {
        const rest = getCombinations(arr.slice(i + 1), k - 1);
        for (const r of rest) res.push([arr[i], ...r]);
    }
    return res;
}

// ============================================
// CORE ENGINE (User Version)
// ============================================
function findNextPlayer(state, fromIdx, skipAllIn = true) {
    let idx = (fromIdx + 1) % state.players.length;
    for (let i = 0; i < state.players.length; i++) {
        const p = state.players[idx];
        const isAllIn = skipAllIn ? p.allIn : false;
        if (p.connected && !p.folded && !p.bankrupt && !isAllIn) return idx;
        idx = (idx + 1) % state.players.length;
    }
    return -1;
}

function dealCards(state) {
    const deck = [];
    SUITS.forEach(s => RANKS.forEach(r => deck.push({ suit: s, rank: r })));
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));[deck[i], deck[j]] = [deck[j], deck[i]];
    }
    state.players.forEach(p => {
        p.cards = p.bankrupt ? [] : [deck.pop(), deck.pop()];
        p.folded = p.bankrupt; p.bet = 0; p.contributed = 0; p.allIn = false; p.status = ""; p.actedThisRound = false;
    });
    state.community = []; state.deck = deck; state.pot = 0; state.currentBet = BIG_BLIND; state.phase = 'preflop'; state.status = 'playing';

    let sbIdx, bbIdx;
    const active = state.players.filter(p => !p.bankrupt);
    if (active.length === 2) { sbIdx = state.dealer; bbIdx = findNextPlayer(state, sbIdx, false); }
    else { sbIdx = findNextPlayer(state, state.dealer, false); bbIdx = findNextPlayer(state, sbIdx, false); }

    applyBet(state, sbIdx, SMALL_BLIND, "SB");
    applyBet(state, bbIdx, BIG_BLIND, "BB");
    state.currentPlayer = findNextPlayer(state, bbIdx, true);
    state.lastRaise = bbIdx;
    state.turnEndTime = Date.now() + TURN_TIME_LIMIT;
    return state;
}

function applyBet(state, idx, amt, status) {
    const p = state.players[idx];
    const actual = Math.min(amt, p.chips);
    p.chips -= actual; p.bet += actual; p.contributed += actual; state.pot += actual;
    if (p.chips === 0 && actual > 0) p.allIn = true;
    if (status) p.status = status;
}

function handleAction(state, playerIdx, action, amount = 0) {
    if (state.currentPlayer !== playerIdx) return state;
    const player = state.players[playerIdx];
    const toCall = state.currentBet - player.bet;

    if (action === 'fold') { player.folded = true; player.status = "Fold"; }
    else if (action === 'call') { applyBet(state, playerIdx, toCall, "Call"); }
    else if (action === 'check') { if (toCall > 0) return state; player.status = "Check"; }
    else if (action === 'raise') {
        const total = toCall + amount;
        applyBet(state, playerIdx, total, `Raise ${amount}`);
        state.currentBet = player.bet; state.lastRaise = playerIdx;
        state.players.forEach((p, i) => { if (i !== playerIdx) p.actedThisRound = false; });
    } else if (action === 'allin') {
        applyBet(state, playerIdx, player.chips, "All-in");
        if (player.bet > state.currentBet) { state.currentBet = player.bet; state.lastRaise = playerIdx; state.players.forEach((p, i) => { if (i !== playerIdx) p.actedThisRound = false; }); }
    }

    player.actedThisRound = true;
    nextTurn(state);
    return state;
}

function nextTurn(state) {
    const next = findNextPlayer(state, state.currentPlayer);
    const active = state.players.filter(p => !p.folded && !p.bankrupt && !p.allIn);
    if (next === -1 || next === state.lastRaise || active.length <= 1) advancePhase(state);
    else { state.currentPlayer = next; state.turnEndTime = Date.now() + TURN_TIME_LIMIT; }
}

function advancePhase(state) {
    state.players.forEach(p => { p.bet = 0; p.actedThisRound = false; if (p.status !== "All-in" && !p.folded) p.status = ""; });
    state.currentBet = 0;
    if (state.phase === 'preflop') { state.community.push(state.deck.pop(), state.deck.pop(), state.deck.pop()); state.phase = 'flop'; }
    else if (state.phase === 'flop') { state.community.push(state.deck.pop()); state.phase = 'turn'; }
    else if (state.phase === 'turn') { state.community.push(state.deck.pop()); state.phase = 'river'; }
    else { showdown(state); return; }

    state.currentPlayer = findNextPlayer(state, state.dealer);
    state.lastRaise = state.currentPlayer;
    state.turnEndTime = Date.now() + TURN_TIME_LIMIT;
    if (state.currentPlayer === -1) showdown(state);
}

function showdown(state) {
    state.phase = 'showdown';
    const active = state.players.filter(p => !p.folded && !p.bankrupt);
    let best = null, winners = [];
    active.forEach(p => {
        const hand = getBestHand([...p.cards, ...state.community]);
        p.bestHand = hand;
        if (!best || compareHands(hand, best) > 0) { best = hand; winners = [p]; }
        else if (compareHands(hand, best) === 0) winners.push(p);
    });

    const share = Math.floor(state.pot / winners.length);
    winners.forEach(w => { w.chips += share; w.status = `Winner! (${getHandName(w.bestHand.type)})`; w.winningHand = w.bestHand.cards; });
    state.pot = 0; state.status = 'over';
    recordStats(state, active);
}

async function recordStats(state, active) {
    for (const p of active) {
        if (!p.name || p.name === "Waiting..." || p.name === "Host") continue;
        const key = p.name.replace(/[.#$/\[\]]/g, "");
        const snap = await get(ref(database, 'playerStats/' + key));
        let s = snap.val() || { wins: 0, handsPlayed: 0, bestHandType: -1 };
        s.handsPlayed++; if (p.status.includes("Winner")) s.wins++;
        if (p.bestHand && p.bestHand.type > s.bestHandType) s.bestHandType = p.bestHand.type;
        set(ref(database, 'playerStats/' + key), s);
    }
}

// ============================================
// LOBBY & DATA SYNC (User Version)
// ============================================
function render(state) {
    if (!state) return;
    if (state.status === 'waiting') {
        lobby.classList.add('active'); game.classList.remove('active');
        document.getElementById('display-room-code').textContent = myRoomId;
        document.getElementById('player-count-display').textContent = `${state.connectedCount}/${state.maxPlayers}`;
        document.getElementById('game-start-controls').style.display = 'block';
        document.getElementById('btn-start-game').style.display = (myPlayerIdx === 0) ? 'block' : 'none';

        const opps = document.getElementById('opponents-container');
        opps.innerHTML = state.players.filter(p => p.connected).map(p => `<div class="player-bubble">👤 ${p.name}</div>`).join('');
    } else {
        lobby.classList.remove('active'); game.classList.add('active');
        renderTable(state);
    }
}

function renderTable(state) {
    const me = state.players[myPlayerIdx];
    if (!me) return;
    document.getElementById('pot-amount').textContent = state.pot;

    // Cards
    document.getElementById('my-cards').innerHTML = me.cards.map(c => `
        <div class="card revealed ${me.winningHand && me.winningHand.some(wc => wc.rank === c.rank && wc.suit === c.suit) ? 'winner-highlight' : ''}">
            <div class="card-face card-back"></div><div class="card-face card-front ${c.suit}">${c.rank}</div>
        </div>`).join('');

    document.getElementById('community-cards').innerHTML = state.community.map(c => `
        <div class="card revealed"><div class="card-face card-back"></div><div class="card-face card-front ${c.suit}">${c.rank}</div></div>
    `).join('') + Array(5 - state.community.length).fill('<div class="card-slot"></div>').join('');

    const strengthEl = document.getElementById('hand-strength');
    if (!me.folded && state.status === 'playing') {
        const best = getBestHand([...me.cards, ...state.community]);
        strengthEl.textContent = `Strength: ${getHandName(best.type)}`;
    } else strengthEl.textContent = "";

    // Opponents logic... (Simplified for this version)
    const opps = document.getElementById('opponents-container');
    opps.innerHTML = '';
    state.players.forEach((p, i) => {
        if (i !== myPlayerIdx) {
            const div = document.createElement('div');
            div.className = `player-area ${state.currentPlayer === i ? 'active-turn' : ''}`;
            const isWinner = p.status.includes("Winner");
            div.innerHTML = `
                ${state.currentPlayer === i ? `<div class="timer-circle">${Math.max(0, Math.ceil((state.turnEndTime - Date.now()) / 1000))}</div>` : ''}
                <div class="status-bubble">${p.status || ''}</div>
                <div class="cards">${p.cards.map(c => `<div class="card ${state.phase === 'showdown' ? 'revealed' : ''} ${isWinner && p.winningHand && p.winningHand.some(wc => wc.rank === c.rank && wc.suit === c.suit) ? 'winner-highlight' : ''}"><div class="card-face card-back"></div><div class="card-face card-front ${c.suit}">${c.rank}</div></div>`).join('')}</div>
                <div class="player-info"><div class="avatar">👤</div><div class="details"><span>${p.name}</span><span class="chips">$${p.chips}</span></div></div>
            `;
            opps.appendChild(div);
        }
    });

    document.getElementById('controls').style.display = (state.currentPlayer === myPlayerIdx && state.status === 'playing') ? 'block' : 'none';
    const overlay = document.getElementById('game-overlay');
    if (state.status === 'over') {
        overlay.style.display = 'flex';
        document.getElementById('overlay-msg').textContent = "Hand Over!";
    } else overlay.style.display = 'none';
}

// Event Listeners
btnCreate.onclick = async () => {
    const name = playerNameInput.value.trim() || "Host";
    const count = parseInt(document.getElementById('player-count').value);
    const id = Math.random().toString(36).substring(2, 7).toUpperCase();
    const state = createNewGame(count);
    state.players[0].name = name; state.players[0].connected = true; state.connectedCount = 1;
    myRoomId = id; myPlayerIdx = 0;
    sessionStorage.setItem('poker_room_id', id); sessionStorage.setItem('poker_player_idx', 0);
    localStorage.setItem('poker_player_name', name);
    await set(ref(database, 'rooms/' + id), state);
};

btnJoin.onclick = async () => {
    const code = document.getElementById('inp-room-code').value.toUpperCase();
    const name = playerNameInput.value.trim() || "Guest";
    const roomRef = ref(database, 'rooms/' + code);
    const snap = await get(roomRef);
    if (!snap.exists()) return alert("Not found");
    const state = snap.val();
    const idx = state.players.findIndex(p => !p.connected);
    if (idx === -1) return alert("Full");
    state.players[idx].name = name; state.players[idx].connected = true; state.connectedCount++;
    myRoomId = code; myPlayerIdx = idx;
    sessionStorage.setItem('poker_room_id', code); sessionStorage.setItem('poker_player_idx', idx);
    localStorage.setItem('poker_player_name', name);
    await set(roomRef, state);
};

document.getElementById('btn-start-game').onclick = async () => {
    const roomRef = ref(database, 'rooms/' + myRoomId);
    const state = (await get(roomRef)).val();
    set(roomRef, dealCards(state));
};

document.querySelectorAll('.btn-action').forEach(btn => {
    btn.onclick = async () => {
        const action = btn.dataset.action;
        const state = (await get(ref(database, 'rooms/' + myRoomId))).val();
        if (action === 'raise') {
            const amt = prompt("How much to raise by?");
            if (amt) set(ref(database, 'rooms/' + myRoomId), handleAction(state, myPlayerIdx, 'raise', parseInt(amt)));
            return;
        }
        set(ref(database, 'rooms/' + myRoomId), handleAction(state, myPlayerIdx, action));
    };
});

document.getElementById('btn-next-hand').onclick = async () => {
    const roomRef = ref(database, 'rooms/' + myRoomId);
    const state = (await get(roomRef)).val();
    state.dealer = (state.dealer + 1) % state.players.length;
    set(roomRef, dealCards(state));
};

btnShowStats.onclick = async () => {
    const name = playerNameInput.value.trim();
    const key = name.replace(/[.#$/\[\]]/g, "");
    const snap = await get(ref(database, 'playerStats/' + key));
    const s = snap.val() || { wins: 0, handsPlayed: 0 };
    document.getElementById('stats-name').textContent = name;
    document.getElementById('stats-played').textContent = s.handsPlayed;
    document.getElementById('stats-wins').textContent = s.wins;
    document.getElementById('modal-stats').style.display = 'flex';
};

// Auto-Sync
if (myRoomId) onValue(ref(database, 'rooms/' + myRoomId), (s) => { localState = s.val(); render(localState); });
playerNameInput.value = localStorage.getItem('poker_player_name') || "";
initMusic();
