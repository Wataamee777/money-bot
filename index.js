import 'dotenv/config';
import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { createClient } from '@supabase/supabase-js';
import express from 'express';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello World from Express!');
});

app.listen(PORT, () => {
  console.log(`🚀 Expressサーバーがポート${PORT}で起動したよ`);
});

function isAdmin(interaction) {
  return interaction.member.permissions.has('Administrator');
}

const commands = [
  new SlashCommandBuilder().setName('balance').setDescription('所持金を確認'),
  new SlashCommandBuilder().setName('rich').setDescription('ランキングを確認'),
  new SlashCommandBuilder().setName('daily').setDescription('毎日通貨を受け取る'),
  new SlashCommandBuilder().setName('present').setDescription('10コインでランダム報酬をもらう'),
  new SlashCommandBuilder()
    .setName('give')
    .setDescription('他の人に送金')
    .addUserOption(opt => opt.setName('user').setDescription('送金先').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('送金額').setRequired(true)),
  new SlashCommandBuilder().setName('shop').setDescription('商品一覧を見る'),
  new SlashCommandBuilder()
    .setName('shopinfo')
    .setDescription('商品の詳細を見る')
    .addStringOption(opt => opt.setName('item').setDescription('商品名').setRequired(true)),
  new SlashCommandBuilder()
    .setName('buy')
    .setDescription('商品を購入する')
    .addStringOption(opt => opt.setName('item').setDescription('商品名').setRequired(true))
    .addIntegerOption(opt => opt.setName('quantity').setDescription('数量').setRequired(false)),
  new SlashCommandBuilder().setName('inventory').setDescription('持ち物を確認'),
  new SlashCommandBuilder().setName('help').setDescription('コマンド説明を見る'),
  new SlashCommandBuilder()
    .setName('addmoney')
    .setDescription('通貨を追加（管理者）')
    .addUserOption(opt => opt.setName('user').setDescription('対象').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('追加額').setRequired(true)),
  new SlashCommandBuilder()
    .setName('removemoney')
    .setDescription('通貨を減らす（管理者）')
    .addUserOption(opt => opt.setName('user').setDescription('対象').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('減額').setRequired(true)),
  new SlashCommandBuilder()
    .setName('additem')
    .setDescription('アイテム追加（管理者）')
    .addUserOption(opt => opt.setName('user').setDescription('対象').setRequired(true))
    .addStringOption(opt => opt.setName('item').setDescription('アイテム名').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('数量').setRequired(true)),
  new SlashCommandBuilder().setName('resetdb').setDescription('データベース初期化（管理者）'),
].map(cmd => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log('🌍 グローバルコマンドを登録したよ');
}

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = jstNow.toISOString().slice(0, 10);

  switch (interaction.commandName) {

    case 'daily': {
      const { data: user } = await supabase.from('users').select('balance, last_daily').eq('user_id', userId).single();
      if (user?.last_daily === today) return interaction.reply('❌ 今日はもう受け取ってるよ！');

      const reward = Math.floor(Math.random() * 41) + 80;
      const newBalance = (user?.balance ?? 0) + reward;

      if (user) {
        await supabase.from('users').update({ balance: newBalance, last_daily: today }).eq('user_id', userId);
      } else {
        await supabase.from('users').insert({ user_id: userId, balance: reward, last_daily: today });
      }
      await interaction.reply(`🎁 デイリー報酬：${reward}コイン`);
      break;
    }

    case 'present': {
      const { data: user } = await supabase.from('users').select('balance').eq('user_id', userId).single();
      if (!user || user.balance < 10) return interaction.reply('❌ 10コイン必要だよ');

      const reward = Math.floor(Math.random() * 46) + 5;
      const newBalance = user.balance - 10 + reward;

      await supabase.from('users').update({ balance: newBalance }).eq('user_id', userId);
      await interaction.reply(`🎁 10コイン消費 → ${reward}コインゲット！`);
      break;
    }

    case 'give': {
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      if (target.id === userId) return interaction.reply('❌ 自分には送れないよ');

      const { data: sender } = await supabase.from('users').select('balance').eq('user_id', userId).single();
      if (!sender || sender.balance < amount) return interaction.reply('❌ 残高不足だよ');

      const { data: receiver } = await supabase.from('users').select('balance').eq('user_id', target.id).single();
      await supabase.from('users').upsert({ user_id: target.id, balance: (receiver?.balance ?? 0) + amount });
      await supabase.from('users').update({ balance: sender.balance - amount }).eq('user_id', userId);
      await interaction.reply(`✅ ${target.username} に ${amount} コイン送ったよ`);
      break;
    }

    case 'shop': {
      const { data: items } = await supabase.from('shop').select('*');
      if (!items || items.length === 0) return interaction.reply('🛒 ショップは空だよ');
      const list = items.map(i => `- ${i.name}（${i.price}コイン）`).join('\n');
      await interaction.reply(`🛍️ 商品一覧：\n${list}`);
      break;
    }

    case 'shopinfo': {
      const name = interaction.options.getString('item');
      const { data: item } = await supabase.from('shop').select('*').ilike('name', name).single();
      if (!item) return interaction.reply('❌ 商品が見つからないよ');
      await interaction.reply(`📦 ${item.name}\n価格: ${item.price}コイン\n説明: ${item.description || 'なし'}`);
      break;
    }

    case 'buy': {
      const name = interaction.options.getString('item');
      const quantity = interaction.options.getInteger('quantity') || 1;

      const { data: item } = await supabase.from('shop').select('*').ilike('name', name).single();
      if (!item) return interaction.reply('❌ 商品が存在しないよ');

      const { data: user } = await supabase.from('users').select('balance, items').eq('user_id', userId).single();
      if (!user || user.balance < item.price * quantity) {
        return interaction.reply('❌ コイン足りないよ');
      }

      const items = user.items || {};
      items[item.name] = (items[item.name] || 0) + quantity;

      await supabase.from('users')
        .update({ balance: user.balance - item.price * quantity, items })
        .eq('user_id', userId);

      await interaction.reply(`✅ ${item.name} ×${quantity} を購入したよ`);
      break;
    }

    case 'inventory': {
  // ユーザーの所持金とアイテムを一括取得
  const { data: user } = await supabase
    .from('users')
    .select('balance, items')
    .eq('user_id', interaction.user.id)
    .single();

  if (!user) {
    return interaction.reply('🎒 所持金もアイテムも何もないよ！');
  }

  const items = user.items || {};
  const itemList = Object.entries(items)
    .map(([name, qty]) => `- ${name} ×${qty}`)
    .join('\n') || '（アイテムなし）';

  await interaction.reply(
    `💰 所持金: ${user.balance} コイン\n` +
    `🎒 インベントリ:\n${itemList}`
  );
  break;
}
      
    case 'help': {
      await interaction.reply(`
💬 利用可能コマンド：

/daily - 毎日通貨
/present - プレゼント開封
/give - 他ユーザーに送金
/shop - 商品一覧
/shopinfo - 商品の説明
/buy - 商品を買う
/inventory - 所持アイテム
/help - コマンド一覧
/rich - ランキングを表示

管理者用：/addmoney /removemoney /additem /resetdb`);
      break;
    }
      
case 'rich': {
  // ユーザー残高をSupabaseから取得（例: top10）
  const { data: users, error } = await supabase
    .from('users')
    .select('user_id, balance')
    .order('balance', { ascending: false })
    .limit(10);

  if (error || !users || users.length === 0) {
    return interaction.reply('ランキングがありません。');
  }

  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply('ギルド情報が取得できません。');
  }

  // ユーザー名を順に取得
  const lines = [];
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    try {
      const member = await guild.members.fetch(u.user_id);
      const name = member ? member.user.username : 'Unknown';
      lines.push(`${i + 1}位: ${name} - ${u.balance} コイン`);
    } catch {
      // 取得失敗時はUnknownで
      lines.push(`${i + 1}位: Unknown - ${u.balance} コイン`);
    }
  }

  await interaction.reply(`💰 残高ランキング\n` + lines.join('\n'));
  break;
}

    case 'addmoney': {
      if (!isAdmin(interaction)) return interaction.reply('❌ 管理者専用だよ');
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const { data: user } = await supabase.from('users').select('balance').eq('user_id', target.id).single();
      const balance = (user?.balance ?? 0) + amount;
      await supabase.from('users').upsert({ user_id: target.id, balance });
      await interaction.reply(`✅ ${target.username} に ${amount} コイン追加`);
      break;
    }

    case 'removemoney': {
      if (!isAdmin(interaction)) return interaction.reply('❌ 管理者専用だよ');
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const { data: user } = await supabase.from('users').select('balance').eq('user_id', target.id).single();
      const balance = Math.max((user?.balance ?? 0) - amount, 0);
      await supabase.from('users').upsert({ user_id: target.id, balance });
      await interaction.reply(`✅ ${target.username} から ${amount} コイン減額`);
      break;
    }

    case 'additem': {
      if (!isAdmin(interaction)) return interaction.reply('❌ 管理者専用だよ');
      const target = interaction.options.getUser('user');
      const item = interaction.options.getString('item');
      const amount = interaction.options.getInteger('amount');
      const { data: user } = await supabase.from('users').select('items').eq('user_id', target.id).single();
      const items = user?.items || {};
      items[item] = (items[item] || 0) + amount;
      await supabase.from('users').upsert({ user_id: target.id, items });
      await interaction.reply(`✅ ${target.username} に ${item} ×${amount} 追加`);
      break;
    }

    case 'resetdb': {
      if (!isAdmin(interaction)) return interaction.reply('❌ 管理者専用だよ');
      await supabase.from('users').delete().neq('user_id', '');
      await interaction.reply('🗑️ ユーザーデータ初期化完了');
      break;
    }
  }
});

client.once(Events.ClientReady, () => {
  console.log(`✅ ログイン成功: ${client.user.tag}`);
});

(async () => {
  await registerCommands();
  await client.login(process.env.DISCORD_TOKEN);
})();
