import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

// اتصال به سرور
const socket = io("https://xvits-89-39-8-199.a.free.pinggy.link", {
  transports: ["websocket"]
});

// نقشه‌برداری ارزش کارت‌ها برای مرتب‌سازی در دست بازیکن
const cardValueMap: any = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
const suitOrder: any = { 'Hearts': 0, 'Spades': 1, 'Diamonds': 2, 'Clubs': 3 };

function App() {
  const [userName, setUserName] = useState("");
  const [hasJoined, setHasJoined] = useState(false);
  const [hand, setHand] = useState<any[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [allNames, setAllNames] = useState<string[]>([]);
  const [status, setStatus] = useState("در انتظار...");
  const [playedCards, setPlayedCards] = useState<any[]>([]);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [hokm, setHokm] = useState<string | null>(null);
  const [showHokmMenu, setShowHokmMenu] = useState(false);
  const [scores, setScores] = useState({ teamA: 0, teamB: 0 });
  const [winnerTeam, setWinnerTeam] = useState<string | null>(null);
  const [rematchCount, setRematchCount] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const [determiningCard, setDeterminingCard] = useState<any>(null);
  const [hakemWinner, setHakemWinner] = useState<string | null>(null);

  useEffect(() => {
    socket.on('error', (msg) => {
      alert(msg);
      // اگر خطای ورود بود، برگرد به صفحه لاگین
      if (msg.includes("ظرفیت") || msg.includes("قبلاً انتخاب شده")) {
        setHasJoined(false); 
      }
    });

    socket.on('playerUpdate', (data) => {
      setPlayerCount(data.count);
      setAllNames(data.names || []);
    });

    socket.on('statusUpdate', (msg) => setStatus(msg));

    socket.on('showingDeterminingCard', (data) => {
      setDeterminingCard(data);
      setStatus(`در حال پخش برای: ${data.playerName}`);
    });

    socket.on('hakemDetermined', (data) => {
      setHakemWinner(data.winnerName);
      setDeterminingCard(null);
      setStatus(`👑 ${data.winnerName} حاکم شد!`);
    });

    // دریافت کارت‌ها (پشتیبانی از پخش ۵-۴-۴ سرور)
    socket.on('receivePartialCards', (data) => {
      setHand((prevHand) => {
        const combined = [...prevHand, ...data.cards];
        // مرتب‌سازی کل کارت‌های دریافتی
        return combined.sort((a, b) => {
          if (suitOrder[a.suit] !== suitOrder[b.suit]) {
            return suitOrder[a.suit] - suitOrder[b.suit];
          }
          return cardValueMap[b.value] - cardValueMap[a.value];
        });
      });

      // فقط در مرحله اول (۵ کارت) به حاکم اجازه تعیین حکم بده
      if (data.isHakem && data.stage === 0) {
        setShowHokmMenu(true);
        setStatus("شما حاکم هستید! بر اساس ۵ کارت اول حکم را تعیین کنید.");
      }
    });

    // سیستم ضد تقلب: در صورت خطای کلاینت، سرور دست واقعی را ارسال می‌کند
    socket.on('syncHand', (serverHand) => {
      setHand(serverHand.sort((a: any, b: any) => {
        if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
        return cardValueMap[b.value] - cardValueMap[a.value];
      }));
    });

    // پاکسازی میز برای شروع یک دست کاملاً جدید
    socket.on('gameStartedReady', () => {
      setHand([]); 
      setPlayedCards([]);
      setHokm(null);
      setScores({ teamA: 0, teamB: 0 });
      setRematchCount(0);
      setIsReady(false);
      setHakemWinner(null);
      setIsMyTurn(false);
      setWinnerTeam(null);
      setShowHokmMenu(false);
    });

    socket.on('hokmUpdate', (suit) => {
      setHokm(suit);
      setShowHokmMenu(false);
      setStatus("حکم تعیین شد. در حال پخش بقیه کارت‌ها...");
    });

    socket.on('turnUpdate', (id) => {
      const myTurn = socket.id === id;
      setIsMyTurn(myTurn);
      setStatus(myTurn ? "نوبت شماست!" : "منتظر بقیه...");
    });

    socket.on('cardPlayed', (data) => {
      setPlayedCards((prev) => [...prev, data.card]);
    });

    socket.on('trickFinished', (data) => {
      setTimeout(() => {
        setPlayedCards([]); 
        setScores(data.scores);
        setIsMyTurn(socket.id === data.nextTurnId);
      }, 1000);
    });

    // پایان کل مسابقه (رسیدن به سقف ست‌ها)
    socket.on('gameOver', (data) => {
      setWinnerTeam(data.winner);
      setIsMyTurn(false);
    });

    socket.on('rematchStatus', (data) => {
      setRematchCount(data.readyCount);
    });

    return () => {
      socket.off('error');
      socket.off('playerUpdate');
      socket.off('statusUpdate');
      socket.off('showingDeterminingCard');
      socket.off('hakemDetermined');
      socket.off('receivePartialCards');
      socket.off('syncHand');
      socket.off('gameStartedReady');
      socket.off('hokmUpdate');
      socket.off('turnUpdate');
      socket.off('cardPlayed');
      socket.off('trickFinished');
      socket.off('gameOver');
      socket.off('rematchStatus');
    };
  }, []);

  // اعتبارسنجی کلاینت (علاوه بر اعتبارسنجی سمت سرور)
  const isCardSelectable = (card: any) => {
    if (!isMyTurn || !hokm || winnerTeam) return false;
    if (playedCards.length === 0) return true; // نفر اول هر کارتی می‌تواند بازی کند
    
    const leadSuit = playedCards[0].suit;
    const hasLeadSuit = hand.some(c => c.suit === leadSuit);
    
    // اگر بازیکن خال زمینه را دارد، حتماً باید همان را بازی کند
    if (hasLeadSuit) return card.suit === leadSuit;
    return true; // اگر ندارد، هر کارتی مجاز است
  };

  const handleJoin = () => {
    if (userName.trim()) {
      socket.emit('joinGame', userName);
      setHasJoined(true);
    }
  };

  const playCard = (card: any, index: number) => {
    if (!isCardSelectable(card)) return;
    socket.emit('playCard', card);
    // کارت را موقتاً از دست حذف می‌کنیم تا انیمیشن سریع باشد
    setHand(hand.filter((_, i) => i !== index));
    setIsMyTurn(false);
  };

  const handleRematch = () => {
    socket.emit('requestRematch');
    setIsReady(true);
  };

  const getHokmDisplay = (h: string) => {
    if (h === 'Hearts') return '♥';
    if (h === 'Spades') return '♠';
    if (h === 'Diamonds') return '♦';
    if (h === 'Clubs') return '♣';
    return h; 
  };

  const isKot = winnerTeam?.includes("کُت");

  // --- رندر صفحه لاگین ---
  if (!hasJoined) {
    return (
      <div style={{ backgroundColor: '#1a472a', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white', fontFamily: 'Arial' }}>
        <h1 style={{ color: 'gold', textShadow: '2px 2px 4px #000', fontSize: '45px' }}>♣ بازی حکم آنلاین ♠</h1>
        <input 
          type="text" 
          placeholder="نام خود را بنویسید..." 
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          style={{ padding: '15px', fontSize: '18px', borderRadius: '8px', border: 'none', marginBottom: '15px', width: '280px', textAlign: 'center', boxShadow: '0 4px 8px rgba(0,0,0,0.3)' }}
        />
        <button onClick={handleJoin} style={{ padding: '12px 40px', fontSize: '20px', cursor: 'pointer', backgroundColor: 'gold', borderRadius: '8px', border: 'none', fontWeight: 'bold', color: '#1a472a', transition: 'all 0.3s' }}>ورود به میز بازی</button>
        <p style={{ marginTop: '25px', fontSize: '18px' }}>بازیکنان آماده در میز: {playerCount} / 4</p>
      </div>
    );
  }

  // --- رندر صفحه تعیین حاکم ---
  if (playerCount === 4 && (determiningCard || hakemWinner) && !hand.length) {
    return (
      <div style={{ backgroundColor: '#1a472a', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white' }}>
        <h1 style={{ color: 'gold', fontSize: '40px' }}>👑 تعیین حاکم 👑</h1>
        <div style={{ height: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {determiningCard && (
            <div className="determining-card" style={{ 
              background: 'white', color: (determiningCard.card.suit === 'Hearts' || determiningCard.card.suit === 'Diamonds') ? 'red' : 'black', 
              padding: '20px', borderRadius: '15px', width: '80px', textAlign: 'center', fontSize: '40px', fontWeight: 'bold',
              boxShadow: '0 0 20px rgba(255,215,0,0.5)', border: '2px solid gold'
            }}>
              {determiningCard.card.value}<br/>
              {getHokmDisplay(determiningCard.card.suit)}
            </div>
          )}
          {hakemWinner && (
            <div style={{ textAlign: 'center', animation: 'fadeIn 1s' }}>
              <h2 style={{ fontSize: '35px', color: 'gold' }}>{hakemWinner} حاکم شد!</h2>
              <p>در حال بر زدن و پخش ورق‌ها...</p>
            </div>
          )}
        </div>
        <p style={{ fontSize: '22px', marginTop: '30px', color: 'yellow', fontWeight: 'bold' }}>{status}</p>
        <style>{`
          .determining-card { animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
          @keyframes popIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>
      </div>
    );
  }

  // --- رندر صفحه پایان مسابقه ---
  if (winnerTeam) {
    return (
      <div style={{ backgroundColor: isKot ? '#111' : '#1a472a', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: isKot ? '#ff4444' : 'gold', fontFamily: 'Arial', transition: 'all 1s' }}>
        <h1 style={{ fontSize: isKot ? '70px' : '50px', margin: '0', textShadow: '2px 2px 10px rgba(0,0,0,0.5)' }}>{isKot ? '🔥 KOT 🔥' : '🎉 پایان مسابقه 🎉'}</h1>
        <h2 style={{ fontSize: '30px', color: 'white', marginTop: '20px', textAlign: 'center' }}>{winnerTeam}</h2>
        <div style={{ marginTop: '40px', textAlign: 'center' }}>
          <p style={{ color: 'white', fontSize: '20px' }}>آمادگی برای بازی مجدد: {rematchCount} / 4</p>
          {!isReady ? (
            <button onClick={handleRematch} style={{ padding: '15px 40px', fontSize: '22px', cursor: 'pointer', backgroundColor: isKot ? '#ff4444' : 'gold', border: 'none', borderRadius: '12px', fontWeight: 'bold', color: isKot ? 'white' : '#1a472a', boxShadow: '0 0 15px rgba(255,255,255,0.2)', marginTop: '10px' }}>آماده‌ام!</button>
          ) : (
            <p style={{ color: 'lightgreen', fontSize: '24px', fontWeight: 'bold', marginTop: '15px' }}>منتظر تایید بقیه بازیکنان...</p>
          )}
        </div>
      </div>
    );
  }

  // --- رندر میز اصلی بازی ---
  return (
    <div style={{ backgroundColor: '#1a472a', minHeight: '100vh', color: 'white', textAlign: 'center', fontFamily: 'Arial', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      
      {/* هدر نمایش امتیازات */}
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '15px', background: 'rgba(0,0,0,0.6)', borderBottom: '2px solid gold', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
        <div style={{ color: '#00d4ff', fontWeight: 'bold', fontSize: '20px' }}>تیم A: <span style={{fontSize: '24px', color: 'white'}}>{scores.teamA}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
           {hokm ? <div style={{ fontSize: '22px', color: 'gold', fontWeight: 'bold', background: '#333', padding: '5px 15px', borderRadius: '20px', border: '1px solid gold' }}>حکم: {getHokmDisplay(hokm)}</div> : <div style={{ fontSize: '18px', color: '#aaa' }}>در حال تعیین حکم...</div>}
        </div>
        <div style={{ color: '#ff4d4d', fontWeight: 'bold', fontSize: '20px' }}>تیم B: <span style={{fontSize: '24px', color: 'white'}}>{scores.teamB}</span></div>
      </div>

      <div style={{ padding: '8px', fontSize: '14px', color: '#ddd', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid #444' }}>
        حاضرین: {allNames.join(' | ')}
      </div>

      {/* میز وسط */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <p style={{ fontSize: '18px', color: 'yellow', fontWeight: 'bold', textShadow: '1px 1px 3px #000', marginBottom: '10px', minHeight: '25px' }}>{status}</p>
        
        <div style={{ border: '6px double gold', borderRadius: '50%', width: '320px', height: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', backgroundColor: '#143a22', boxShadow: 'inset 0 0 50px rgba(0,0,0,0.5), 0 10px 30px rgba(0,0,0,0.4)' }}>
          {showHokmMenu ? (
            <div style={{ background: 'rgba(0,0,0,0.95)', padding: '20px', borderRadius: '20px', border: '2px solid gold', zIndex: 100, boxShadow: '0 0 20px rgba(255,215,0,0.3)' }}>
              <p style={{ marginBottom: '15px', fontWeight: 'bold', fontSize: '16px', color: 'white' }}>حکم را انتخاب کنید:</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {['Hearts', 'Spades', 'Diamonds', 'Clubs'].map(s => (
                  <button key={s} onClick={() => socket.emit('setHokm', s)} style={{ fontSize: '35px', padding: '10px', cursor: 'pointer', borderRadius: '12px', border: '2px solid #555', background: '#fff', color: (s === 'Hearts' || s === 'Diamonds') ? 'red' : 'black', transition: 'transform 0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                    {getHokmDisplay(s)}
                  </button>
                ))}
                <button onClick={() => socket.emit('setHokm', 'سرس')} style={{ fontSize: '18px', padding: '10px', cursor: 'pointer', borderRadius: '10px', background: 'linear-gradient(45deg, gold, orange)', border: 'none', fontWeight: 'bold', color: '#000' }}>سرس</button>
                <button onClick={() => socket.emit('setHokm', 'نرس')} style={{ fontSize: '18px', padding: '10px', cursor: 'pointer', borderRadius: '10px', background: 'linear-gradient(45deg, gold, orange)', border: 'none', fontWeight: 'bold', color: '#000' }}>نرس</button>
                <button onClick={() => socket.emit('setHokm', 'تک نرس')} style={{ fontSize: '18px', padding: '10px', cursor: 'pointer', borderRadius: '10px', background: 'linear-gradient(45deg, gold, orange)', border: 'none', fontWeight: 'bold', color: '#000', gridColumn: 'span 2' }}>تک نرس</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>
              {playedCards.map((c, i) => (
                <div key={i} className="played-card" style={{ 
                  background: 'white', 
                  color: (c.suit === 'Hearts' || c.suit === 'Diamonds') ? 'red' : 'black', 
                  padding: '12px', borderRadius: '10px', width: '50px', fontWeight: 'bold',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.5)', fontSize: '24px',
                  animation: 'slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
                }}>
                  {c.value}<br/>
                  {getHokmDisplay(c.suit)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* نمایش دست بازیکن در پایین */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '20px', flexWrap: 'wrap', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}>
        {hand.map((card, index) => {
          const selectable = isCardSelectable(card);
          // برای جدا کردن بصری خال‌ها از هم
          const isLastOfSuit = index < hand.length - 1 && card.suit !== hand[index + 1].suit;

          return (
            <div 
              key={`${card.suit}-${card.value}-${index}`} 
              onClick={() => selectable && playCard(card, index)}
              style={{ 
                background: 'white', color: (card.suit === 'Hearts' || card.suit === 'Diamonds') ? 'red' : 'black', 
                padding: '12px 5px', borderRadius: '10px', width: '60px', height: '90px', fontWeight: 'bold', fontSize: '22px',
                cursor: selectable ? 'pointer' : 'not-allowed',
                opacity: selectable ? 1 : 0.35,
                transform: selectable ? 'translateY(-20px)' : 'none',
                filter: selectable ? 'none' : 'grayscale(60%)',
                marginRight: isLastOfSuit ? '20px' : '0px', 
                transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                boxShadow: selectable ? '0 10px 20px rgba(0,0,0,0.4)' : '0 2px 5px rgba(0,0,0,0.2)',
                border: selectable ? '3px solid #ffd700' : '1px solid #999',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}
              onMouseOver={e => selectable && (e.currentTarget.style.transform = 'translateY(-30px) scale(1.05)')}
              onMouseOut={e => selectable && (e.currentTarget.style.transform = 'translateY(-20px) scale(1)')}
            >
              <span>{card.value}</span>
              <span style={{ fontSize: '28px', marginTop: '5px' }}>{getHokmDisplay(card.suit)}</span>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateY(100px) scale(0.5) rotate(20deg); opacity: 0; }
          to { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
        }
        .played-card { border: 2px solid #ccc; position: absolute; }
        .played-card:nth-child(1) { bottom: 20px; }
        .played-card:nth-child(2) { right: 20px; transform: rotate(-90deg); }
        .played-card:nth-child(3) { top: 20px; }
        .played-card:nth-child(4) { left: 20px; transform: rotate(90deg); }
      `}</style>
    </div>
  );
}

export default App;