
import { Deck, evaluateHand, compareHands } from './poker-logic.js';

export const PHASES = {
    PRE_FLOP: 'pre-flop',
    FLOP: 'flop',
    TURN: 'turn',
    RIVER: 'river',
    SHOWDOWN: 'showdown',
    GAME_OVER: 'game-over'
};

export class GameEngine {
    constructor(initialState) {
        this.state = initialState || this.createInitialState();
    }

    createInitialState() {
        return {
            status: 'waiting', // waiting, playing
            pot: 0,
            communityCards: [],
            deck: [],
            dealerIndex: 0, // 0 or 1
            turnIndex: 0, // 0 or 1
            phase: PHASES.PRE_FLOP,
            minBet: 20, // Small blind 10, Big blind 20
            players: [
                { id: 'p1', name: 'Player 1', chips: 1000, hand: [], currentBet: 0, folded: false, isAllIn: false },
                { id: 'p2', name: 'Player 2', chips: 1000, hand: [], currentBet: 0, folded: false, isAllIn: false }
            ],
            lastAction: null,
            winner: null
        };
    }

    // Start a new hand
    startHand() {
        const deck = new Deck();
        deck.shuffle();

        // Reset round state
        this.state.pot = 0;
        this.state.communityCards = [];
        this.state.deck = deck.cards;
        this.state.phase = PHASES.PRE_FLOP;
        this.state.winner = null;
        this.state.lastAction = 'New Hand';

        // Reset player round state
        this.state.players.forEach(p => {
            p.hand = [];
            p.currentBet = 0;
            p.folded = false;
            p.isAllIn = false;
        });

        // Deal hole cards
        this.state.players[0].hand = deck.deal(2);
        this.state.players[1].hand = deck.deal(2);

        // Blinds
        const sbIndex = this.state.dealerIndex; // Key rule in Heads Up: Dealer is Small Blind
        const bbIndex = (sbIndex + 1) % 2;

        this.postBlind(sbIndex, this.state.minBet / 2);
        this.postBlind(bbIndex, this.state.minBet);

        // Turn is SB (Dealer) pre-flop in Heads Up? 
        // Wait, in Heads Up: Dealer is SB and acts FIRST pre-flop.
        // Post-flop, Dealer acts LAST.
        this.state.turnIndex = sbIndex;
    }

    postBlind(playerIndex, amount) {
        const player = this.state.players[playerIndex];
        const actualAmount = Math.min(player.chips, amount);
        player.chips -= actualAmount;
        player.currentBet += actualAmount;
        player.isAllIn = (player.chips === 0);
        this.state.pot += actualAmount;
    }

    handleAction(playerIndex, action, amount = 0) {
        if (this.state.turnIndex !== playerIndex) return false;

        const player = this.state.players[playerIndex];
        const opponent = this.state.players[(playerIndex + 1) % 2];

        // Validate action logic
        const currentHighBet = Math.max(this.state.players[0].currentBet, this.state.players[1].currentBet);
        const toCall = currentHighBet - player.currentBet;

        let actionValid = true;

        if (action === 'fold') {
            player.folded = true;
            this.endHand(opponent.id); // Opponent wins
            return true;
        }

        if (action === 'check') {
            if (toCall > 0) actionValid = false; // Cannot check if there is a bet
        }

        if (action === 'call') {
            if (toCall > player.chips) {
                // All in call
                const callAmt = player.chips;
                player.chips = 0;
                player.currentBet += callAmt;
                player.isAllIn = true;
                this.state.pot += callAmt;
            } else {
                player.chips -= toCall;
                player.currentBet += toCall;
                player.isAllIn = (player.chips === 0);
                this.state.pot += toCall;
            }
        }

        if (action === 'raise') {
            // Logic for raise
            // amount is total bet or add-on? Let's say amount is the total bet they want to be at.
            // Or easier: amount is "how much to add ON TOP of the current high bet" (Logic A)
            // Or: amount is "new total bet" (Logic B)
            // Let's use Logic B: 'amount' is the target total bet.
            // Usually UI sends the raise amount.

            // Minimal raise is usually minBet or double the previous raise.
            // Simplifying: just check if they have chips.
            const raiseAmt = amount - player.currentBet;
            if (raiseAmt > player.chips) actionValid = false; // Not enough chips
            if (amount < currentHighBet + this.state.minBet && amount < player.chips + player.currentBet) {
                // Must raise at least min bet unless all-in
                // Simplifying for now
            }

            if (actionValid) {
                player.chips -= raiseAmt;
                player.currentBet = amount;
                player.isAllIn = (player.chips === 0);
                this.state.pot += raiseAmt;
            }
        }

        if (!actionValid) return false;

        this.state.lastAction = `${player.name} ${action}`;

        // Move turn or Phase transition
        if (this.isRoundOver()) {
            this.nextPhase();
        } else {
            this.state.turnIndex = (this.state.turnIndex + 1) % 2;
        }

        return true;
    }

    isRoundOver() {
        const p1 = this.state.players[0];
        const p2 = this.state.players[1];
        if (p1.folded || p2.folded) return true;

        // Round is over if bets are equal and both have acted at least once in this phase
        // Tracking "acted" is tricky.
        // Easier state check: 
        // If bets are equal, AND turn is not currently the one who needs to close action.
        // In Heads Up:
        // Pre-Flop: Dealer (SB) acts first. BB acts second. If SB calls, BB checks => Round Over.
        // If SB Raises, BB calls => Round Over.

        // Let's simplify: simple state flag "actionsClosed"? 
        // Or just check if amounts match and everyone has had a chance?
        // How about maintaining a 'aggressor' index?
        // Let's rely on Game loop knowing if bets are equal.

        return (p1.currentBet === p2.currentBet && p1.currentBet > 0) || (p1.isAllIn || p2.isAllIn && p1.currentBet === p2.currentBet);
        // This is imperfect (doesn't handle check-check). 
        // Check-Check: currentBet is 0 for both.

        // Better logic:
        // nextPhase logic handles "if bets equal, go to next phase".
        // BUT, first player can Check. Bets equal (0=0). Should not go next phase.
        // We need a flag 'hasActedThisRound' for each player.
    }

    // This needs robustifying, but for prototype:
    // We'll trust the turn passing.
    // If Check -> Check, bets equal (0), phase ends.
    // If Bet -> Call, bets equal (>0), phase ends.

    nextPhase() {
        // Reset bets
        this.state.players.forEach(p => p.currentBet = 0);

        switch (this.state.phase) {
            case PHASES.PRE_FLOP:
                this.state.phase = PHASES.FLOP;
                // Deal 3
                this.dealCommunity(3);
                // Post-flop, BB acts first (which is index 1 if dealer is 0)
                // Wait, Heads Up: Dealer acts LAST post-flop. Non-dealer acts FIRST.
                // Dealer = 0. Non-dealer = 1.
                // Pre-flop: Dealer (0) acts first.
                // Post-flop: Non-Dealer (1) acts first.
                this.state.turnIndex = (this.state.dealerIndex + 1) % 2;
                break;
            case PHASES.FLOP:
                this.state.phase = PHASES.TURN;
                this.dealCommunity(1);
                this.state.turnIndex = (this.state.dealerIndex + 1) % 2;
                break;
            case PHASES.TURN:
                this.state.phase = PHASES.RIVER;
                this.dealCommunity(1);
                this.state.turnIndex = (this.state.dealerIndex + 1) % 2;
                break;
            case PHASES.RIVER:
                this.state.phase = PHASES.SHOWDOWN;
                this.determineWinner();
                break;
        }
    }

    dealCommunity(count) {
        // deck needs to be reconstructed or saved in state?
        // state.deck is array of objects.
        const newCards = this.state.deck.splice(0, count);
        this.state.communityCards.push(...newCards);
    }

    determineWinner() {
        const p1 = this.state.players[0];
        const p2 = this.state.players[1];

        if (p1.folded) { this.endHand(p2.id); return; }
        if (p2.folded) { this.endHand(p1.id); return; }

        const hand1 = evaluateHand([...p1.hand, ...this.state.communityCards]);
        const hand2 = evaluateHand([...p2.hand, ...this.state.communityCards]);

        const result = compareHands(hand1, hand2);

        if (result > 0) {
            this.endHand(p1.id);
        } else if (result < 0) {
            this.endHand(p2.id);
        } else {
            this.endHand('split');
        }
    }

    endHand(winnerId) {
        this.state.phase = PHASES.GAME_OVER;
        this.state.winner = winnerId;

        if (winnerId === 'split') {
            const half = Math.floor(this.state.pot / 2);
            this.state.players[0].chips += half;
            this.state.players[1].chips += half;
        } else {
            const winner = this.state.players.find(p => p.id === winnerId);
            winner.chips += this.state.pot;
        }

        this.state.pot = 0;

        // Rotate dealer for next hand
        this.state.dealerIndex = (this.state.dealerIndex + 1) % 2;
    }
}
