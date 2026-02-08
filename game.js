
import { initNetwork, createRoom, subscribeToRoom, sendAction, startGame } from './network.js';
import { SUITS, RANKS } from './poker-logic.js';

// State
let myRoomId = null;
let myPlayerIndex = null; // 0 or 1
let gameState = null;

// DOM Elements
const screenLobby = document.getElementById('lobby');
const screenGame = document.getElementById('game');
const inpRoomCode = document.getElementById('inp-room-code');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const lobbyMsg = document.getElementById('lobby-msg');
const displayRoomCode = document.getElementById('display-room-code');

// Game Elements
const playerArea = document.getElementById('player-area');
const opponentArea = document.getElementById('opponent-area');
const boardEl = document.getElementById('board');
const potEl = document.getElementById('pot-amount');

// Init
initNetwork();

// Lobby Events
btnCreate.addEventListener('click', async () => {
    btnCreate.disabled = true;
    lobbyMsg.textContent = "Creating room...";
    try {
        const roomId = await createRoom();
        enterGame(roomId, 0); // Creator is P1 (index 0)
    } catch (e) {
        console.error(e);
        lobbyMsg.textContent = "Error creating room.";
        btnCreate.disabled = false;
    }
});

btnJoin.addEventListener('click', () => {
    const code = inpRoomCode.value.trim().toUpperCase();
    if (code.length < 4) return;
    enterGame(code, 1); // Joiner is P2 (index 1)
});

function enterGame(roomId, playerIndex) {
    myRoomId = roomId;
    myPlayerIndex = playerIndex;

    screenLobby.classList.remove('active');
    screenGame.classList.add('active');
    displayRoomCode.textContent = roomId;

    subscribeToRoom(roomId, (state) => {
        if (!state) return;
        gameState = state;
        renderGame(state);
    });
}

// Render Logic
function renderGame(state) {
    // 1. Check for game start
    if (state.status === 'waiting') {
        // If I am P1 and I see P2 connected? 
        // Actually, logic is: 'waiting' means P2 hasn't joined or we haven't started.
        // How do we know P2 joined? 
        // Currently 'joinRoom' just listens. It doesn't update state to say "I'm here".
        // Fix: Joiner should update state to say "Ready"?
        // Or simpler: Both players just see 'waiting'.
        // If I am P1, I can see if a 'start' button is needed?
        // Let's AUTO-START for simplicity when P2 joins?

        // Actually, my current network logic doesn't explicitly mark player 2 as "present".
        // Let's add a "join" action in network/game-engine?
        // Or just assume if you have the code, you are P2.
        // But the State needs to flip to 'playing'.

        // Workaround: When P2 enters, they call a "Join" action.
        if (myPlayerIndex === 1 && state.status === 'waiting') {
            // Attempt to start the game
            startGame(myRoomId);
        }

        if (state.status === 'waiting') {
            potEl.textContent = "Waiting for opponent...";
            return;
        }
    }

    // 2. Render Pot
    potEl.textContent = state.pot;

    // 3. Render Players
    const me = state.players[myPlayerIndex];
    const oppIndex = (myPlayerIndex + 1) % 2;
    const opponent = state.players[oppIndex];

    renderPlayer(me, 'player');
    renderPlayer(opponent, 'opponent');

    // 4. Render Board
    renderBoard(state.communityCards);

    // 5. Controls
    updateControls(state, me);

    // 6. Overlay / Game Over
    const overlay = document.getElementById('game-overlay');
    if (state.phase === 'game-over') {
        overlay.style.display = 'flex';
        const title = document.getElementById('overlay-msg');
        const btnNext = document.getElementById('btn-next-hand');

        if (state.winner === 'split') {
            title.textContent = "Split Pot!";
        } else if (state.winner === me.id) {
            title.textContent = "You Win!";
        } else {
            title.textContent = "Opponent Wins!";
        }

        // Only ready to click next
        btnNext.onclick = () => {
            // Send 'StartHand' action?
            // Re-use startGame or new action?
            // Let's use startGame which calls startHand on engine.
            startGame(myRoomId);
            overlay.style.display = 'none';
        };
    } else {
        overlay.style.display = 'none';
    }
}

function renderPlayer(playerData, type) {
    const root = document.getElementById(`${type}-area`);
    const nameEl = root.querySelector('.name');
    const chipsEl = root.querySelector('.chips');
    const cardsEl = root.querySelector('.cards');
    const betEl = document.getElementById(`${type}-bet`);
    const statusEl = document.getElementById(`${type}-status`);

    // Info
    chipsEl.textContent = `$${playerData.chips}`;
    if (playerData.isAllIn) chipsEl.textContent += " (All-In)";

    // Status bubble (Dealer, Turn)
    statusEl.classList.remove('show');
    let statusText = "";
    if (gameState.dealerIndex === (type === 'player' ? myPlayerIndex : (myPlayerIndex + 1) % 2)) {
        statusText += "D ";
    }
    if (gameState.turnIndex === (type === 'player' ? myPlayerIndex : (myPlayerIndex + 1) % 2) && gameState.phase !== 'showdown' && gameState.phase !== 'game-over') {
        statusEl.classList.add('show');
        statusText += "TURN";
    }
    statusEl.textContent = statusText;

    // Bet Bubble
    if (playerData.currentBet > 0) {
        betEl.style.display = 'block';
        betEl.textContent = playerData.currentBet;
    } else {
        betEl.style.display = 'none';
    }

    // Cards
    cardsEl.innerHTML = '';

    // Logic for showing cards
    // Show MY cards always.
    // Show OPPONENT cards ONLY if showdown/game-over AND not folded.

    const showFaceUp = (type === 'player') ||
        (gameState.phase === 'showdown' && !playerData.folded) ||
        (gameState.phase === 'game-over' && !playerData.folded);

    playerData.hand.forEach(card => {
        if (showFaceUp) {
            cardsEl.appendChild(createCardEl(card));
        } else {
            const back = document.createElement('div');
            back.className = 'card back';
            cardsEl.appendChild(back);
        }
    });
}

function renderBoard(cards) {
    boardEl.innerHTML = '';
    // Always 5 slots
    for (let i = 0; i < 5; i++) {
        if (cards[i]) {
            boardEl.appendChild(createCardEl(cards[i]));
        } else {
            const slot = document.createElement('div');
            slot.className = 'card-slot';
            boardEl.appendChild(slot);
        }
    }
}

function createCardEl(card) {
    const el = document.createElement('div');
    el.className = `card ${card.suit}`;
    // Display: Rank + Suit entity
    const suitSymbol = {
        'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠'
    }[card.suit];

    el.textContent = `${card.rank}${suitSymbol}`;
    return el;
}

// Action Handlers
document.querySelectorAll('.btn-action').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        handleUserAction(action);
    });
});

const sliderContainer = document.getElementById('raise-slider-container');
const slider = document.getElementById('raise-slider');
const raiseVal = document.getElementById('raise-val');
const btnConfirmRaise = document.getElementById('btn-confirm-raise');

// Toggle slider logic
function handleUserAction(action) {
    if (action === 'raise') {
        if (sliderContainer.style.display === 'flex') {
            sliderContainer.style.display = 'none'; // Toggle off
        } else {
            // Setup slider
            // Min: Current high bet + minBet (or double bet)
            // Max: My Chips + My Current Bet
            const me = gameState.players[myPlayerIndex];
            const opp = gameState.players[(myPlayerIndex + 1) % 2];
            const highBet = Math.max(me.currentBet, opp.currentBet);
            const minRaise = highBet + gameState.minBet;

            // Slider value should be "Total Bet"
            const maxBet = me.chips + me.currentBet;

            if (maxBet < minRaise) {
                // Can only go all in?
                // logic handled by game engine but UI should guide
            }

            slider.min = highBet + gameState.minBet; // Simplified
            if (slider.min > maxBet) slider.min = maxBet; // All in constraint
            slider.max = maxBet;
            slider.value = slider.min;
            raiseVal.textContent = slider.value;

            sliderContainer.style.display = 'flex';
        }
        return;
    }

    // Determine amount for call/check
    let amount = 0;
    // For 'call', game engine calculates amount based on '0' or we pass the target match
    // My engine logic for 'call' ignores amount and just matches.
    // For 'check', amount is 0.

    submitAction(action, 0);
}

slider.addEventListener('input', () => {
    raiseVal.textContent = slider.value;
});

btnConfirmRaise.addEventListener('click', () => {
    const val = parseInt(slider.value);
    submitAction('raise', val);
    sliderContainer.style.display = 'none';
});

async function submitAction(action, amount) {
    // Disable controls immediately?
    // Wait for network
    await sendAction(myRoomId, myPlayerIndex, action, amount);
}

function updateControls(state, me) {
    const isMyTurn = state.turnIndex === myPlayerIndex && state.phase !== 'showdown' && state.phase !== 'game-over';
    const buttons = document.querySelectorAll('.btn-action');

    buttons.forEach(b => b.disabled = !isMyTurn);

    // Logic to disable 'check' if there is a bet, etc.
    if (isMyTurn) {
        const opp = state.players[(myPlayerIndex + 1) % 2];
        const highBet = Math.max(me.currentBet, opp.currentBet);
        const toCall = highBet - me.currentBet;

        const btnCheck = document.querySelector('.btn-action.check');
        const btnCall = document.querySelector('.btn-action.call');

        if (toCall > 0) {
            btnCheck.disabled = true;
            btnCall.textContent = `Call ${toCall}`;
        } else {
            btnCall.disabled = true; // Can't call 0, that's check
            btnCheck.disabled = false;
            btnCall.textContent = "Call";
        }
    }
}
