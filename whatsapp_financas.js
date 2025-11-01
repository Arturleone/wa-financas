const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fetch = require("node-fetch");
const fs = require("fs");
const Tesseract = require("tesseract.js");
const path = require("path");

// 🧩 ID do grupo "Finance"
const GRUPO_FINANCE = "120363422591432484@g.us";

// 🧠 URLs do seu n8n local
const N8N_INSERIR_URL = "http://localhost:5678/webhook/financas";
const N8N_SALDO_URL   = "http://localhost:5678/webhook/saldo";
const N8N_LISTAR_URL  = "http://localhost:5678/webhook/listar";
const N8N_REMOVER_URL = "http://localhost:5678/webhook/remover";
const N8N_EDITAR_URL  = "http://localhost:5678/webhook/editar";
const N8N_EXPORTAR_URL = "http://localhost:5678/webhook/exportar";

// 📁 Diretório para salvar imagens temporariamente
const TEMP_DIR = "./temp_images";
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  },
});

// === QR Code de login ===
client.on("qr", (qr) => qrcode.generate(qr, { small: true }));

// === Quando conectar ===
client.on("ready", () => {
  console.log("✅ WhatsApp conectado!");
  console.log("🔒 Monitorando o grupo: " + GRUPO_FINANCE);
});

// ========== FUNÇÕES AUXILIARES ==========

// → /saldo
async function enviarSaldoParaUsuario(msg) {
  try {
    const r = await fetch(N8N_SALDO_URL);
    const j = await r.json();
    const saldo = Number(j.saldo || 0).toFixed(2);
    await msg.reply(`💰 Saldo atual: R$ ${saldo}`);
  } catch (e) {
    console.error("Erro saldo:", e);
    await msg.reply("❌ Não consegui buscar o saldo agora.");
  }
}

// → /listar
async function listarLancamentos(msg) {
  try {
    const r = await fetch(N8N_LISTAR_URL);
    const arr = await r.json();

    if (!Array.isArray(arr) || arr.length === 0) {
      return msg.reply("📭 Nenhum lançamento encontrado.");
    }

    const linhas = arr.slice(0, 10).map(x =>
      `${x.id} | ${x.tipo} | R$${Number(x.valor).toFixed(2)} | ${x.descricao}`
    );

    await msg.reply("🧾 Últimos lançamentos:\n" + linhas.join("\n"));
  } catch (e) {
    console.error("Erro listar:", e);
    await msg.reply("❌ Não consegui listar agora.");
  }
}

// → função que envia pro n8n (ganho/gasto)
async function enviarParaN8N(msg, tipo, valor, descricao, autor) {
  const dataISO = new Date().toISOString();

  try {
    const res = await fetch(N8N_INSERIR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo,
        valor,
        descricao,
        data: dataISO,
        autor,
        wa_from: msg.from,
      }),
    });

    if (res.ok) {
      await msg.reply(`✅ ${tipo.toUpperCase()} de R$${valor.toFixed(2)} registrado: ${descricao}`);
    } else {
      await msg.reply("❌ Erro ao enviar pro n8n!");
    }
  } catch (err) {
    console.error("Erro de conexão com n8n:", err);
    await msg.reply("❌ Falha ao conectar com o servidor n8n.");
  }
}

// → /remover [id]
async function removerLancamento(msg, id) {
  try {
    const r = await fetch(N8N_REMOVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = await r.json();
    await msg.reply(j.sucesso ? `🗑️ Registro ${id} removido com sucesso.` : `❌ Erro ao remover ID ${id}.`);
  } catch (e) {
    console.error(e);
    await msg.reply("❌ Erro ao remover registro.");
  }
}

// → /editar [id] [novo_valor] [nova_descrição]
async function editarLancamento(msg, id, valor, descricao) {
  try {
    const r = await fetch(N8N_EDITAR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, valor, descricao }),
    });
    const j = await r.json();
    await msg.reply(j.sucesso ? `✏️ Registro ${id} atualizado com sucesso.` : `❌ Erro ao editar ID ${id}.`);
  } catch (e) {
    console.error(e);
    await msg.reply("❌ Erro ao editar registro.");
  }
}

// → /exportar CORRIGIDO - agora funciona com dados do banco
async function exportarCSV(msg) {
  try {
    await msg.reply("📊 Gerando arquivo de exportação...");
    
    // Primeiro busca os dados do banco
    const response = await fetch(N8N_LISTAR_URL);
    if (!response.ok) {
      throw new Error(`Erro ao buscar dados: ${response.status}`);
    }
    
    const registros = await response.json();
    
    if (!Array.isArray(registros) || registros.length === 0) {
      await msg.reply("📭 Nenhum registro encontrado para exportar.");
      return;
    }
    
    console.log(`📊 Exportando ${registros.length} registros...`);
    
    // Cabeçalho do CSV
    let csvContent = "ID;Data;Tipo;Valor;Descrição;Autor\n";
    
    // Adiciona cada registro
    registros.forEach(registro => {
      const dataFormatada = new Date(registro.data).toLocaleDateString('pt-BR');
      const valorFormatado = Number(registro.valor).toFixed(2).replace('.', ',');
      const tipo = registro.tipo === 'ganho' ? 'Entrada' : 'Saída';
      
      // Escapa campos que podem ter ponto e vírgula
      const descricaoEscapada = `"${(registro.descricao || '').replace(/"/g, '""')}"`;
      const autorEscapado = `"${(registro.autor || '').replace(/"/g, '""')}"`;
      
      csvContent += `${registro.id};${dataFormatada};${tipo};${valorFormatado};${descricaoEscapada};${autorEscapado}\n`;
    });
    
    // Salva o arquivo CSV
    const fileName = "registros_financeiros.csv";
    fs.writeFileSync(fileName, csvContent, 'utf8');
    
    await msg.reply("✅ Arquivo gerado com sucesso! Enviando...");
    
    // Envia o arquivo
    const media = MessageMedia.fromFilePath(fileName);
    await msg.reply(media, null, { 
      caption: `📊 Exportação financeira - ${registros.length} registros` 
    });
    
    // Limpa o arquivo temporário
    setTimeout(() => {
      if (fs.existsSync(fileName)) {
        fs.unlinkSync(fileName);
        console.log("🗑️ Arquivo temporário removido");
      }
    }, 10000);
    
  } catch (e) {
    console.error("Erro exportar:", e);
    await msg.reply("❌ Erro ao exportar dados. Verifique se o n8n está rodando.");
  }
}

// ========== PROCESSAMENTO AUTOMÁTICO DE IMAGENS ==========

// Função para detectar se é um comprovante
function isComprovante(texto) {
  const palavrasChave = [
    'comprovante', 'transferência', 'pix', 'pagamento', 'recebido',
    'valor', 'r$', 'realizado', 'favorecido', 'pagador', 'banco',
    'data', 'hora', 'cpf', 'cnpj', 'autenticação', 'código'
  ];
  
  const textoLower = texto.toLowerCase();
  const matches = palavrasChave.filter(palavra => textoLower.includes(palavra));
  
  return matches.length >= 2;
}

// Função MELHORADA para extrair valor
function extrairValorMelhorado(texto) {
  console.log("🔍 Procurando valores no texto...");
  
  // Limpa o texto para evitar falsos positivos
  const textoLimpo = texto
    .replace(/[oO]/g, '0') // Substitui 'o' e 'O' por zero
    .replace(/[lLI]/g, '1') // Substitui 'l', 'L', 'I' por um
    .replace(/[sS]/g, '5') // Substitui 's', 'S' por cinco
    .replace(/[gG]/g, '6') // Substitui 'g', 'G' por seis
    .replace(/[zZ]/g, '2'); // Substitui 'z', 'Z' por dois

  console.log("📄 Texto limpo:", textoLimpo);

  // Padrões específicos para valores monetários
  const padroes = [
    // R$ 0,01 | R$ 1.234,56
    /r\$\s*([0-9]+[.,]\d{2})/gi,
    
    // Valores próximos a "Pix enviado" ou "Pix recebido"
    /pix\s+(?:enviado|recebido)[\s\S]{0,50}?r\$\s*([0-9]+[.,]\d{2})/gi,
    
    // Valores em destaque (geralmente o valor principal)
    /([0-9]+[.,]\d{2})\s*(?=\n|$|r\$)/g,
    
    // Valores específicos com vírgula
    /(\d{1,3}(?:\.\d{3})*[.,]\d{2})/g
  ];

  const valoresEncontrados = [];

  for (const padrao of padroes) {
    const matches = textoLimpo.match(padrao);
    if (matches) {
      console.log(`🎯 Padrão "${padrao}" encontrou:`, matches);
      
      matches.forEach(match => {
        // Extrai apenas os números do match
        const numeroStr = match.replace(/[^\d,.]/g, '');
        let valor = parseFloat(numeroStr.replace(/\./g, '').replace(',', '.'));
        
        if (!isNaN(valor) && valor > 0 && valor < 1000000) { // Filtra valores absurdos
          console.log(`💰 Valor convertido: "${match}" -> "${numeroStr}" -> ${valor}`);
          valoresEncontrados.push(valor);
        }
      });
    }
  }

  console.log("📊 Todos valores encontrados:", valoresEncontrados);

  if (valoresEncontrados.length === 0) {
    return null;
  }

  // Remove duplicatas e ordena
  const valoresUnicos = [...new Set(valoresEncontrados)].sort((a, b) => a - b);
  
  // Prefere o menor valor para evitar pegar IDs como valores
  // Em comprovantes, o valor da transação geralmente é o menor número significativo
  const valorProvavel = valoresUnicos[0];
  
  console.log(`✅ Valor selecionado: ${valorProvavel}`);
  return valorProvavel;
}

// Função para extrair descrição
function extrairDescricao(texto) {
  const textoLower = texto.toLowerCase();
  
  if (textoLower.includes('pix enviado')) {
    return "Pix enviado";
  } else if (textoLower.includes('pix recebido')) {
    return "Pix recebido";
  } else if (textoLower.includes('transferência')) {
    return "Transferência";
  } else {
    return "Comprovante automático";
  }
}

// Função MELHORADA para verificar se é imagem válida (não é figurinha)
function isImagemValida(msg, media) {
  if (!media) {
    console.log("❌ Mídia não disponível");
    return false;
  }
  
  // Verifica o tipo da mensagem primeiro (mais confiável)
  if (msg.type === 'sticker') {
    console.log("❌ É uma figurinha (detectado pelo tipo)");
    return false;
  }
  
  // Verifica se é imagem (não figurinha) pelo mimetype
  const tiposImagemValidos = [
    'image/jpeg',
    'image/jpg', 
    'image/png'
  ];
  
  // Figurinhas geralmente têm mimetype diferente
  const isTipoValido = tiposImagemValidos.some(tipo => 
    media.mimetype && media.mimetype.includes(tipo)
  );
  
  if (!isTipoValido) {
    console.log(`❌ Tipo de mídia inválido: ${media.mimetype}`);
    return false;
  }
  
  // Verifica tamanho - figurinhas geralmente são pequenas
  if (media.data && media.data.length < 5000) { // menos de 5KB
    console.log("❌ Arquivo muito pequeno, provavelmente figurinha");
    return false;
  }
  
  return true;
}

// Função para processar imagem automaticamente
async function processarImagemAutomaticamente(msg) {
  try {
    console.log("🖼️ Verificando mídia...");
    
    // Baixar a mídia da mensagem
    const media = await msg.downloadMedia();
    
    // Verificar se é uma imagem válida (não figurinha) - AGORA MAIS RESTRITIVO
    if (!isImagemValida(msg, media)) {
      console.log("❌ Mídia ignorada (figurinha ou tipo inválido)");
      return;
    }
    
    console.log("✅ Imagem válida detectada, processando...");
    await msg.reply("🔍 Analisando comprovante...");

    // Salvar imagem temporariamente
    const ext = media.mimetype.includes('png') ? 'png' : 'jpg';
    const tempPath = path.join(TEMP_DIR, `comprovante_${Date.now()}.${ext}`);
    fs.writeFileSync(tempPath, Buffer.from(media.data, 'base64'));

    console.log("🔍 Fazendo OCR na imagem...");

    // Fazer OCR com configuração otimizada para números
    const { data: { text } } = await Tesseract.recognize(tempPath, 'por', {
      tessedit_char_whitelist: '0123456789R$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ,.: /-',
    });
    
    console.log("📄 Texto extraído completo:", text);

    // Limpar arquivo temporário
    fs.unlinkSync(tempPath);

    // Verificar se é comprovante
    if (!isComprovante(text)) {
      console.log("❌ Não identificado como comprovante");
      return;
    }

    // Extrair valor
    const valor = extrairValorMelhorado(text);
    if (!valor || valor <= 0) {
      await msg.reply("❌ Comprovante detectado, mas não consegui identificar o valor");
      return;
    }

    // SEMPRE marca como GANHO (entrada) - conforme solicitado
    const tipo = "ganho";
    const autor = msg._data?.notifyName || msg.author || "Desconhecido";
    const descricao = extrairDescricao(text);

    // Registrar no sistema
    await enviarParaN8N(msg, tipo, valor, descricao, autor);
    
    await msg.reply(`✅ Comprovante processado automaticamente!\n💵 Valor: R$ ${valor.toFixed(2)}\n📊 Tipo: Entrada\n📝: ${descricao}`);

  } catch (error) {
    console.error("❌ Erro ao processar imagem:", error);
    // Não envia mensagem de erro para não poluir o grupo
  }
}

// ========== PROCESSAMENTO DE MENSAGENS ==========
async function processarMensagem(msg, origem) {
  const texto = (msg.body || "").trim();
  
  // Ignorar mensagens de confirmação do próprio bot
  if (!texto || texto.startsWith("✅") || texto.startsWith("❌") || texto.startsWith("🔍")) return;

  const autor = msg._data?.notifyName || msg.author || "Desconhecido";
  console.log(`💬 Mensagem (${origem}) de ${autor}: ${texto}`);

  // Processar comandos de texto
  if (texto.toLowerCase().startsWith("/saldo")) return enviarSaldoParaUsuario(msg);
  if (texto.toLowerCase().startsWith("/listar")) return listarLancamentos(msg);

  if (texto.toLowerCase().startsWith("/saiu")) {
    const partes = texto.split(" ");
    const valor = parseFloat(partes[1]?.replace(",", "."));
    if (isNaN(valor)) return msg.reply("❌ Exemplo: /saiu 10 almoço");
    const descricao = partes.slice(2).join(" ") || "(sem descrição)";
    return enviarParaN8N(msg, "gasto", valor, descricao, autor);
  }

  if (texto.toLowerCase().startsWith("/entrou")) {
    const partes = texto.split(" ");
    const valor = parseFloat(partes[1]?.replace(",", "."));
    if (isNaN(valor)) return msg.reply("❌ Exemplo: /entrou 25");
    const descricao = "(entrada)";
    return enviarParaN8N(msg, "ganho", valor, descricao, autor);
  }

  if (texto.toLowerCase().startsWith("/remover")) {
    const partes = texto.split(" ");
    const id = parseInt(partes[1]);
    if (isNaN(id)) return msg.reply("❌ Exemplo: /remover 5");
    return removerLancamento(msg, id);
  }

  if (texto.toLowerCase().startsWith("/editar")) {
    const partes = texto.split(" ");
    const id = parseInt(partes[1]);
    const valor = parseFloat(partes[2]?.replace(",", "."));
    const descricao = partes.slice(3).join(" ") || "(sem descrição)";
    if (isNaN(id) || isNaN(valor)) return msg.reply("❌ Exemplo: /editar 5 20 lanche");
    return editarLancamento(msg, id, valor, descricao);
  }

  if (texto.toLowerCase().startsWith("/exportar")) {
    return exportarCSV(msg);
  }

  console.log("Mensagem ignorada.");
}

// ========== LISTENERS ==========

// mensagens de outras pessoas
client.on("message", async (msg) => {
  if (msg.from === GRUPO_FINANCE && !msg.fromMe) {
    // Se for imagem, processa automaticamente
    if (msg.hasMedia) {
      console.log("🖼️ Mídia detectada, verificando se é imagem válida...");
      await processarImagemAutomaticamente(msg);
      return;
    }
    
    await processarMensagem(msg, "OUTRO");
  }
});

// mensagens enviadas por você
client.on("message_create", async (msg) => {
  if (msg.fromMe && msg.to === GRUPO_FINANCE) {
    // Se for imagem, processa automaticamente
    if (msg.hasMedia) {
      console.log("🖼️ Sua mídia detectada, verificando se é imagem válida...");
      await processarImagemAutomaticamente(msg);
      return;
    }
    
    await processarMensagem(msg, "VOCÊ");
  }
});

client.initialize();