const { Bot } = require("grammy");
const { HttpsProxyAgent } = require("https-proxy-agent");

// تنظیم دقیق پورت طبق عکس هیدیفای شما
const proxy = new HttpsProxyAgent("http://127.0.0.1:12334");

const bot = new Bot("8301558667:AAHlLlknSXMahsnfxoNBeACPMb1lOCuHY1g", {
    client: {
        baseFetchConfig: {
            agent: proxy,
        },
    },
});

// این بخش باعث می‌شود وقتی استارت زدی، دکمه بازی را ببینی
bot.command("start", async (ctx) => {
    await ctx.reply("ایول! ربات وصل شد. برای ورود به بازی روی دکمه زیر کلیک کن:", {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "ورود به بازی حکم",
// اگر میخوای روی سیستم تست کنی، موقتاً این آدرس رو بذار (فقط برای تست در مرورگر)
                        web_app: { url: "http://localhost:5173" }                    }
                ]
            ]
        }
    });
});

bot.catch((err) => console.error("خطا:", err.message));

bot.start();
console.log("🚀 ربات با پورت ۱۲۳۳۴ در حال اجراست...");