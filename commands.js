import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const commands = [
  new SlashCommandBuilder().setName('balance').setDescription('所持金を確認'),
  new SlashCommandBuilder().setName('daily').setDescription('毎日通貨を受け取る'),
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
  new SlashCommandBuilder().setName('inventory').setDescription('所持アイテムを確認'),
  new SlashCommandBuilder().setName('rich').setDescription('所持金ランキングを見る'),
  new SlashCommandBuilder().setName('help').setDescription('コマンド説明を見る'),
  new SlashCommandBuilder()
    .setName('addmoney')
    .setDescription('通貨を追加（管理者専用）')
    .addUserOption(opt => opt.setName('user').setDescription('ユーザー').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('追加額').setRequired(true)),
  new SlashCommandBuilder()
    .setName('removemoney')
    .setDescription('通貨を減らす（管理者専用）')
    .addUserOption(opt => opt.setName('user').setDescription('ユーザー').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('減らす額').setRequired(true)),
  new SlashCommandBuilder()
    .setName('additem')
    .setDescription('商品を追加（管理者専用）')
    .addStringOption(opt => opt.setName('name').setDescription('商品名').setRequired(true))
    .addIntegerOption(opt => opt.setName('price').setDescription('価格').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('説明').setRequired(false)),
  new SlashCommandBuilder().setName('resetdb').setDescription('データベース初期化（管理者専用）'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('スラッシュコマンドを登録中...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log('登録完了！');
  } catch (error) {
    console.error(error);
  }
})();
