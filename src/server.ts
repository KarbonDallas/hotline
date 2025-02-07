import fs from 'fs'
import 'dotenv/config'
import path from 'path'
import axios from 'axios'
import https from 'https'
import twilio from 'twilio'
import OpenAI from 'openai'
import express from 'express'
import bodyParser from 'body-parser'
import { Request, Response } from 'express'
import { publicAssetUrl, publicRecordingUrl } from './lib/util.js'

/**
 * Gather all of the environment variables
 */
const ACCOUNT_SID = process.env.ACCOUNT_SID ?? ''
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? ''
const SERVER_HOST = process.env.SERVER_HOST ?? ''
const SERVER_PORT = process.env.SERVER_PORT ?? ''
const CALL_WEBHOOK = process.env.CALL_WEBHOOK ?? ''
const RECORDING_WEBHOOK = process.env.RECORDING_WEBHOOK ?? ''
const NOTIFY_DISCORD = process.env.NOTIFY_DISCORD === 'true' ? true : false
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''
const GREETING_FILE = process.env.GREETING_FILE ?? ''
const RECORDING_TITLE = process.env.RECORDING_TITLE ?? 'New Hotline Voicemail'
const SSL_ENABLED = process.env.SSL_ENABLED === 'true' ? true : false
/**
 * Do a little bit of error checking
 */
if (!ACCOUNT_SID || !AUTH_TOKEN) {
	console.error('Twilio: ACCOUNT_SID and AUTH_TOKEN must be set')
	process.exit(1)
}
if (!SERVER_HOST || !SERVER_PORT) {
	console.error('Server: SERVER_HOST and SERVER_PORT must be set')
	process.exit(1)
}
if (!CALL_WEBHOOK || !RECORDING_WEBHOOK) {
	console.error('Discord: CALL_WEBHOOK and RECORDING_WEBHOOK must be set')
	process.exit(1)
}
if (!OPENAI_API_KEY) {
	console.error('Transcription: OPENAI_API_KEY must be set')
	process.exit(1)
}
if (!fs.existsSync(path.join(process.cwd(), 'assets', GREETING_FILE))) {
	console.error(
		'Greeting: GREETING_FILE specified was not found in assets directory',
	)
	process.exit(1)
}

/**
 * Check for SSL files if we're in production
 */
const privkeyPath = path.join(process.cwd(), 'ssl', 'privkey.pem')
const fullchainPath = path.join(process.cwd(), 'ssl', 'fullchain.pem')
if (process.env.NODE_ENV === 'production' && SSL_ENABLED) {
	if (!fs.existsSync(privkeyPath) || !fs.existsSync(fullchainPath)) {
		console.error(
			`SSL: privkey.pem and fullchain.pem not found in ssl directory`,
		)
		process.exit(1)
	}
}

/**
 * Initialize and configure the Express server
 */
const app = express()
app.use(bodyParser.urlencoded({ extended: true }))
app.use('/assets', express.static('assets'))
app.use('/recordings', express.static('recordings'))

/**
 * Initialize the OpenAI Client
 */
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

/**
 * Set up the recordings directory
 */
const recordingsDir = path.join(process.cwd(), 'recordings')
if (!fs.existsSync(recordingsDir)) {
	fs.mkdirSync(recordingsDir)
}

/**
 * This is the main route that Twilio will hit when a call comes in
 */
app.post('/', (req: Request, res: Response) => {
	console.log('Incoming call:', req.body)
	const body = req.body
	const twiml = new twilio.twiml.VoiceResponse()
	const greetingUrl = publicAssetUrl(GREETING_FILE)
	console.log('Using greeting:', greetingUrl)
	twiml.play(greetingUrl)
	twiml.record({
		maxLength: 60 * 5,
		action: '/recording',
	})
	twiml.hangup()
	res.type('text/xml')
	res.send(twiml.toString())
	if (NOTIFY_DISCORD) {
		// We want to show the following fields in the Discord embed
		const data = [
			'Caller',
			'CallerCity',
			'CallerState',
			'CallerZip',
			'CallerCountry',
		]
		const labels = ['Caller', 'City', 'State', 'Zip', 'Country']
		// Filter out any fields that are empty
		const fields = data
			.filter((key) => body[key])
			.map((key) => {
				return {
					name: labels[data.indexOf(key)],
					value: body[key],
					inline: true,
				}
			})
		void axios.post(CALL_WEBHOOK, {
			embeds: [
				{
					title: `Call in Progress`,
					fields,
					footer: {
						text: body.CallSid,
					},
				},
			],
		})
	}
})

/**
 * This route is hit when Twilio sends the recording information
 */
app.post('/recording', async (req: Request, res: Response) => {
	console.log('Recording:', req.body)
	try {
		const recordingUrl: string | undefined = req.body.RecordingUrl
		const recordingSid: string | undefined = req.body.RecordingSid

		if (!recordingUrl || !recordingSid) {
			console.error('Missing RecordingUrl or RecordingSid')
			res.status(400).send('Missing RecordingUrl or RecordingSid')
			return
		}
		res.status(200).send('Recording saved')

		setTimeout(() => {
			downloadRecording(req)
		}, 3000)
	} catch (error) {
		console.error('Error:', error)

		if (axios.isAxiosError(error)) {
			console.error(
				'Axios error response:',
				error.response?.status,
				error.response?.data,
			)
		}
		res.status(500).send('Failed to save recording')
	}
})

/**
 * This function downloads the recording and sends it to Discord
 */
async function downloadRecording({ body }: Request) {
	const recordingUrl = body.RecordingUrl
	const recordingSid = body.RecordingSid
	const callId = body.CallSid
	console.log('Downloading recording:', recordingSid)
	const response = await axios.get(`${recordingUrl}.mp3`, {
		responseType: 'arraybuffer',
		auth: {
			username: ACCOUNT_SID,
			password: AUTH_TOKEN,
		},
	})
	const filePath = path.join(recordingsDir, `${recordingSid}.mp3`)
	fs.writeFileSync(filePath, response.data)
	console.log(`Recording saved at ${filePath}`)
	if (NOTIFY_DISCORD) {
		const transcription = await openai.audio.transcriptions.create({
			file: fs.createReadStream(filePath),
			model: 'whisper-1',
		})
		const url = publicRecordingUrl(`${recordingSid}.mp3`)
		// We want to show the following fields in the Discord embed
		const data = [
			'Caller',
			'CallerCity',
			'CallerState',
			'CallerZip',
			'CallerCountry',
			'RecordingDuration',
		]
		const labels = ['Caller', 'City', 'State', 'Zip', 'Country', 'Duration']
		// Filter out any fields that are empty
		const fields = data
			.filter((key) => body[key])
			.map((key) => {
				return {
					name: labels[data.indexOf(key)],
					value: body[key],
					inline: true,
				}
			})
		// Add the transcription to the embed
		fields.push({
			name: 'Transcription',
			value: transcription.text,
			inline: false,
		})
		void axios.post(RECORDING_WEBHOOK, {
			embeds: [
				{
					title: RECORDING_TITLE,
					url,
					fields,
					footer: {
						text: callId,
					},
				},
			],
		})
	}
}

/**
 * Listen on the appropriate port and protocol
 */
if (process.env.NODE_ENV === 'production' && SSL_ENABLED) {
	const sslOptions = {
		key: fs.readFileSync(privkeyPath),
		cert: fs.readFileSync(fullchainPath),
	}
	https.createServer(sslOptions, app).listen(SERVER_PORT, () => {
		console.log(`Server listening on https://${SERVER_HOST}:${SERVER_PORT}`)
	})
} else {
	app.listen(SERVER_PORT, () => {
		console.log(`Server listening on http://${SERVER_HOST}:${SERVER_PORT}`)
	})
}
