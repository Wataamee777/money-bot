import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { createClient } from '@supabase/supabase-js';

// Supabase 初期化
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Discord Bot 初期化
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Express サーバー起動
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Hello World from Express!'));
app.listen(PORT, () => console.log(`🚀 Express running on port ${PORT}`));

// 管理者判定
function isAdmin(interaction) {
  return interaction.member.permissions.has('Administrator');
}

// コマンド定義
const commands = [
  new SlashCommandBuilder().setName('rich').setDescription('ランキングを見る'),
  new SlashCommandBuilder().setName('daily').setDescription('毎日コインを受け取る'),
  new SlashCommandBuilder().setName('present').setDescription('100コインでランダム報酬'),

  new SlashCommandBuilder()
    .setName('gift')
    .setDescription('他の人にコインを送る')
    .addUserOption(opt => opt.setName('user').setDescription('相手').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('金額').setRequired(true)),

  new SlashCommandBuilder().setName('shop').setDescription('ショップ商品一覧'),
  new SlashCommandBuilder()
    .setName('shopinfo')
    .setDescription('商品詳細を見る')
    .addStringOption(opt => opt.setName('item').setDescription('商品名').setRequired(true)),

  new SlashCommandBuilder()
    .setName('buy')
    .setDescription('商品を購入する')
    .addStringOption(opt => opt.setName('item').setDescription('商品名').setRequired(true))
    .addIntegerOption(opt => opt.setName('quantity').setDescription('数量').setRequired(false)),

  new SlashCommandBuilder().setName('inventory').setDescription('持ち物を確認'),
  new SlashCommandBuilder().setName('help').setDescription('使えるコマンド一覧を見る'),

  // 管理者コマンド
  new SlashCommandBuilder()
    .setName('addmoney')
    .setDescription('通貨を追加（管理者）')
    .addUserOption(opt => opt.setName('user').setDescription('対象').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('額').setRequired(true)),

  new SlashCommandBuilder()
    .setName('removemoney')
    .setDescription('通貨を減らす（管理者）')
    .addUserOption(opt => opt.setName('user').setDescription('対象').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('額').setRequired(true)),

  new SlashCommandBuilder()
    .setName('additem')
    .setDescription('ショップに商品を追加（管理者）')
    .addStringOption(opt => opt.setName('item').setDescription('商品名').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('価格').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('説明').setRequired(false)),

  new SlashCommandBuilder().setName('resetdb').setDescription('全データ初期化（管理者）'),
].map(cmd => cmd.toJSON());

// グローバルコマンド登録
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log('✅ グローバルコマンド登録完了');
}

// コマンド処理
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // JST
  const today = now.toISOString().split('T')[0];

  switch (interaction.commandName) {
    case 'daily': {
      const { data: user } = await supabase.from('users').select('balance, last_daily').eq('user_id', userId).single();
      if (user?.last_daily?.startsWith(today)) return interaction.reply('❌ 今日はもう受け取ってるよ');

      const reward = Math.floor(Math.random() * 41) + 80;
      const newBalance = (user?.balance ?? 0) + reward;
      const update = { user_id: userId, balance: newBalance, last_daily: now.toISOString() };

      await supabase.from('users').upsert(update);
      return interaction.reply(`🎁 デイリー報酬：${reward}コイン`);
    }

    case 'present': {
      const { data: user } = await supabase.from('users').select('balance').eq('user_id', userId).single();
      if (!user || user.balance < 100) return interaction.reply('❌ 100コイン必要だよ');

      const reward = Math.floor(Math.random() * 100) + 0;
      const newBalance = user.balance - 101 + reward;

      await supabase.from('users').update({ balance: newBalance }).eq('user_id', userId);
      return interaction.reply(`🎁 プレゼント報酬：${reward}コイン`);
    }

    case 'gift': {
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      if (target.id === userId) return interaction.reply('❌ 自分には送れないよ');

      const { data: sender } = await supabase.from('users').select('balance').eq('user_id', userId).single();
      if (!sender || sender.balance < amount) return interaction.reply('❌ 残高不足');

      const { data: receiver } = await supabase.from('users').select('balance').eq('user_id', target.id).single();
      await supabase.from('users').upsert({ user_id: target.id, balance: (receiver?.balance ?? 0) + amount });
      await supabase.from('users').update({ balance: sender.balance - amount }).eq('user_id', userId);

      return interaction.reply(`✅ ${target.username} に ${amount} コイン送金したよ`);
    }

case 'shop': {
  const { data: shopItems } = await supabase.from('shop').select('*');
  if (!shopItems || shopItems.length === 0) return interaction.reply('🛒 ショップは空だよ');
  const list = shopItems.map(i => `- ${i.name}（${i.price}コイン）`).join('\n');
  await interaction.reply(`🛍️ 商品一覧：\n${list}`);
}

    case 'shopinfo': {
  const name = interaction.options.getString('item');
  const { data: item } = await supabase.from('shop').select('*').ilike('name', name).single();
  if (!item) return interaction.reply('❌ 商品が見つからないよ');
  await interaction.reply(`📦 ${item.name}\n価格: ${item.price}コイン\n説明: ${item.description || 'なし'}`);
}

    case 'additem': {
      if (!isAdmin(interaction)) return interaction.reply('❌ 管理者専用だよ');
      const name = interaction.options.getString('item');
      const price = interaction.options.getInteger('amount');
      const description = interaction.options.getString('description') || '';

      const { data: exists } = await supabase.from('shop').select('name').eq('name', name).single();
      if (exists) return interaction.reply('❌ 既に存在してる商品だよ');

      await supabase.from('shop').insert([{ name, price, description }]);
      return interaction.reply(`✅ ショップに「${name}」追加`);
    }

    case 'inventory': {
  const userId = interaction.user.id;

  // 所持金取得
  const { data: user } = await supabase
    .from('users')
    .select('balance')
    .eq('user_id', userId)
    .single();

  // アイテム取得（JOINで名前も取る）
  const { data: items } = await supabase
    .from('user_items')
    .select('item_id, quantity, items(name)')
    .eq('user_id', userId);

  const balanceText = `💰 所持金: ${user?.balance ?? 0} コイン`;

  let itemText = '🎒 インベントリ:\n';

  if (!items || items.length === 0) {
    itemText += '（アイテムなし）';
  } else {
    itemText += items
      .map(item => `- ${item.items?.name ?? `ID:${item.item_id}`} ×${item.quantity}`)
      .join('\n');
  }

  await interaction.reply(`${balanceText}\n${itemText}`);
  break;
}


    case 'addmoney': {
      if (!isAdmin(interaction)) return interaction.reply('❌ 管理者専用');
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const { data } = await supabase.from('users').select('balance').eq('user_id', target.id).single();
      await supabase.from('users').upsert({ user_id: target.id, balance: (data?.balance ?? 0) + amount });
      return interaction.reply(`✅ ${target.username} に ${amount} コイン追加`);
    }

    case 'removemoney': {
      if (!isAdmin(interaction)) return interaction.reply('❌ 管理者専用');
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');
      const { data } = await supabase.from('users').select('balance').eq('user_id', target.id).single();
      await supabase.from('users').upsert({ user_id: target.id, balance: Math.max((data?.balance ?? 0) - amount, 0) });
      return interaction.reply(`✅ ${target.username} から ${amount} コイン減額`);
    }

    case 'resetdb': {
      if (!isAdmin(interaction)) return interaction.reply('❌ 管理者専用');
      await supabase.from('users').delete().neq('user_id', '');
      return interaction.reply('🗑️ 全ユーザーデータ削除完了');
    }

    case 'rich': {
      const { data } = await supabase.from('users').select('user_id, balance').order('balance', { ascending: false }).limit(10);
      if (!data?.length) return interaction.reply('❌ ランキングなし');
      const list = await Promise.all(data.map(async (u, i) => {
        try {
          const m = await interaction.guild.members.fetch(u.user_id);
          return `${i + 1}位: ${m.user.username} - ${u.balance}コイン`;
        } catch { return `${i + 1}位: Unknown - ${u.balance}コイン`; }
      }));
      return interaction.reply(`🏆 残高ランキング:\n${list.join('\n')}`);
    }
      
case 'buy': {
  const userId = interaction.user.id;
  const itemName = interaction.options.getString('item');
  const quantity = interaction.options.getInteger('quantity') || 1;

  // 1. ショップから商品取得
  const { data: shopItem, error: shopError } = await supabase
    .from('shop')
    .select('name, price')
    .ilike('name', itemName)
    .single();

  if (shopError || !shopItem) {
    return interaction.reply('❌ 商品が存在しないよ');
  }

  const totalPrice = shopItem.price * quantity;

  // 2. ユーザーの所持金取得
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('balance')
    .eq('user_id', userId)
    .single();

  if (userError || !user || user.balance < totalPrice) {
    return interaction.reply('❌ コインが足りないよ');
  }

  // 3. itemsテーブルから商品IDを取得
  const { data: itemData, error: itemError } = await supabase
    .from('items')
    .select('id')
    .ilike('name', itemName)
    .single();

  if (itemError || !itemData) {
    return interaction.reply('❌ 商品がアイテムマスタに登録されていないよ');
  }

  // 4. user_items に追加 or 数量アップデート
  // 既に所持してるかチェック
  const { data: userItem, error: userItemError } = await supabase
    .from('user_items')
    .select('quantity')
    .eq('user_id', userId)
    .eq('item_id', itemData.id)
    .single();

  if (userItem) {
    // 更新
    await supabase
      .from('user_items')
      .update({ quantity: userItem.quantity + quantity })
      .eq('user_id', userId)
      .eq('item_id', itemData.id);
  } else {
    // 新規挿入
    await supabase
      .from('user_items')
      .insert({ user_id: userId, item_id: itemData.id, quantity });
  }

  // 5. 所持金減らす
  await supabase
    .from('users')
    .update({ balance: user.balance - totalPrice })
    .eq('user_id', userId);

  return interaction.reply(`✅ ${shopItem.name} ×${quantity} を購入したよ！`);
}

    case 'help': {
      return interaction.reply(`
💡 利用できるコマンド:
/daily 
/present 
/gift
/shop
/shopinfo 
/buy
/inventory 
/rich 
/help

🔒 管理者専用:
/addmoney 
/removemoney 
/additem 
/resetdb`);
    }
  }
});

// Bot起動
client.once(Events.ClientReady, () => {
  console.log(`✅ Botログイン成功: ${client.user.tag}`);
});

// 起動
(async () => {
  await registerCommands();
  await client.login(process.env.DISCORD_TOKEN);
})();
