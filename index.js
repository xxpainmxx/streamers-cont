const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');

// ====================== CONFIGURAÇÃO ======================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// ====================== CLIENTE ======================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ====================== TABELAS DE PONTOS ======================
const HOURS_POINTS = [
  { min: 1, points: 1 }, { min: 2, points: 2 }, { min: 3, points: 3 },
  { min: 4, points: 4 }, { min: 5, points: 5 }, { min: 6, points: 6 },
  { min: 7, points: 7 }, { min: 8, points: 8 }, { min: 9, points: 9 },
  { min: 10, points: 10 }, { min: 11, points: 11 }, { min: 12, points: 12 },
  { min: 13, points: 13 }, { min: 14, points: 14 }, { min: 15, points: 15 },
  { min: 16, points: 16 }, { min: 17, points: 17 }, { min: 18, points: 18 },
  { min: 19, points: 19 }, { min: 20, points: 20 }
];

const VIEWS_POINTS = [
  { min: 3000, points: 36 },
  { min: 2000, points: 24 },
  { min: 1000, points: 12 },
  { min: 800, points: 10 },
  { min: 500, points: 8 },
  { min: 350, points: 6 },
  { min: 100, points: 4 },
  { min: 0, points: 2 } // menos de 100 views
];

// ====================== FUNÇÕES AUXILIARES ======================
async function getTwitchToken() {
  const res = await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`);
  return res.data.access_token;
}

async function getTwitchVideo(videoId) {
  const token = await getTwitchToken();
  const res = await axios.get(`https://api.twitch.tv/helix/videos?id=${videoId}`, {
    headers: {
      'Client-ID': TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`
    }
  });
  if (!res.data.data.length) return null;
  return res.data.data[0];
}

function durationToFullHours(duration) {
  const match = duration.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  const hours = parseInt(match[1] || 0);
  return hours;
}

function pointsByHours(hours) {
  let points = 0;
  for (let rule of HOURS_POINTS) if (hours >= rule.min) points = rule.points;
  return points;
}

function pointsByViews(views) {
  for (let rule of VIEWS_POINTS) if (views >= rule.min) return rule.points;
  return 0;
}

function readData() {
  if (!fs.existsSync('data.json')) fs.writeFileSync('data.json', JSON.stringify({ users: {} }, null, 2));
  return JSON.parse(fs.readFileSync('data.json'));
}

function saveData(data) {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

// ====================== EVENTOS ======================
client.once('ready', () => {
  console.log(`Bot logado como ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'verificarvod') {
    const link = interaction.options.getString('link');
    const match = link.match(/videos\/(\d+)/);

    if (!match) return interaction.reply({ content: '❌ Link inválido da Twitch.', ephemeral: true });

    const videoId = match[1];
    const userId = interaction.user.id;

    const data = readData();
    if (!data.users[userId]) data.users[userId] = { points: 0, vods: [] };

    if (data.users[userId].vods.includes(videoId)) {
      return interaction.reply({ content: '❌ Você já contabilizou este VOD anteriormente.', ephemeral: true });
    }

    const video = await getTwitchVideo(videoId);
    if (!video) return interaction.reply({ content: '❌ VOD não encontrado.', ephemeral: true });

    const views = video.view_count;
    const hours = durationToFullHours(video.duration);

    const pointsHours = pointsByHours(hours);
    const pointsViews = pointsByViews(views);
    const totalPoints = pointsHours + pointsViews;

    // Atualizar histórico
    data.users[userId].vods.push(videoId);
    data.users[userId].points += totalPoints;
    saveData(data);

    const totalUserPoints = data.users[userId].points;

    // ✅ Mensagem usando Embed
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('📊 VOD contabilizado!')
      .setDescription('Seu VOD foi registrado com sucesso!')
      .addFields(
        { name: '👤 Usuário', value: `${interaction.user.username}`, inline: true },
        { name: '🎥 Views', value: `${views}`, inline: true },
        { name: '⏱️ Duração', value: `${hours} horas`, inline: true },
        { name: '🏆 Pontos da Live', value: `${totalPoints}`, inline: true },
        { name: '💰 Total de Pontos', value: `${totalUserPoints}`, inline: true }
      )
      .setFooter({ text: 'Texas RP - Sistema de Pontos' })
      .setTimestamp();

    interaction.reply({ embeds: [embed] });
  }
});

// ====================== REGISTRAR COMANDO ======================
const commands = [
  new SlashCommandBuilder()
    .setName('verificarvod')
    .setDescription('Verifica um VOD do Texas RP e contabiliza pontos (horas + views)')
    .addStringOption(option =>
      option.setName('link')
            .setDescription('Link do VOD da Twitch')
            .setRequired(true)
    )
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Atualizando comandos slash...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('Comando slash atualizado!');
  } catch (err) {
    console.error(err);
  }
})();

// ====================== LOGIN ======================
client.login(TOKEN);
