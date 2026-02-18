const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const { Bot } = require("grammy");
const bot = new Bot(process.env.BOT_TOKEN); // توکن را در پنل Railway وارد کنید

// وقتی کاربر در تلگرام /start می‌زند
bot.command("start", (ctx) => {
  ctx.reply("خوش آمدید! برای شروع بازی روی دکمه زیر کلیک کنید:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "شروع بازی حکم 🃏", web_app: { url: "آدرس_فرانت_اند_شما" } }]
      ]
    }
  });
});

bot.start(); // اجرای ربات همزمان با سرور بازی

// --- متغیرهای اصلی تو (دست‌نخورده) ---
let players = []; 
let playerNames = {}; 
let readyPlayers = new Set(); 
let currentTurn = 0;
let currentHokm = null;
let trickCards = [];
let scores = { teamA: 0, teamB: 0 }; // امتیاز دست‌های گرفته شده (تا ۷)
let hakemIndex = 0;

// --- متغیرهای حرفه‌ای اضافه شده برای یک سرور بی‌نقص ---
let matchScores = { teamA: 0, teamB: 0 }; // امتیاز کل بازی‌ها (ست‌ها)
let serverHands = {}; // نگه داشتن دست بازیکنان تو سرور برای جلوگیری از تقلب (خُنگی)
let gameDeck = []; // دسته کارت فعلی
const WINNING_MATCH_SCORE = 7; // سقف پیروزی در کل بازی

const cardValueMap = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
const suitOrder = { 'Hearts': 0, 'Spades': 1, 'Diamonds': 2, 'Clubs': 3 };

function shuffleCards() {
    const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = [];
    for (let s of suits) {
        for (let v of values) {
            deck.push({ suit: s, value: v });
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

// تابع چک کردن اینکه آیا بازیکن تیم A است یا B
function isTeamA(index) {
    return index === 0 || index === 2;
}

async function determineHakem() {
    io.emit('statusUpdate', "در حال تعیین حاکم...");
    scores = { teamA: 0, teamB: 0 };
    matchScores = { teamA: 0, teamB: 0 }; // ریست کردن کل ست‌ها
    trickCards = [];
    currentHokm = null;

    const deck = shuffleCards();
    let foundHakem = false;
    let i = 0;

    while (!foundHakem && i < deck.length) {
        const card = deck[i];
        const playerIdx = i % 4;
        const playerSocketId = players[playerIdx];

        io.emit('showingDeterminingCard', { 
            playerIdx, 
            playerName: playerNames[playerSocketId], 
            card 
        });

        if (card.value === 'A') {
            hakemIndex = playerIdx;
            foundHakem = true;
            io.emit('hakemDetermined', { 
                winnerName: playerNames[playerSocketId], 
                winnerId: playerSocketId 
            });
            
            setTimeout(() => {
                startActualGame();
            }, 3000);
        }
        
        i++;
        await new Promise(resolve => setTimeout(resolve, 600));
    }
}

// مرحله اول پخش: فقط ۵ کارت اول داده می‌شود تا حاکم حکم کند
async function startActualGame() {
    readyPlayers.clear();
    currentHokm = null;
    trickCards = [];
    scores = { teamA: 0, teamB: 0 };
    serverHands = { [players[0]]: [], [players[1]]: [], [players[2]]: [], [players[3]]: [] };
    
    // دستور پاکسازی میز برای فرانت‌اند
    io.emit('gameStartedReady'); 

    gameDeck = shuffleCards();
    
    // پخش ۵ کارت اول برای همه
    players.forEach((id, index) => {
        const first5Cards = gameDeck.slice(index * 13, (index * 13) + 5);
        serverHands[id].push(...first5Cards);
        
        io.to(id).emit('receivePartialCards', {
            cards: first5Cards,
            isHakem: index === hakemIndex,
            turnId: players[hakemIndex], // هنوز بازی شروع نشده، ولی آیدی حاکم رو می‌دیم
            names: playerNames,
            stage: 0 
        });
    });

    io.emit('statusUpdate', `منتظر تعیین حکم توسط ${playerNames[players[hakemIndex]]}...`);
    // سرور در اینجا متوقف می‌شود تا زمانی که ایونت setHokm دریافت شود
}

// ادامه پخش کارت‌ها (۴ تا ۴ تا) بعد از تعیین حکم
async function distributeRemainingCards() {
    const stages = [4, 4];
    const startIdxs = [5, 9];

    for (let s = 0; s < stages.length; s++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        players.forEach((id, index) => {
            const extraCards = gameDeck.slice((index * 13) + startIdxs[s], (index * 13) + startIdxs[s] + stages[s]);
            serverHands[id].push(...extraCards);
            
            io.to(id).emit('receivePartialCards', {
                cards: extraCards,
                isHakem: index === hakemIndex,
                turnId: players[currentTurn],
                names: playerNames,
                stage: s + 1
            });
        });
    }

    // حالا بازی رسماً شروع می‌شود و نوبت حاکم است
    currentTurn = hakemIndex;
    io.emit('turnUpdate', players[currentTurn]);
    io.emit('statusUpdate', `بازی شروع شد! امتیاز کل - تیم A: ${matchScores.teamA} | تیم B: ${matchScores.teamB}`);
}

// منطق فوق حرفه‌ای پیدا کردن برنده (پشتیبانی بی‌نقص نرس، سرس، تک نرس)
function getWinnerId(cards, hokm) {
    let leadSuit = cards[0].card.suit;
    let winner = cards[0];

    for (let i = 1; i < cards.length; i++) {
        let current = cards[i];
        
        const getVal = (v) => {
            let val = cardValueMap[v];
            if (hokm === 'تک نرس' && v === 'A') return 1; // تک کمترین است
            return val;
        };

        let currentVal = getVal(current.card.value);
        let winnerVal = getVal(winner.card.value);

        if (hokm === 'نرس' || hokm === 'تک نرس') {
            if (current.card.suit === leadSuit && currentVal < winnerVal) winner = current;
        } else if (hokm === 'سرس') {
            if (current.card.suit === leadSuit && currentVal > winnerVal) winner = current;
        } else {
            // حکم استاندارد
            if (current.card.suit === hokm) {
                if (winner.card.suit !== hokm || currentVal > winnerVal) winner = current;
            } else if (current.card.suit === leadSuit && winner.card.suit !== hokm) {
                if (currentVal > winnerVal) winner = current;
            }
        }
    }
    return winner.playerId;
}

// تابع اعتبارسنجی حرکت کاربر (ضد تقلب)
function isValidPlay(socketId, card) {
    const pIndex = players.indexOf(socketId);
    if (pIndex !== currentTurn) return false; // نوبتش نیست

    const hand = serverHands[socketId];
    // آیا اصلاً این کارت رو تو دستش داره؟
    const hasCard = hand.some(c => c.suit === card.suit && c.value === card.value);
    if (!hasCard) return false;

    // آیا در حال پاسخ به زمینه است و خُنگی نمی‌کند؟
    if (trickCards.length > 0) {
        const leadSuit = trickCards[0].card.suit;
        const hasLeadSuit = hand.some(c => c.suit === leadSuit);
        if (hasLeadSuit && card.suit !== leadSuit) return false; // تقلب! باید خال زمینه بدهد
    }
    return true;
}

io.on('connection', (socket) => {
    socket.on('joinGame', (name) => {
        const cleanName = name ? name.trim() : "";
        const isNameTaken = Object.values(playerNames).some(n => n.toLowerCase() === cleanName.toLowerCase());
        
        if (!cleanName) return socket.emit('error', "لطفاً یک نام وارد کنید.");
        if (isNameTaken) return socket.emit('error', "این نام کاربری قبلاً انتخاب شده است.");

        if (players.length < 4) {
            players.push(socket.id);
            playerNames[socket.id] = cleanName;
            
            io.emit('playerUpdate', {
                count: players.length,
                names: Object.values(playerNames)
            });
            
            if (players.length === 4) {
                determineHakem();
            }
        } else {
            socket.emit('error', "ظرفیت بازی تکمیل است.");
        }
    });

    socket.on('setHokm', (suit) => {
        // فقط حاکم می‌تونه حکم کنه و فقط زمانی که حکمی ست نشده باشه
        if (socket.id === players[hakemIndex] && currentHokm === null) {
            currentHokm = suit;
            io.emit('hokmUpdate', suit);
            distributeRemainingCards(); // پخش بقیه کارت‌ها
        }
    });

    socket.on('playCard', (card) => {
        if (scores.teamA >= 7 || scores.teamB >= 7) return;

        // اعتبارسنجی سرسختانه سرور
        if (isValidPlay(socket.id, card)) {
            // حذف کارت از دست ذخیره شده در سرور
            serverHands[socket.id] = serverHands[socket.id].filter(c => !(c.suit === card.suit && c.value === card.value));
            
            trickCards.push({ card, playerId: socket.id });
            io.emit('cardPlayed', { card, playerId: socket.id });

            if (trickCards.length === 4) {
                const winnerId = getWinnerId(trickCards, currentHokm);
                const winnerIndex = players.indexOf(winnerId);
                
                if (isTeamA(winnerIndex)) scores.teamA++;
                else scores.teamB++;

                currentTurn = winnerIndex; // برنده دست، نوبت بعدی را شروع می‌کند
                
                setTimeout(() => {
                    io.emit('trickFinished', { winnerId, scores, nextTurnId: players[currentTurn] });
                    trickCards = [];

                    // بررسی پایان یک ست (رسیدن به ۷)
                    if (scores.teamA === 7 || scores.teamB === 7) {
                        let roundWinnerTeam = scores.teamA === 7 ? "teamA" : "teamB";
                        let roundLoserTeam = scores.teamA === 7 ? "teamB" : "teamA";
                        let pointsToAward = 1; // امتیاز عادی

                        // بررسی حالت کُت
                        if (scores[roundLoserTeam] === 0) {
                            const isHakemLoser = (roundLoserTeam === "teamA" && isTeamA(hakemIndex)) || (roundLoserTeam === "teamB" && !isTeamA(hakemIndex));
                            pointsToAward = isHakemLoser ? 3 : 2; // حاکم کُت ۳ امتیاز، کُت معمولی ۲ امتیاز
                        }

                        matchScores[roundWinnerTeam] += pointsToAward;

                        // بررسی برنده نهایی کل مسابقه
                        if (matchScores.teamA >= WINNING_MATCH_SCORE || matchScores.teamB >= WINNING_MATCH_SCORE) {
                            let champion = matchScores.teamA >= WINNING_MATCH_SCORE ? "تیم A" : "تیم B";
                            io.emit('gameOver', { winner: `🏆 ${champion} قهرمان کل بازی شد! 🏆` });
                        } else {
                            // مسابقه ادامه دارد، تعیین حاکم دست بعد
                            const didHakemWin = (roundWinnerTeam === "teamA" && isTeamA(hakemIndex)) || (roundWinnerTeam === "teamB" && !isTeamA(hakemIndex));
                            
                            let endRoundMsg = pointsToAward > 1 ? `🔥 کُت! تیم ${roundWinnerTeam === "teamA" ? "A" : "B"} پیروز این دست شد.` : `تیم ${roundWinnerTeam === "teamA" ? "A" : "B"} این دست را برد.`;
                            io.emit('statusUpdate', endRoundMsg);

                            setTimeout(() => {
                                if (!didHakemWin) {
                                    // چرخش حاکم (نفر سمت راست/بعدی)
                                    hakemIndex = (hakemIndex + 1) % 4;
                                }
                                io.emit('statusUpdate', `حاکم جدید: ${playerNames[players[hakemIndex]]}`);
                                setTimeout(() => {
                                    startActualGame(); // شروع پخش دست جدید
                                }, 2000);
                            }, 3000);
                        }
                    } else {
                        io.emit('turnUpdate', players[currentTurn]);
                    }
                }, 1500); // مکث برای دیدن ۴ کارت روی میز
            } else {
                currentTurn = (currentTurn + 1) % 4;
                io.emit('turnUpdate', players[currentTurn]);
            }
        } else {
            // اگر بازیکن حرکت غیرمجاز کرد
            socket.emit('error', "حرکت غیرمجاز! خال زمینه را بازی کنید یا نوبت شما نیست.");
            // فرستادن دوباره دست بازیکن برای سینک شدن فرانت با سرور
            socket.emit('syncHand', serverHands[socket.id]); 
        }
    });

    socket.on('requestRematch', () => {
        readyPlayers.add(socket.id);
        io.emit('rematchStatus', { readyCount: readyPlayers.size });
        if (readyPlayers.size === 4) {
            determineHakem();
        }
    });

    socket.on('disconnect', () => {
        players = players.filter(id => id !== socket.id);
        delete playerNames[socket.id];
        delete serverHands[socket.id];
        readyPlayers.delete(socket.id);
        
        io.emit('playerUpdate', { count: players.length, names: Object.values(playerNames) });
        
        // اگر کسی وسط بازی رفت، بازی باید ریست بشه (قانون بازی‌های آنلاین حرفه‌ای)
        if (players.length < 4) {
            scores = { teamA: 0, teamB: 0 };
            matchScores = { teamA: 0, teamB: 0 };
            trickCards = [];
            currentHokm = null;
            io.emit('statusUpdate', "یکی از بازیکنان خارج شد. منتظر تکمیل ظرفیت...");
        }
    });
});

// ... بقیه کدهای Socket.io و بازی ...

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    
    // اجرای ربات بعد از اطمینان از بالا آمدن سرور
    bot.start().then(() => {
        console.log("🤖 Telegram Bot is polling...");
    }).catch(err => {
        console.error("❌ Bot error:", err);
    });
});