import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// 管理者チェック関数
function isAdmin(interaction) {
  return interaction.member.permissions.has('Administrator');
}

// --- コマンド処理 ---
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'balance': {
        const { data: user, error } = await supabase
          .from('users')
          .select('balance')
          .eq('user_id', interaction.user.id)
          .single();

        if (error) throw error;
        const balance = user ? user.balance : 0;
        await interaction.reply(`💰 あなたの所持金は ${balance} コインです`);
        break;
      }

      case 'daily': {
        const now = new Date();
        const { data: user, error } = await supabase
          .from('users')
          .select('balance, last_daily')
          .eq('user_id', interaction.user.id)
          .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (user && user.last_daily) {
          const lastDaily = new Date(user.last_daily);
          if (now - lastDaily < 24 * 60 * 60 * 1000) {
            return interaction.reply('❌ まだ今日のデイリー報酬は受け取れません');
          }
        }

        const reward = Math.floor(Math.random() * 41) + 80; // 80〜120コイン

        if (user) {
          await supabase
            .from('users')
            .update({ balance: user.balance + reward, last_daily: now.toISOString() })
            .eq('user_id', interaction.user.id);
        } else {
          await supabase.from('users').insert({ user_id: interaction.user.id, balance: reward, last_daily: now.toISOString() });
        }

        await interaction.reply(`🎉 デイリー報酬として ${reward} コインを獲得しました！`);
        break;
      }

      case 'give': {
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (targetUser.id === interaction.user.id) {
          return interaction.reply({ content: '❌ 自分に送ることはできません', ephemeral: true });
        }
        if (amount <= 0) return interaction.reply({ content: '❌ 正の数を指定してください', ephemeral: true });

        const { data: giver, error: giverError } = await supabase
          .from('users')
          .select('balance')
          .eq('user_id', interaction.user.id)
          .single();

        if (giverError) throw giverError;
        if (!giver || giver.balance < amount) {
          return interaction.reply({ content: '❌ 所持金が足りません', ephemeral: true });
        }

        // トランザクションのように扱う必要があるが簡易版
        await supabase.from('users').upsert({ user_id: interaction.user.id, balance: giver.balance - amount });
        const { data: receiver, error: receiverError } = await supabase
          .from('users')
          .select('balance')
          .eq('user_id', targetUser.id)
          .single();

        if (receiverError && receiverError.code !== 'PGRST116') throw receiverError;

        if (receiver) {
          await supabase.from('users').update({ balance: receiver.balance + amount }).eq('user_id', targetUser.id);
        } else {
          await supabase.from('users').insert({ user_id: targetUser.id, balance: amount });
        }

        await interaction.reply(`${targetUser.username} に ${amount} コインを送金しました！`);
        break;
      }

      case 'shop': {
        const { data: items, error } = await supabase.from('items').select();
        if (error) throw error;
        if (!items.length) return interaction.reply('🛒 商品はありません');

        const list = items.map(i => `**${i.name}** — ${i.price}コイン`).join('\n');
        await interaction.reply(`🛒 商品一覧:\n${list}`);
        break;
      }

      case 'shopinfo': {
        const itemName = interaction.options.getString('item');
        const { data: items, error } = await supabase.from('items').select().ilike('name', itemName);
        if (error) throw error;
        if (!items.length) return interaction.reply('❌ 商品が見つかりません');

        const item = items[0];
        await interaction.reply(`🛒 **${item.name}**\n価格: ${item.price}コイン\n説明: ${item.description}`);
        break;
      }

      case 'buy': {
        const itemName = interaction.options.getString('item');
        const quantity = interaction.options.getInteger('quantity') ?? 1;
        const userId = interaction.user.id;

        const { data: items, error: itemError } = await supabase.from('items').select().ilike('name', itemName);
        if (itemError) throw itemError;
        if (!items.length) return interaction.reply('❌ 商品が見つかりません');
        const item = items[0];

        const { data: user, error: userError } = await supabase.from('users').select().eq('user_id', userId).single();
        if (userError && userError.code !== 'PGRST116') throw userError;

        const userBalance = user ? user.balance : 0;
        const cost = item.price * quantity;
        if (userBalance < cost) return interaction.reply('❌ 所持金が足りません');

        // 通貨減らす
        await supabase.from('users').upsert({ user_id: userId, balance: userBalance - cost });

        // アイテム付与
        const { data: userItem } = await supabase
          .from('user_items')
          .select()
          .eq('user_id', userId)
          .eq('item_id', item.id)
          .single();

        if (userItem) {
          await supabase
            .from('user_items')
            .update({ quantity: userItem.quantity + quantity })
            .eq('user_id', userId)
            .eq('item_id', item.id);
        } else {
          await supabase.from('user_items').insert({ user_id: userId, item_id: item.id, quantity });
        }

        await interaction.reply(`✅ ${item.name} を ${quantity} 個購入しました。合計 ${cost} コイン支払いました。`);
        break;
      }

      case 'inventory': {
        const userId = interaction.user.id;
        const { data, error } = await supabase
          .from('user_items')
          .select('quantity, items(name)')
          .eq('user_id', userId);

        if (error) throw error;
        if (!data.length) return interaction.reply('🎒 所持アイテムはありません');

        const text = data.map(i => `${i.items.name} ×${i.quantity}`).join('\n');
        await interaction.reply(`🎒 あなたの所持アイテム:\n${text}`);
        break;
      }

      case 'rich': {
        const { data, error } = await supabase
          .from('users')
          .select()
          .order('balance', { ascending: false })
          .limit(10);

        if (error) throw error;
        if (!data.length) return interaction.reply('データがありません');

        const leaderboard = data.map((u, i) => `#${i + 1} <@${u.user_id}> — ${u.balance}コイン`).join('\n');
        await interaction.reply(`💰 所持金ランキング:\n${leaderboard}`);
        break;
      }

      case 'help': {
        const helpText = [
          '**📝 通貨Bot コマンド一覧**',
          '`/balance` - 所持金を見る',
          '`/daily` - 毎日通貨を受け取る',
          '`/give @user amount` - 他の人に送金',
          '`/shop` - 商品一覧を見る',
          '`/buy item [quantity]` - 商品を買う',
          '`/inventory` - 所持アイテムを確認',
          '`/shopinfo item` - 商品詳細を確認',
          '`/rich` - 所持金ランキング',
          '`/help` - この説明を表示',
          '`/addmoney @user amount` - 管理者用 通貨を追加',
          '`/removemoney @user amount` - 管理者用 通貨を減らす',
          '`/additem name price description` - 管理者用 商品追加',
          '`/resetdb` - 管理者用 データベース初期化',
        ].join('\n');
        await interaction.reply({ content: helpText, ephemeral: true });
        break;
      }

      case 'addmoney': {
        if (!isAdmin(interaction)) return interaction.reply({ content: '🚫 管理者専用コマンドです', ephemeral: true });

        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (amount <= 0) return interaction.reply({ content: '❌ 正の数を指定してください', ephemeral: true });

        const { data: user } = await supabase.from('users').select('balance').eq('user_id', target.id).single();

        if (user) {
          await supabase.from('users').update({ balance: user.balance + amount }).eq('user_id', target.id);
        } else {
          await supabase.from('users').insert({ user_id: target.id, balance: amount });
        }
        await interaction.reply(`${target.username} に ${amount} コインを追加しました。`);
        break;
      }

      case 'removemoney': {
        if (!isAdmin(interaction)) return interaction.reply({ content: '🚫 管理者専用コマンドです', ephemeral: true });

        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (amount <= 0) return interaction.reply({ content: '❌ 正の数を指定してください', ephemeral: true });

        const { data: user } = await supabase.from('users').select('balance').eq('user_id', target.id).single();
        if (!user || user.balance < amount) return interaction.reply({ content: '❌ 所持金が足りません', ephemeral: true });

        await supabase.from('users').update({ balance: user.balance - amount }).eq('user_id', target.id);
        await interaction.reply(`${target.username} の通貨を ${amount} コイン減らしました。`);
        break;
      }

      case 'additem': {
        if (!isAdmin(interaction)) return interaction.reply({ content: '🚫 管理者専用コマンドです', ephemeral: true });

        const name = interaction.options.getString('name');
        const price = interaction.options.getInteger('price');
        const description = interaction.options.getString('description') ?? '';

        await supabase.from('items').insert({ name, price, description });
        await interaction.reply(`✅ 商品「${name}」を追加しました（価格: ${price} コイン）`);
        break;
      }

      case 'resetdb': {
        if (!isAdmin(interaction)) return interaction.reply({ content: '🚫 管理者専用コマンドです', ephemeral: true });

        // 注意！ 実運用なら確認を強化すべき
        await supabase.from('users').delete();
        await supabase.from('user_items').delete();
        await supabase.from('items').delete();

        await interaction.reply('⚠️ データベースを初期化しました。');
        break;
      }

      default:
        await interaction.reply('❓ 未実装コマンドです');
    }
  } catch (e) {
    console.error(e);
    interaction.reply({ content: '❌ エラーが発生しました', ephemeral: true });
  }
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
