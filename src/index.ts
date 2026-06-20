import { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  Interaction,
  RoleSelectMenuBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  OverwriteType,
  MessageFlags
} from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const configPath = path.join(process.cwd(), 'config.json');
const productsPath = path.join(process.cwd(), 'products.json');

interface Config {
  allowedRoleId: string | null;
  cartCategoryId: string | null;
  commandChannelId: string | null;
  logsChannelId: string | null;
  finalizedCount?: number;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  stock: string;
  imageUrl?: string;
}

// Carrega as configurações do arquivo JSON
function loadConfig(): Config {
  // IDs padrão (fallback caso config.json não exista na hospedagem)
  const DEFAULT_CART_CATEGORY_ID = '1509362153629552730';
  const DEFAULT_COMMAND_CHANNEL_ID = '1507879967684559040';
  const DEFAULT_ALLOWED_ROLE_ID = '1509221837094256772';

  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed.finalizedCount === undefined) {
        parsed.finalizedCount = 0;
      }
      // Se os valores estiverem nulos no arquivo, usa os defaults
      if (!parsed.cartCategoryId) parsed.cartCategoryId = DEFAULT_CART_CATEGORY_ID;
      if (!parsed.commandChannelId) parsed.commandChannelId = DEFAULT_COMMAND_CHANNEL_ID;
      if (!parsed.allowedRoleId) parsed.allowedRoleId = DEFAULT_ALLOWED_ROLE_ID;
      return parsed;
    }
  } catch (error) {
    console.error('[ERRO] Falha ao ler config.json, usando padrão vazio:', error);
  }
  return { 
    allowedRoleId: DEFAULT_ALLOWED_ROLE_ID,
    cartCategoryId: DEFAULT_CART_CATEGORY_ID,
    commandChannelId: DEFAULT_COMMAND_CHANNEL_ID,
    logsChannelId: null,
    finalizedCount: 0
  };
}

// Salva as configurações no arquivo JSON
function saveConfig(config: Config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('[ERRO] Falha ao escrever em config.json:', error);
  }
}

// Carrega a lista de produtos salvos
function loadProducts(): Product[] {
  try {
    if (fs.existsSync(productsPath)) {
      const data = fs.readFileSync(productsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[ERRO] Falha ao ler products.json, retornando lista vazia:', error);
  }
  return [];
}

// Salva a lista de produtos no arquivo JSON
function saveProducts(products: Product[]) {
  try {
    fs.writeFileSync(productsPath, JSON.stringify(products, null, 2), 'utf-8');
  } catch (error) {
    console.error('[ERRO] Falha ao escrever em products.json:', error);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const PREFIX = process.env.PREFIX || '!';

client.once('ready', async () => {
  console.log(`\x1b[32m[BOT] Conectado com sucesso como ${client.user?.tag}!\x1b[0m`);
  
  // Registrar os comandos slash /setuploja, /ticket, /finalizar e /estatisticas
  try {
    const commands = [
      {
        name: 'setuploja',
        description: 'Configura o painel de atendimento/tickets da loja no canal selecionado.',
      },
      {
        name: 'ticket',
        description: 'Configura o painel de atendimento/tickets da loja no canal selecionado.',
      },
      {
        name: 'finalizar',
        description: 'Finaliza o ticket de encomenda atual, envia DM pedindo feedback e fecha o canal.',
      },
      {
        name: 'estatisticas',
        description: 'Mostra estatísticas do bot, incluindo quantidade de tickets finalizados.',
      },
      {
        name: 'confiavel',
        description: 'Exibe informações sobre por que comprar com a Dark Studio.',
      },
      {
        name: 'portifolio',
        description: 'Envia um item para o portfólio no canal atual.',
        options: [
          {
            name: 'titulo',
            description: 'O título do item de portfólio',
            type: 3, // STRING
            required: true
          },
          {
            name: 'descricao',
            description: 'A descrição do item de portfólio',
            type: 3, // STRING
            required: true
          },
          {
            name: 'foto',
            description: 'Envie a imagem local do item de portfólio',
            type: 11, // ATTACHMENT
            required: true
          }
        ]
      },
      {
        name: 'termos',
        description: 'Exibe os termos de serviço da Dark Studio.'
      }
    ];
    await client.application?.commands.set(commands);
    console.log('[BOT] Comandos slash (/setuploja, /ticket, /finalizar, /estatisticas, /confiavel, /portifolio e /termos) registrados com sucesso!');
  } catch (error) {
    console.error('[ERRO] Falha ao registrar comandos slash:', error);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  if (command === 'start') {
    const config = loadConfig();
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
    
    const hasAllowedRole = config.allowedRoleId 
      ? message.member?.roles.cache.has(config.allowedRoleId) 
      : false;

    // Se houver cargo configurado, apenas membros com esse cargo ou admins podem rodar
    if (config.allowedRoleId && !hasAllowedRole && !isAdmin) {
      try {
        await message.reply({
          content: `❌ Apenas membros com o cargo <@&${config.allowedRoleId}> ou Administradores podem usar o bot.`
        });
      } catch (error) {
        console.error('[ERRO] Falha ao responder bloqueio de permissão:', error);
      }
      return;
    }

    // Painel premium (Embed estruturado com cores elegantes e emojis)
    const embed = new EmbedBuilder()
      .setColor('#5865F2') // Blurple do Discord
      .setTitle('🛒 Painel de Vendas & Gerenciamento')
      .setDescription(
        'Olá! Bem-vindo ao painel de controle principal do seu bot de vendas.\n' +
        'Escolha uma das ações abaixo clicando nos respectivos botões:\n\n' +
        '📦 **Adicionar produtos:** Cadastre novos itens em estoque.\n' +
        '🔑 **Adicionar chave:** Vincule chaves de acesso aos produtos.\n' +
        '🛒 **Produtos:** Veja a lista completa de produtos cadastrados.\n' +
        '🚀 **Lançar produto:** Anuncie um produto em um canal de texto.\n' +
        '🛡️ **Permissões:** Configure os cargos e permissões do bot.\n' +
        '⚙️ **Canais:** Configure a categoria de carrinho e canais de comando e logs.'
      )
      .setThumbnail(message.guild?.iconURL() || client.user?.displayAvatarURL() || null)
      .setTimestamp()
      .setFooter({ 
        text: `Solicitado por ${message.author.tag}`, 
        iconURL: message.author.displayAvatarURL() 
      });

    // Dividimos os 6 botões em 2 linhas de componentes para respeitar o limite de 5 botões do Discord por Action Row
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('add_product')
        .setLabel('Adicionar produtos')
        .setEmoji('📦')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('add_key')
        .setLabel('Adicionar chave')
        .setEmoji('🔑')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('list_products')
        .setLabel('Produtos')
        .setEmoji('🛒')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('launch_product')
        .setLabel('Lançar produto')
        .setEmoji('🚀')
        .setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('permissions')
        .setLabel('Permissões')
        .setEmoji('🛡️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('channels_config')
        .setLabel('Canais')
        .setEmoji('⚙️')
        .setStyle(ButtonStyle.Primary)
    );

    try {
      await message.reply({
        embeds: [embed],
        components: [row1, row2]
      });
    } catch (error) {
      console.error('[ERRO] Falha ao enviar painel:', error);
    }
  }
});

client.on('interactionCreate', async (interaction: Interaction) => {
  // Trata comandos Slash (/setuploja ou /ticket)
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    if (commandName === 'setuploja' || commandName === 'ticket') {
      try {
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
        const config = loadConfig();
        const hasAllowedRole = config.allowedRoleId
          ? (interaction.member?.roles as any).cache.has(config.allowedRoleId)
          : false;

        // Apenas Administradores ou quem tem o cargo permitido podem configurar a loja
        if (!isAdmin && (!config.allowedRoleId || !hasAllowedRole)) {
          await interaction.reply({
            content: '❌ Apenas administradores do servidor ou membros com o cargo configurado podem usar este comando.',
            ephemeral: true
          });
          return;
        }

        // Criar o menu de seleção de canal
        const channelSelect = new ChannelSelectMenuBuilder()
          .setCustomId(`setup_ticket_channel_select:${commandName}`)
          .setPlaceholder('Selecione o canal para enviar o painel...')
          .setChannelTypes([ChannelType.GuildText]);

        const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);

        await interaction.reply({
          content: '⚙️ **Configuração do Painel de Atendimento**\nSelecione abaixo em qual canal deseja enviar o painel:',
          components: [row],
          ephemeral: true
        });
      } catch (error) {
        console.error('[ERRO] Falha ao tratar comando slash:', error);
      }
      return;
    }

    if (commandName === 'finalizar') {
      try {
        const requiredRoleId = '1509221837094256772';
        const memberRoles = interaction.member?.roles;
        const hasRole = memberRoles && (memberRoles as any).cache.has(requiredRoleId);

        if (!hasRole) {
          await interaction.reply({
            content: `❌ Apenas membros com o cargo <@&${requiredRoleId}> podem usar este comando.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const channel = interaction.channel;
        if (!channel || !channel.isTextBased() || !('name' in channel)) {
          await interaction.reply({
            content: '❌ Este comando só pode ser utilizado dentro de um canal de ticket de encomenda (iniciando com "ticket-").',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const channelName = (channel as any).name as string | undefined;
        if (!channelName || !channelName.startsWith('ticket-')) {
          await interaction.reply({
            content: '❌ Este comando só pode ser utilizado dentro de um canal de ticket de encomenda (iniciando com "ticket-").',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Deferir a resposta pois as operações subsequentes (fetch e envio de DM) podem demorar mais de 3 segundos
        await interaction.deferReply();

        // Tentar identificar o dono do ticket
        let ticketOwnerId: string | null = null;
        
        // 1. Procurar nas permissões do canal
        const memberOverwrite = (channel as any).permissionOverwrites.cache.find(
          (o: any) => o.type === OverwriteType.Member && o.id !== client.user?.id
        );
        if (memberOverwrite) {
          ticketOwnerId = memberOverwrite.id;
        }

        // 2. Extrair do nome do canal (ex: ticket-banner-nomeusuario)
        const parts = channelName.split('-');
        const username = parts[parts.length - 1];

        let ownerUser = null;
        if (ticketOwnerId) {
          try {
            ownerUser = await client.users.fetch(ticketOwnerId);
          } catch (err) {
            console.error('[ERRO] Falha ao buscar usuário pelo ID do overwrite:', err);
          }
        }

        if (!ownerUser && username) {
          try {
            const member = interaction.guild?.members.cache.find((m: any) => m.user.username === username);
            if (member) ownerUser = member.user;
          } catch (err) {
            console.error('[ERRO] Falha ao buscar usuário pelo nome do canal:', err);
          }
        }

        // Enviar mensagem no privado do dono do ticket pedindo feedback
        if (ownerUser) {
          try {
            const feedbackEmbed = new EmbedBuilder()
              .setColor('#5865F2')
              .setTitle('🖤 Dark Studio | Encomenda Finalizada!')
              .setDescription(
                `Olá **${ownerUser.username}**!\n\n` +
                `Sua encomenda no canal **#${channelName}** foi finalizada pela nossa equipe.\n\n` +
                `Gostaríamos muito de saber como foi sua experiência! Por favor, responda a esta mensagem deixando o seu feedback or avaliação. Seu feedback é muito importante para nós! ⭐`
              )
              .setTimestamp();
            
            await ownerUser.send({ embeds: [feedbackEmbed] });
          } catch (dmError) {
            console.error(`[AVISO] Não foi possível enviar DM para o usuário ${ownerUser.tag}:`, dmError);
          }
        }

        // Salvar a estatística
        const config = loadConfig();
        config.finalizedCount = (config.finalizedCount || 0) + 1;
        saveConfig(config);

        await interaction.editReply({
          content: `🔒 **Ticket Finalizado!**\nO cliente foi notificado no privado para deixar feedback.\nEste canal será encerrado e deletado em 5 segundos.`
        });

        setTimeout(async () => {
          try {
            await channel.delete();
          } catch (err) {
            console.error('[ERRO] Falha ao deletar canal do ticket finalizado:', err);
          }
        }, 5000);

      } catch (error) {
        console.error('[ERRO] Falha ao executar comando /finalizar:', error);
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              content: '❌ Ocorreu um erro ao tentar finalizar este ticket.'
            });
          } else {
            await interaction.reply({
              content: '❌ Ocorreu um erro ao tentar finalizar este ticket.',
              flags: MessageFlags.Ephemeral
            });
          }
        } catch (replyError) {
          console.error('[ERRO] Falha ao responder após erro:', replyError);
        }
      }
      return;
    }

    if (commandName === 'estatisticas') {
      try {
        const config = loadConfig();
        const count = config.finalizedCount || 0;
        const totalProducts = loadProducts().length;

        const statsEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('📊 Estatísticas do Bot')
          .setDescription('Aqui estão as estatísticas gerais do bot de vendas e atendimento:')
          .addFields(
            { name: '🏆 Encomendas Finalizadas', value: `\`${count}\` ticket(s) finalizado(s)`, inline: true },
            { name: '🛒 Produtos Cadastrados', value: `\`${totalProducts}\` produto(s)`, inline: true }
          )
          .setTimestamp();

        await interaction.reply({
          embeds: [statsEmbed]
        });
      } catch (error) {
        console.error('[ERRO] Falha ao executar comando /estatisticas:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao buscar as estatísticas.',
          ephemeral: true
        });
      }
      return;
    }

    if (commandName === 'confiavel') {
      try {
        const member = interaction.member;
        const isGuildOwner = interaction.guild?.ownerId === interaction.user.id;
        const hasOwnerRole = member && (member.roles as any).cache.some(
          (role: any) => role.name.toLowerCase() === 'owner'
        );

        if (!hasOwnerRole && !isGuildOwner) {
          await interaction.reply({
            content: '❌ Apenas membros com o cargo **Owner** podem usar este comando.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor('#5865F2') // Blurple elegante
          .setTitle('🖤 Por que Comprar com a Dark Studio?')
          .setDescription(
            'Desenvolvemos projetos exclusivos com o máximo de profissionalismo e qualidade. Conheça nossos pilares:\n\n' +
            '📧 **Envio com Qualidade Máxima por E-mail**\n' +
            'Todos os arquivos finais são enviados diretamente para o seu e-mail. Isso evita a compressão padrão do Discord, garantindo que suas artes mantenham a resolução máxima, cores originais e todos os detalhes impecáveis.\n\n' +
            '🤝 **Atendimento e Suporte ao Cliente**\n' +
            'Oferecemos um suporte humanizado, rápido e atencioso. Acompanhamos você durante todo o processo de criação e realizamos os ajustes necessários para que o design final supere suas expectativas.\n\n' +
            '🛡️ **Transparência e Segurança**\n' +
            'Sua segurança e confiança são nossa prioridade. Você recebe atualizações constantes sobre o andamento da sua encomenda, com processos de pagamento transparentes e entrega 100% garantida.\n\n' +
            '⚡ **Eficiência Operacional**\n' +
            'Unimos agilidade técnica a um cronograma rigoroso. Seus projetos são entregues pontualmente dentro do prazo acordado, sem nunca comprometer o padrão de qualidade premium da Dark Studio.'
          )
          .setThumbnail(interaction.guild?.iconURL() || client.user?.displayAvatarURL() || null)
          .setTimestamp()
          .setFooter({ 
            text: 'Dark Studio 🖤 Excelência em Design', 
            iconURL: client.user?.displayAvatarURL() || undefined 
          });

        const channelUrl = `https://discord.com/channels/${interaction.guild?.id}/1509310789985505350`;
        const buyButton = new ButtonBuilder()
          .setLabel('Comprar Agora')
          .setStyle(ButtonStyle.Link)
          .setURL(channelUrl)
          .setEmoji('🛒');

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buyButton);

        await interaction.reply({
          embeds: [embed],
          components: [row]
        });
      } catch (error) {
        console.error('[ERRO] Falha ao executar comando /confiavel:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao processar o comando.',
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    if (commandName === 'portifolio') {
      try {
        const member = interaction.member;
        const isGuildOwner = interaction.guild?.ownerId === interaction.user.id;
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
        const hasOwnerRole = member && (member.roles as any).cache.some(
          (role: any) => role.name.toLowerCase() === 'owner'
        );

        if (!hasOwnerRole && !isGuildOwner && !isAdmin) {
          await interaction.reply({
            content: '❌ Apenas membros com o cargo **Owner** ou Administradores podem usar este comando.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const titulo = interaction.options.getString('titulo', true);
        const descricao = interaction.options.getString('descricao', true);
        const fotoAttachment = interaction.options.getAttachment('foto', true);

        const embed = new EmbedBuilder()
          .setColor('#5865F2') // Blurple elegante
          .setTitle(titulo)
          .setDescription(descricao)
          .setImage(fotoAttachment.url)
          .setTimestamp()
          .setFooter({ 
            text: 'Dark Studio 🖤 Portfólio', 
            iconURL: client.user?.displayAvatarURL() || undefined 
          });

        const channelUrl = `https://discord.com/channels/${interaction.guild?.id}/1509310789985505350`;
        const buyButton = new ButtonBuilder()
          .setLabel('Comprar Agora')
          .setStyle(ButtonStyle.Link)
          .setURL(channelUrl)
          .setEmoji('🛒');

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buyButton);

        await interaction.reply({
          embeds: [embed],
          components: [row]
        });
      } catch (error) {
        console.error('[ERRO] Falha ao executar comando /portifolio:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao processar o comando.',
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    if (commandName === 'termos') {
      try {
        const requiredRoleId = '1509221837094256772';
        const memberRoles = interaction.member?.roles;
        const hasRole = memberRoles && (memberRoles as any).cache.has(requiredRoleId);

        if (!hasRole) {
          await interaction.reply({
            content: `❌ Apenas membros com o cargo <@&${requiredRoleId}> podem usar este comando.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🖤 Termos de Serviço - Dark Studio')
          .setDescription(
`1. ** Forma de Pagamento **
O pagamento é realizado em duas etapas:
50% do valor total antes do início do projeto;
50% restantes após a entrega do projeto.
O desenvolvimento do pedido será iniciado somente após a confirmação do pagamento da entrada.
O cliente compromete-se a realizar o pagamento da segunda parcela após a entrega do serviço.

2. ** Prazo de Entrega **
O prazo padrão para entrega é de até 1 (um) dia útil, contado a partir da confirmação do pagamento inicial.
O período destinado às revisões solicitadas pelo cliente não está incluído nesse prazo.
O prazo poderá ser prorrogado em situações excepcionais, sendo o cliente devidamente informado.

3. ** Revisões **
O cliente terá direito às revisões acordadas no momento da compra.
Alterações que modifiquem significativamente a proposta inicial poderão ser tratadas como um novo serviço e sujeitas a cobrança adicional.
O tempo necessário para as revisões não faz parte do prazo original de entrega.

4. ** Cancelamentos e Reembolsos **
Antes do início do projeto

O cliente poderá solicitar o cancelamento e receber reembolso integral.

Após o início do projeto

Caso o serviço já tenha sido iniciado, poderá ser retido valor proporcional ao trabalho já executado, conforme a legislação aplicável.

Após a entrega do projeto

Por se tratar de serviço digital personalizado, não haverá reembolso após a entrega, salvo nas hipóteses previstas em lei.

5. ** Direito de Arrependimento **

Nos termos do artigo 49 do Código de Defesa do Consumidor, em contratações realizadas à distância, o cliente poderá exercer o direito de arrependimento em até 7 dias.

Caso a execução do serviço tenha sido iniciada com autorização do cliente, poderá ser cobrado o valor correspondente ao trabalho já realizado.

6. ** Direitos de Uso **
Os direitos de utilização do material são transferidos ao cliente após a quitação integral do serviço.
A Dark Studio poderá exibir os trabalhos em portfólio e divulgações, salvo acordo em contrário.

7. ** Conduta **

A Dark Studio poderá recusar atendimento ou encerrar negociações em caso de:

Ofensas ou ameaças;
Tentativas de fraude;
Assédio ou comportamento abusivo;
Descumprimento destes termos.

8. ** Limitação de Responsabilidade **

A Dark Studio não garante resultados financeiros, crescimento em plataformas ou qualquer desempenho específico decorrente do uso dos materiais produzidos.

9. ** Legislação Aplicável **

Estes termos são regidos pelas leis da República Federativa do Brasil, especialmente pelo Código Civil e pelo Código de Defesa do Consumidor.`
          )
          .setThumbnail(interaction.guild?.iconURL() || client.user?.displayAvatarURL() || null)
          .setTimestamp()
          .setFooter({ 
            text: 'Dark Studio 🖤 Termos de Serviço', 
            iconURL: client.user?.displayAvatarURL() || undefined 
          });

        await interaction.reply({
          embeds: [embed]
        });
      } catch (error) {
        console.error('[ERRO] Falha ao executar comando /termos:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao processar o comando.',
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }
  }

  // Trata cliques nos botões
  if (interaction.isButton()) {
    const customId = interaction.customId;

    try {
      const config = loadConfig();
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      
      const hasAllowedRole = config.allowedRoleId 
        ? (interaction.member?.roles as any).cache.has(config.allowedRoleId)
        : false;

      // Trata botão de fechar ticket
      if (customId === 'close_ticket') {
        await interaction.reply({
          content: '🔒 **Ticket sendo encerrado...**\nEste canal será deletado em 5 segundos.'
        });
        setTimeout(async () => {
          try {
            await interaction.channel?.delete();
          } catch (err) {
            console.error('[ERRO] Falha ao deletar canal do ticket:', err);
          }
        }, 5000);
        return;
      }

      // Trata o botão "Abrir Ticket" geral do /ticket
      if (customId === 'open_general_ticket') {
        const guild = interaction.guild;
        if (!guild) return;

        // Verifica se o usuário já possui um ticket aberto
        const existingTicket = guild.channels.cache.find(
          (ch) => ch.name.startsWith('ticket-') && ch.name.endsWith(`-${interaction.user.username}`)
        );

        if (existingTicket) {
          await interaction.reply({
            content: `❌ Você já possui um ticket aberto em <#${existingTicket.id}>! Feche o ticket atual antes de abrir outro.`,
            ephemeral: true
          });
          return;
        }

        // Categoria onde o ticket será criado
        const parentCategory = config.cartCategoryId || '1509362153629552730';
        const channelName = `ticket-suporte-${interaction.user.username}`;

        // Criar canal privado de ticket
        const ticketChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: parentCategory,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
              ]
            },
            {
              id: client.user!.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
              ]
            },
            ...(config.allowedRoleId ? [
              {
                id: config.allowedRoleId,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory,
                  PermissionFlagsBits.AttachFiles,
                  PermissionFlagsBits.EmbedLinks
                ]
              }
            ] : [])
          ]
        });

        // Enviar mensagem de boas-vindas
        const welcomeEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🎫 Atendimento - Suporte')
          .setDescription(
            `Olá <@${interaction.user.id}>, bem-vindo ao seu atendimento!\n\n` +
            `Aguarde um momento enquanto nossa equipe se prepara para lhe atender.\n` +
            `Para agilizar o atendimento, você já pode descrever os detalhes do seu pedido ou dúvida.`
          )
          .setTimestamp();

        const closeButton = new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Fechar Ticket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton);

        await ticketChannel.send({
          content: `<@${interaction.user.id}>`,
          embeds: [welcomeEmbed],
          components: [row]
        });

        await interaction.reply({
          content: `✅ Seu ticket foi aberto com sucesso em <#${ticketChannel.id}>!`,
          ephemeral: true
        });
        return;
      }

      // Trata cliques no botão "Confirmar Pagamento" de dentro do carrinho
      if (customId.startsWith('confirm_payment:')) {
        await interaction.reply({
          content: '✅ **Confirmação Enviada!**\nPor favor, envie o comprovante (print/imagem) do pagamento neste chat. Nossa equipe irá analisar e entregar seu produto.',
        });
        return;
      }

      // Trata cliques no botão "Fechar Carrinho" de dentro do carrinho
      if (customId === 'close_cart') {
        await interaction.reply({
          content: '❌ **Carrinho sendo encerrado...**\nEste canal será deletado em 5 segundos.'
        });
        setTimeout(async () => {
          try {
            await interaction.channel?.delete();
          } catch (err) {
            console.error('[ERRO] Falha ao deletar canal do carrinho:', err);
          }
        }, 5000);
        return;
      }

      // Trata botão de comprar (criação do canal do carrinho sob a categoria configurada)
      if (customId.startsWith('buy_prod:')) {
        const productId = customId.split(':')[1];
        const product = loadProducts().find(p => p.id === productId);

        if (!product) {
          await interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });
          return;
        }

        // Verifica se a categoria do carrinho está configurada
        if (!config.cartCategoryId) {
          await interaction.reply({
            content: '❌ A **categoria de carrinho** não foi configurada pelos administradores ainda!',
            ephemeral: true
          });
          return;
        }

        const guild = interaction.guild;
        if (!guild) return;

        // Limita o nome para os padrões permitidos do Discord
        const channelName = `🛒carrinho-${interaction.user.username}`;

        // Cria o canal privado na categoria configurada
        const cartChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: config.cartCategoryId,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
              ]
            },
            {
              id: client.user!.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
              ]
            }
          ]
        });

        // Envia menção e instruções de pagamento
        await cartChannel.send({
          content: `Olá <@${interaction.user.id}>! Seu carrinho foi criado com sucesso.`
        });

        const paymentEmbed = new EmbedBuilder()
          .setColor('#57F287') // Verde do Discord
          .setTitle('🛒 Instruções de Pagamento')
          .setDescription(
            `Você iniciou a compra do produto: **${product.name}**\n` +
            `💵 **Preço:** ${product.price}\n\n` +
            `**💳 COMO PAGAR:**\n` +
            `Utilize a chave PIX Copia e Cola abaixo para realizar a transferência:\n` +
            `\`\`\`txt\n00020101021126580014br.gov.bcb.pix0136suachavepixaqui520400005303986540529.905802BR5913Nome do Bot6009Sao Paulo62070503***63041A2D\n\`\`\`\n` +
            `*Após realizar a transferência, clique no botão **Confirmar Pagamento** abaixo e envie o comprovante (print) no chat.*`
          )
          .setTimestamp();

        if (product.imageUrl && product.imageUrl.startsWith('http')) {
          paymentEmbed.setThumbnail(product.imageUrl);
        }

        const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`confirm_payment:${product.id}`)
            .setLabel('Confirmar Pagamento')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('close_cart')
            .setLabel('Fechar Carrinho')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
        );

        await cartChannel.send({
          embeds: [paymentEmbed],
          components: [controlRow]
        });

        // Confirmação efêmera no canal de origem
        await interaction.reply({
          content: `✅ Seu carrinho foi aberto com sucesso em <#${cartChannel.id}>!`,
          ephemeral: true
        });
        return;
      }

      // Botões administrativos restritos ao Administrador
      if (customId === 'permissions' || customId === 'channels_config') {
        if (!isAdmin) {
          await interaction.reply({ 
            content: '❌ Apenas administradores do servidor podem acessar esta configuração!', 
            ephemeral: true 
          });
          return;
        }

        // Exibe o painel de Permissões
        if (customId === 'permissions') {
          const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('select_allowed_role')
            .setPlaceholder('Selecione o cargo permitido...')
            .setMinValues(1)
            .setMaxValues(1);

          const selectRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect);

          await interaction.reply({
            content: '🛡️ **Configuração de Permissões**\nSelecione abaixo qual cargo terá permissão para utilizar o bot (Administradores sempre terão acesso):',
            components: [selectRow],
            ephemeral: true
          });
          return;
        }

        // Exibe o painel de Canais (com categoria carrinho)
        if (customId === 'channels_config') {
          const channelEmbed = new EmbedBuilder()
            .setColor('#5865F2') // Blurple do Discord
            .setTitle('⚙️ Configurações de Canais')
            .setDescription(
              'Escolha abaixo qual tipo de categoria ou canal deseja configurar no bot:\n\n' +
              '📁 **categoria carrinho:** Categoria onde serão abertos os canais de carrinho.\n' +
              '💻 **canal comando:** Canal reservado para execução de comandos do bot.\n' +
              '📝 **Canal logs:** Canal para registro de logs de vendas e ações.'
            )
            .setTimestamp();

          const channelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId('config_chan:cart_category')
              .setLabel('categoria carrinho')
              .setEmoji('📁')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('config_chan:command')
              .setLabel('canal comando')
              .setEmoji('💻')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('config_chan:logs')
              .setLabel('Canal logs')
              .setEmoji('📝')
              .setStyle(ButtonStyle.Primary)
          );

          await interaction.reply({
            embeds: [channelEmbed],
            components: [channelRow],
            ephemeral: true
          });
          return;
        }
      }

      // Outros botões (Adicionar produtos, Adicionar chave, Produtos, Lançar produto) requerem o cargo permitido ou Admin
      if (config.allowedRoleId && !hasAllowedRole && !isAdmin) {
        await interaction.reply({ 
          content: '❌ Você não possui o cargo necessário para utilizar esta função.', 
          ephemeral: true 
        });
        return;
      }

      // Exibe o Modal para adicionar produto
      if (customId === 'add_product') {
        const modal = new ModalBuilder()
          .setCustomId('add_product_modal')
          .setTitle('Adicionar Produto');

        const nameInput = new TextInputBuilder()
          .setCustomId('product_name')
          .setLabel('Nome')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Digite o nome do produto')
          .setRequired(true);

        const descInput = new TextInputBuilder()
          .setCustomId('product_description')
          .setLabel('Descrição')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Digite a descrição do produto')
          .setRequired(true);

        const priceInput = new TextInputBuilder()
          .setCustomId('product_price')
          .setLabel('Preço')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: R$ 10,00 ou 10.00')
          .setRequired(true);

        const stockInput = new TextInputBuilder()
          .setCustomId('product_stock')
          .setLabel('ESTOQUE (se for infinito *)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Digite a quantidade de estoque ou *')
          .setRequired(true);

        const imageInput = new TextInputBuilder()
          .setCustomId('product_image')
          .setLabel('URL da Imagem (Opcional)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://site.com/imagem.png')
          .setRequired(false);

        const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
        const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descInput);
        const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput);
        const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(stockInput);
        const row5 = new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput);

        modal.addComponents(row1, row2, row3, row4, row5);

        await interaction.showModal(modal);
        return;
      }

      if (customId === 'add_key') {
        await interaction.reply({ content: '🔑 **Adicionar chave** selecionado! (Ação de gerenciamento a ser implementada)', ephemeral: true });
        return;
      }

      // Exibe menu para escolher produto a ser lançado
      if (customId === 'launch_product') {
        const products = loadProducts();

        if (products.length === 0) {
          await interaction.reply({ 
            content: '❌ Nenhum produto cadastrado para lançar! Use **Adicionar produtos** primeiro.', 
            ephemeral: true 
          });
          return;
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('select_launch_product')
          .setPlaceholder('Escolha o produto que deseja lançar...');

        products.forEach((prod) => {
          selectMenu.addOptions({
            label: prod.name.substring(0, 100),
            description: `Preço: ${prod.price} | Estoque: ${prod.stock === '*' ? 'Infinito' : prod.stock}`.substring(0, 100),
            value: prod.id
          });
        });

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        await interaction.reply({
          content: '🚀 **Lançamento de Produto - Passo 1**\nSelecione abaixo qual produto você deseja anunciar:',
          components: [row],
          ephemeral: true
        });
        return;
      }

      // Lista os produtos de forma estruturada e dinâmica
      if (customId === 'list_products') {
        const products = loadProducts();

        if (products.length === 0) {
          await interaction.reply({ 
            content: '🛒 **Produtos Cadastrados**\nNenhum produto cadastrado no momento. Use o botão **Adicionar produtos** para cadastrar!', 
            ephemeral: true 
          });
          return;
        }

        const embeds: EmbedBuilder[] = [];
        
        products.slice(0, 10).forEach((prod, index) => {
          const stockText = prod.stock === '*' ? 'Infinito (∞)' : `${prod.stock} unidades`;
          
          const embed = new EmbedBuilder()
            .setColor('#FEE75C') // Amarelo Dourado
            .setTitle(`📦 ${index + 1}. ${prod.name}`)
            .setDescription(
              `**Descrição:** ${prod.description}\n` +
              `**Preço:** ${prod.price}\n` +
              `**Estoque:** ${stockText}`
            );

          if (prod.imageUrl && prod.imageUrl.startsWith('http')) {
            embed.setImage(prod.imageUrl);
          }

          embeds.push(embed);
        });

        await interaction.reply({
          embeds: embeds,
          ephemeral: true
        });
        return;
      }

      // Trata cliques nos botões de configuração de canais secundários
      if (customId.startsWith('config_chan:')) {
        const channelType = customId.split(':')[1];
        const displayType = channelType === 'cart_category' ? 'categoria carrinho' : channelType === 'command' ? 'comando' : 'logs';
        const typeLimit = channelType === 'cart_category' ? [ChannelType.GuildCategory] : [ChannelType.GuildText];

        const channelSelect = new ChannelSelectMenuBuilder()
          .setCustomId(`select_chan_type:${channelType}`)
          .setPlaceholder(`Selecione a ${displayType}...`)
          .setChannelTypes(typeLimit);

        const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);

        await interaction.update({
          content: `⚙️ **Configuração do/da ${displayType}**\nSelecione abaixo a opção correspondente no servidor:`,
          embeds: [],
          components: [row]
        });
        return;
      }

    } catch (error) {
      console.error('[ERRO] Falha ao tratar interação do botão:', error);
    }
  }

  // Trata a seleção de canal de configuração
  if (interaction.isChannelSelectMenu()) {
    const customId = interaction.customId;

    if (customId.startsWith('setup_ticket_channel_select')) {
      try {
        const commandName = customId.split(':')[1] || 'setuploja';
        const channelId = interaction.values[0];

        // Abrir um modal para o usuário inserir o texto
        const modal = new ModalBuilder()
          .setCustomId(`setup_ticket_modal:${commandName}:${channelId}`)
          .setTitle('Texto do Painel de Tickets');

        // Texto padrão baseado na imagem de referência
        const defaultText = `Dark Studio 🖤 | Atendimento
Peça sua arte aqui!
Sobre a Dark Studio
Seja bem-vindo(a) à Dark Studio — um estúdio de design criativo focado em transformar ideias em identidades visuais que chamam atenção e geram impacto.
Aqui, cada projeto é pensado com estratégia, consistência e estilo. Nosso objetivo é simples: fazer você se destacar — no Discord, YouTube, Twitch ou em qualquer plataforma onde sua marca esteja presente.

O que fazemos?
Banners profissionais
Logos personalizadas
Gifs impressionantes
Thumbnails exclusivas
Edição de vídeos
Artes completas para servidores, criadores e marcas

Criamos designs que comunicam valor, fortalecem sua presença e elevam sua imagem. Com entrega ágil, comunicação clara e padrão visual alto.

Atendimento
Cada cliente é tratado com prioridade, cuidado e atenção aos detalhes. Estamos prontos para te orientar, lapidar sua ideia e entregar uma arte que realmente impressiona.

Sua identidade visual começa já!`;

        const textInput = new TextInputBuilder()
          .setCustomId('setup_ticket_text')
          .setLabel('Escreva o texto do painel')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setValue(defaultText)
          .setPlaceholder('Insira a descrição que aparecerá no painel de atendimento...');

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
      } catch (error) {
        console.error('[ERRO] Falha ao abrir modal de ticket:', error);
      }
      return;
    }

    if (customId.startsWith('select_chan_type:')) {
      try {
        const channelType = customId.split(':')[1];
        const channelId = interaction.values[0];

        const config = loadConfig();
        if (channelType === 'cart_category') {
          config.cartCategoryId = channelId;
        } else if (channelType === 'command') {
          config.commandChannelId = channelId;
        } else if (channelType === 'logs') {
          config.logsChannelId = channelId;
        }

        saveConfig(config);

        const displayType = channelType === 'cart_category' ? 'categoria carrinho' : channelType === 'command' ? 'comando' : 'logs';

        await interaction.update({
          content: `✅ ${channelType === 'cart_category' ? 'Categoria' : 'Canal'} de **${displayType}** configurado com sucesso para <#${channelId}>!`,
          components: []
        });
      } catch (error) {
        console.error('[ERRO] Falha ao configurar canal:', error);
      }
      return;
    }

    // Trata a seleção de canal no menu dropdown de lançamento de anúncio
    if (customId.startsWith('launch_chan:')) {
      try {
        const productId = customId.split(':')[1];
        const channelId = interaction.values[0];

        const product = loadProducts().find(p => p.id === productId);
        if (!product) {
          await interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });
          return;
        }

        const channel = interaction.guild?.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) {
          await interaction.reply({ content: '❌ Canal inválido ou não suportado.', ephemeral: true });
          return;
        }

        const stockText = product.stock === '*' ? 'Infinito' : product.stock;

        const embedAnnouncement = new EmbedBuilder()
          .setColor('#5865F2') // Blurple do Discord
          .setTitle(`📦 ${product.name}`)
          .setDescription(`${product.description}`)
          .addFields(
            { name: '💰 Preço', value: `\`${product.price}\``, inline: true },
            { name: '📦 Estoque', value: `\`${stockText}\``, inline: true }
          )
          .setTimestamp();

        if (product.imageUrl && product.imageUrl.startsWith('http')) {
          embedAnnouncement.setThumbnail(product.imageUrl);
        }

        const buyButton = new ButtonBuilder()
          .setCustomId(`buy_prod:${product.id}`)
          .setLabel('Comprar')
          .setEmoji('🛒')
          .setStyle(ButtonStyle.Success);

        const buyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buyButton);

        await (channel as any).send({
          embeds: [embedAnnouncement],
          components: [buyRow]
        });

        await interaction.update({
          content: `✅ Produto **${product.name}** lançado com sucesso no canal <#${channelId}>!`,
          components: []
        });
      } catch (error) {
        console.error('[ERRO] Falha ao lançar produto no canal:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao lançar o produto no canal.',
          ephemeral: true
        });
      }
    }
  }

  // Trata a seleção de produto no menu dropdown de lançamento
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket_select_option') {
      // Defer imediatamente para evitar DiscordAPIError[10062] (interação expira em 3s)
      await interaction.deferReply({ ephemeral: true });
      try {
        const option = interaction.values[0];
        const guild = interaction.guild;
        if (!guild) return;

        let optionName = '';
        let channelPrefix = '';

        if (option === 'ticket_option_ggmax') {
          optionName = 'GGMAX';
          channelPrefix = 'ggmax';
        } else if (option === 'ticket_option_logo') {
          optionName = 'Logo';
          channelPrefix = 'logo';
        } else if (option === 'ticket_option_thumbnail') {
          optionName = 'Thumbnail';
          channelPrefix = 'thumbnail';
        } else if (option === 'ticket_option_edicao') {
          optionName = 'Edição';
          channelPrefix = 'edicao';
        } else {
          optionName = 'Suporte';
          channelPrefix = 'suporte';
        }

        const channelName = `ticket-${channelPrefix}-${interaction.user.username}`;

        // Verifica se o usuário já possui um ticket aberto
        const existingTicket = guild.channels.cache.find(
          (ch) => ch.name.startsWith('ticket-') && ch.name.endsWith(`-${interaction.user.username}`)
        );

        if (existingTicket) {
          await interaction.editReply({
            content: `❌ Você já possui um ticket aberto em <#${existingTicket.id}>! Feche o ticket atual antes de abrir outro.`
          });
          return;
        }

        const config = loadConfig();

        // Categoria onde o ticket será criado
        const parentCategory = config.cartCategoryId || '1509362153629552730';

        // Criar canal privado de ticket
        const ticketChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: parentCategory,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
              ]
            },
            {
              id: client.user!.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
              ]
            },
            ...(config.allowedRoleId ? [
              {
                id: config.allowedRoleId,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory,
                  PermissionFlagsBits.AttachFiles,
                  PermissionFlagsBits.EmbedLinks
                ]
              }
            ] : [])
          ]
        });

        // Enviar mensagem de boas-vindas
        const welcomeEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`🎫 Atendimento - ${optionName}`)
          .setDescription(
            `Olá <@${interaction.user.id}>, bem-vindo ao seu atendimento de **${optionName}**!\n\n` +
            `Aguarde um momento enquanto nossa equipe se prepara para lhe atender.\n` +
            `Para agilizar o atendimento, você já pode descrever os detalhes da sua encomenda.`
          )
          .setTimestamp();

        const closeButton = new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Fechar Ticket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton);

        await ticketChannel.send({
          content: `<@${interaction.user.id}>`,
          embeds: [welcomeEmbed],
          components: [row]
        });

        await interaction.editReply({
          content: `✅ Seu ticket foi aberto com sucesso em <#${ticketChannel.id}>!`
        });
      } catch (error) {
        console.error('[ERRO] Falha ao abrir ticket:', error);
        await interaction.editReply({
          content: '❌ Não foi possível abrir o seu ticket. Por favor, tente novamente ou contate um administrador.'
        });
      }
      return;
    }

    if (interaction.customId === 'select_launch_product') {
      try {
        const productId = interaction.values[0];
        const product = loadProducts().find(p => p.id === productId);

        if (!product) {
          await interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true });
          return;
        }

        const channelSelect = new ChannelSelectMenuBuilder()
          .setCustomId(`launch_chan:${productId}`)
          .setPlaceholder('Selecione o canal para enviar o anúncio...')
          .setChannelTypes([ChannelType.GuildText]);

        const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);

        await interaction.update({
          content: `🚀 **Lançamento de Produto - Passo 2**\nVocê selecionou o produto **${product.name}**.\nEscolha o canal onde o anúncio deve ser enviado:`,
          components: [row]
        });
      } catch (error) {
        console.error('[ERRO] Falha ao tratar seleção de produto:', error);
      }
    }
  }

  // Trata o envio do Modal de produto
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('setup_ticket_modal:')) {
      try {
        const parts = interaction.customId.split(':');
        const commandName = parts[1];
        const channelId = parts[2];
        const ticketText = interaction.fields.getTextInputValue('setup_ticket_text');

        const channel = interaction.guild?.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) {
          await interaction.reply({
            content: '❌ Canal inválido ou não encontrado.',
            ephemeral: true
          });
          return;
        }

        // Dividir o texto para pegar o título se necessário, ou usar o padrão da imagem
        // Na imagem, o título principal do embed é "Montier Studio 🤍 | Atendimento"
        // E o restante do texto é a descrição.
        const titleText = "Dark Studio 🖤 | Atendimento";
        let descText = ticketText;

        // Se o texto inserido já começar com "Montier Studio 🤍 | Atendimento", podemos remover do desc para não repetir no título
        if (descText.startsWith(titleText)) {
          descText = descText.substring(titleText.length).trim();
        }

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(titleText)
          .setDescription(descText)
          .setTimestamp();

        let row;
        if (commandName === 'ticket') {
          // Botão simples "Abrir Ticket"
          const openTicketButton = new ButtonBuilder()
            .setCustomId('open_general_ticket')
            .setLabel('Abrir Ticket')
            .setEmoji('📩')
            .setStyle(ButtonStyle.Primary);

          row = new ActionRowBuilder<ButtonBuilder>().addComponents(openTicketButton);
        } else {
          // Menu de seleção com opções GGMAX, logos, thumbnails e edição
          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_select_option')
            .setPlaceholder('Selecione uma opção...')
            .addOptions([
              {
                label: 'GGMAX',
                value: 'ticket_option_ggmax',
                description: 'Solicitar orçamento via GGMAX',
                emoji: '🛒'
              },
              {
                label: 'Logos',
                value: 'ticket_option_logo',
                description: 'Solicitar a criação de uma Logo',
                emoji: '✍️'
              },
              {
                label: 'Thumbnails',
                value: 'ticket_option_thumbnail',
                description: 'Solicitar a criação de uma Thumbnail',
                emoji: '🖼️'
              },
              {
                label: 'Edição',
                value: 'ticket_option_edicao',
                description: 'Solicitar a edição de um vídeo',
                emoji: '🎬'
              }
            ]);

          row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        }

        await (channel as any).send({
          embeds: [embed],
          components: [row]
        });

        await interaction.reply({
          content: `✅ Painel de atendimento enviado com sucesso no canal <#${channelId}>!`,
          ephemeral: true
        });
      } catch (error) {
        console.error('[ERRO] Falha ao enviar painel de tickets:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao enviar o painel. Verifique minhas permissões no canal.',
          ephemeral: true
        });
      }
      return;
    }

    if (interaction.customId === 'add_product_modal') {
      try {
        const name = interaction.fields.getTextInputValue('product_name');
        const description = interaction.fields.getTextInputValue('product_description');
        const price = interaction.fields.getTextInputValue('product_price');
        const stock = interaction.fields.getTextInputValue('product_stock');
        const imageUrl = interaction.fields.getTextInputValue('product_image');

        const products = loadProducts();
        
        const newProduct: Product = {
          id: Date.now().toString(),
          name,
          description,
          price,
          stock,
          imageUrl: imageUrl && imageUrl.trim().startsWith('http') ? imageUrl.trim() : undefined
        };

        products.push(newProduct);
        saveProducts(products);

        const embedConfirm = new EmbedBuilder()
          .setColor('#57F287') // Verde do Discord
          .setTitle('📦 Produto Adicionado com Sucesso!')
          .setDescription(
            `O produto foi salvo no sistema e já está disponível para visualização.\n\n` +
            `🔹 **Nome:** ${name}\n` +
            `🔹 **Descrição:** ${description}\n` +
            `🔹 **Preço:** ${price}\n` +
            `🔹 **Estoque:** ${stock === '*' ? 'Infinito (∞)' : stock}`
          )
          .setTimestamp();

        if (newProduct.imageUrl) {
          embedConfirm.setImage(newProduct.imageUrl);
        }

        await interaction.reply({
          embeds: [embedConfirm],
          ephemeral: true
        });
      } catch (error) {
        console.error('[ERRO] Falha ao salvar produto do modal:', error);
        await interaction.reply({
          content: '❌ Ocorreu um erro ao salvar o produto. Tente novamente.',
          ephemeral: true
        });
      }
    }
  }

  // Trata a seleção de cargos no menu
  if (interaction.isRoleSelectMenu()) {
    if (interaction.customId === 'select_allowed_role') {
      try {
        const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
        if (!isAdmin) {
          await interaction.reply({ 
            content: '❌ Apenas administradores do servidor podem alterar esta configuração!', 
            ephemeral: true 
          });
          return;
        }

        const selectedRoleId = interaction.values[0];
        const selectedRole = interaction.guild?.roles.cache.get(selectedRoleId);

        if (!selectedRole) {
          await interaction.reply({ content: '❌ Cargo não encontrado no servidor.', ephemeral: true });
          return;
        }

        // Salva a configuração no arquivo local config.json
        saveConfig({ 
          ...loadConfig(),
          allowedRoleId: selectedRoleId 
        });

        await interaction.reply({
          content: `✅ Permissão configurada com sucesso!\nAgora, apenas membros com o cargo **${selectedRole.name}** (ou administradores) podem utilizar o bot.`,
          ephemeral: true
        });
      } catch (error) {
        console.error('[ERRO] Falha ao processar menu de cargo:', error);
      }
    }
  }
});

// Evento disparado quando um novo membro entra no servidor da loja
client.on('guildMemberAdd', async (member) => {
  try {
    const welcomeRoleId = '1509221994325999678';
    
    // Tenta adicionar o cargo diretamente ao membro
    await member.roles.add(welcomeRoleId);
    console.log(`[BOT] Cargo de Boas-vindas (ID: ${welcomeRoleId}) adicionado com sucesso ao membro ${member.user.tag}.`);
  } catch (error) {
    console.error(`[ERRO] Falha ao adicionar cargo de boas-vindas ao membro ${member.user.tag}:`, error);
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token || token === 'INSIRA_SEU_TOKEN_AQUI') {
  console.log('\x1b[31m[ERRO] Token do bot não configurado no arquivo .env! Por favor, insira o token correto para inicializar.\x1b[0m');
} else {
  client.login(token);
}
