
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getDatabase, ref, set, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";
import { firebaseConfig } from './firebase-config.js';
import { GameEngine } from './game-engine.js';

let app;
let db;

export function initNetwork() {
    app = initializeApp(firebaseConfig);
    db = getDatabase(app);
}

export async function createRoom() {
    const roomId = generateRoomId();
    const engine = new GameEngine();
    // Ensure we have a fresh start
    // Note: GameEngine constructor creates a default state.

    await set(ref(db, 'rooms/' + roomId), engine.state);
    return roomId;
}

export function subscribeToRoom(roomId, callback) {
    const roomRef = ref(db, 'rooms/' + roomId);
    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
        callback(data);
    });
}

export async function sendAction(roomId, playerIndex, action, amount) {
    const roomRef = ref(db, 'rooms/' + roomId);

    try {
        await runTransaction(roomRef, (currentState) => {
            if (!currentState) return; // Room doesn't exist?

            const engine = new GameEngine(currentState);
            const success = engine.handleAction(playerIndex, action, amount);

            if (success) {
                return engine.state;
            } else {
                // Abort transaction if action invalid
                return;
            }
        });
        return true;
    } catch (e) {
        console.error("Transaction failed: ", e);
        return false;
    }
}

export async function startGame(roomId) {
    const roomRef = ref(db, 'rooms/' + roomId);
    await runTransaction(roomRef, (currentState) => {
        if (!currentState) return;
        const engine = new GameEngine(currentState);
        engine.startHand();
        engine.state.status = 'playing';
        return engine.state;
    });
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
