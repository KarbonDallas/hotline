import { GatewayIntentBits } from 'discord.js'
type Intents = GatewayIntentBits[]
const intents: Intents = [
	GatewayIntentBits.Guilds,
	GatewayIntentBits.GuildMessages,
	GatewayIntentBits.GuildMembers,
]
export default intents
