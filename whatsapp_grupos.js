// === DEBUG: descobrir ID do grupo ===
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  console.log("📱 Escaneia o QR code abaixo para conectar:\n");
  qrcode.generate(qr, { small: true });
});

client.on("ready", async () => {
  console.log("✅ WhatsApp conectado!");
  console.log("Buscando grupos, aguarde...\n");

  try {
    const chats = await client.getChats();
    const grupos = chats.filter((c) => c.isGroup);

    if (grupos.length === 0) {
      console.log("⚠️ Nenhum grupo encontrado!");
    } else {
      for (const g of grupos) {
        console.log(`📂 Nome: ${g.name}`);
        console.log(`🆔 ID: ${g.id._serialized}`);
        console.log("----------------------------");
      }
      console.log("✅ Copie o ID do grupo 'Finance' e cole no seu script principal.");
    }
  } catch (err) {
    console.error("❌ Erro ao listar grupos:", err);
  }
});

client.on("auth_failure", (msg) => {
  console.error("❌ Falha na autenticação:", msg);
});

client.initialize();
