
export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

export class Deck {
    constructor() {
        this.cards = [];
        this.reset();
    }

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

    deal(count) {
        return this.cards.splice(0, count);
    }
}

// Hand Rankings
const HAND_TYPES = {
    HIGH_CARD: 0,
    PAIR: 1,
    TWO_PAIR: 2,
    THREE_OF_A_KIND: 3,
    STRAIGHT: 4,
    FLUSH: 5,
    FULL_HOUSE: 6,
    FOUR_OF_A_KIND: 7,
    STRAIGHT_FLUSH: 8,
    ROYAL_FLUSH: 9
};

// Helper: Check if 5 ranks are consecutive
function isConsecutive(values) {
    // Sort handled by caller if needed, but we expect sorted input usually
    // Special case: A-5-4-3-2 (Ace low straight)
    if (values.includes(14) && values.includes(2) && values.includes(3) && values.includes(4) && values.includes(5)) {
        // Check if the rest are consecutive 5,4,3,2
        // It's specific enough to just return true if we have these 5 distinct values
        // But strictly, we check 5 distinct values.
        // Let's assume input is unique sorted descending values.
        // If input is [14, 5, 4, 3, 2], that's a wheel.
        return !!(values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2);
    }

    for (let i = 0; i < values.length - 1; i++) {
        if (values[i] - values[i + 1] !== 1) return false;
    }
    return true;
}

export function evaluateHand(cards) {
    // Expecting 5 to 7 cards. We must find the best 5-card hand.
    // If > 5 cards, generate combinations.
    if (cards.length > 5) {
        return getBestHand(cards);
    }

    // Basic 5 card evaluation
    return score5CardHand(cards);
}

function getBestHand(cards) {
    const combos = getCombinations(cards, 5);
    let bestScore = -1;
    let bestHandInfo = null;

    for (let hand of combos) {
        const info = score5CardHand(hand);
        // Compare logic
        // We need a way to compare two hands strictly.
        // score5CardHand returns { type, rankValues, name }
        // We can convert that to a comparable numeric score or just compare fields.
        if (!bestHandInfo || compareHands(info, bestHandInfo) > 0) {
            bestHandInfo = info;
            bestScore = info.type;
        }
    }
    return bestHandInfo;
}

function getCombinations(array, k) {
    if (k === 1) return array.map(e => [e]);
    const combinations = [];
    const n = array.length;
    for (let i = 0; i < n - k + 1; i++) {
        const head = array.slice(i, i + 1);
        const tailCombinations = getCombinations(array.slice(i + 1), k - 1);
        for (const tail of tailCombinations) {
            combinations.push(head.concat(tail));
        }
    }
    return combinations;
}

// Returns > 0 if h1 > h2, < 0 if h2 > h1, 0 if equal
export function compareHands(h1, h2) {
    if (h1.type !== h2.type) {
        return h1.type - h2.type;
    }
    // If types are equal, compare kickers/values
    for (let i = 0; i < h1.values.length; i++) {
        if (h1.values[i] !== h2.values[i]) {
            return h1.values[i] - h2.values[i];
        }
    }
    return 0;
}


function score5CardHand(cards) {
    // Sort by value descending
    const sorted = [...cards].sort((a, b) => b.value - a.value);
    const values = sorted.map(c => c.value);
    const suits = sorted.map(c => c.suit);

    const isFlush = suits.every(s => s === suits[0]);

    // Check Straight
    // Unique values for straight check
    const uniqueValues = [...new Set(values)];
    let isStraight = false;
    let straightHigh = 0;

    // We need 5 consecutive cards.
    // Since we are evaluating exactly 5 cards here, if they are unique and consecutive, it's a straight.
    // Exception: A, 5, 4, 3, 2
    if (uniqueValues.length === 5) {
        if ((values[0] - values[4] === 4)) {
            isStraight = true;
            straightHigh = values[0];
        } else if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
            isStraight = true;
            straightHigh = 5; // Wheel, high card is 5
        }
    }

    // Royal Flush
    if (isFlush && isStraight && straightHigh === 14 && values[1] === 13) {
        return { type: HAND_TYPES.ROYAL_FLUSH, values: values, name: "Royal Flush" };
    }

    // Straight Flush
    if (isFlush && isStraight) {
        // If wheel, adjustments needed for values order for comparison?
        // Actually for comparison we want [5, 4, 3, 2, 14] effectively represented as low value.
        // Standard is comparing top card.
        // For wheel: 5,4,3,2,A. The values array is [14, 5, 4, 3, 2].
        // We should normalize 'values' for comparison to be [5, 4, 3, 2, 1] (virtual 1 for Ace)
        // BUT, compareHands checks index 0 first.
        // So validation: 
        const cmpValues = (straightHigh === 5) ? [5, 4, 3, 2, 1] : values;
        return { type: HAND_TYPES.STRAIGHT_FLUSH, values: cmpValues, name: "Straight Flush" };
    }

    // Count multiples
    const counts = {};
    for (let v of values) {
        counts[v] = (counts[v] || 0) + 1;
    }

    const countValues = Object.values(counts);
    const countKeys = Object.keys(counts).map(Number).sort((a, b) => {
        // Custom sort: count desc, then value desc
        const diff = counts[b] - counts[a];
        if (diff !== 0) return diff;
        return b - a;
    });

    // Four of a Kind
    if (countValues.includes(4)) {
        // Reorder values: Quad val first, then kicker
        const quadVal = countKeys[0];
        const kicker = countKeys[1];
        return { type: HAND_TYPES.FOUR_OF_A_KIND, values: [quadVal, kicker], name: "Four of a Kind" };
    }

    // Full House
    if (countValues.includes(3) && countValues.includes(2)) {
        return { type: HAND_TYPES.FULL_HOUSE, values: countKeys, name: "Full House" };
    }

    // Flush
    if (isFlush) {
        return { type: HAND_TYPES.FLUSH, values: values, name: "Flush" };
    }

    // Straight
    if (isStraight) {
        const cmpValues = (straightHigh === 5) ? [5, 4, 3, 2, 1] : values;
        return { type: HAND_TYPES.STRAIGHT, values: cmpValues, name: "Straight" };
    }

    // Three of a Kind
    if (countValues.includes(3)) {
        return { type: HAND_TYPES.THREE_OF_A_KIND, values: countKeys, name: "Three of a Kind" };
    }

    // Two Pair
    if (countValues.filter(x => x === 2).length === 2) {
        return { type: HAND_TYPES.TWO_PAIR, values: countKeys, name: "Two Pair" };
    }

    // Pair
    if (countValues.includes(2)) {
        return { type: HAND_TYPES.PAIR, values: countKeys, name: "Pair" };
    }

    // High Card
    return { type: HAND_TYPES.HIGH_CARD, values: values, name: "High Card" };
}
