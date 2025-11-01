// === DEBUG: descobrir ID do grupo ===
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true },
});

client.on("qr", (qr) => qrcode.generate(qr, { small: true }));

client.on("ready", async () => {
  console.log("✅ WhatsApp conectado!");
  console.log("Listando grupos...\n");

  const chats = await client.getChats();
  const grupos = chats.filter(c => c.isGroup);

  for (const g of grupos) {
    console.log(`📂 Nome: ${g.name}`);
    console.log(`🆔 ID: ${g.id._serialized}`);
    console.log("----------------------------");
  }

  console.log("👉 Copia o ID do grupo 'Finance' e cola no teu script principal.");
});
