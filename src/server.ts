import 'dotenv/config'

import fs from 'fs'
import path from 'path'
import axios from 'axios'
import https from 'https'
import twilio from 'twilio'
import express from 'express'
import { Request, Response } from 'express'
import bodyParser from 'body-parser'
import OpenAI from 'openai'

const ACCOUNT_SID = process.env.ACCOUNT_SID ?? ''
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? ''
const SERVER_HOST = process.env.SERVER_HOST ?? ''
const SERVER_PORT = process.env.SERVER_PORT ?? ''
const CALL_WEBHOOK = process.env.CALL_WEBHOOK ?? ''
const CONFESSION_WEBHOOK = process.env.CONFESSION_WEBHOOK ?? ''
const NOTIFY_DISCORD = process.env.NOTIFY_DISCORD === 'true' ? true : false
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''

// Exit if ACCOUNT_SID or AUTH_TOKEN is not set
if (!ACCOUNT_SID || !AUTH_TOKEN) {
	console.error('ACCOUNT_SID and AUTH_TOKEN must be set')
	process.exit(1)
}
// Exit if SERVER_HOST or SERVER_PORT is not set
if (!SERVER_HOST || !SERVER_PORT) {
	console.error('SERVER_HOST and SERVER_PORT must be set')
	process.exit(1)
}
// Exit if CALL_WEBHOOK is not set
if (!CALL_WEBHOOK) {
	console.error('CALL_WEBHOOK must be set')
	process.exit(1)
}
// Exit if CONFESSION_WEBHOOK is not set
if (!CONFESSION_WEBHOOK) {
	console.error('CONFESSION_WEBHOOK must be set')
	process.exit(1)
}
// Exit if OPENAI_API_KEY is not set
if (!OPENAI_API_KEY) {
	console.error('OPENAI_API_KEY must be set')
	process.exit(1)
}
const app = express()
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
app.use(bodyParser.urlencoded({ extended: true }))

const sslOptions = {
	key: fs.readFileSync('/etc/letsencrypt/live/akasha.live/privkey.pem'),
	cert: fs.readFileSync('/etc/letsencrypt/live/akasha.live/fullchain.pem'),
}

// serve static files at /assets so Twilio can get the greeting mp3
app.use('/assets', express.static('assets'))
app.use('/confessions', express.static('confessions'))
const recordingsDir = path.join(process.cwd(), 'confessions')
if (!fs.existsSync(recordingsDir)) {
	fs.mkdirSync(recordingsDir)
}

// Receive incoming voice call
app.post('/', (req: Request, res: Response) => {
	console.log('Incoming call:', req.body)
	const body = req.body
	const twiml = new twilio.twiml.VoiceResponse()
	twiml.play(
		`https://${SERVER_HOST}:${SERVER_PORT}/assets/hotline-welcome.mp3`,
	)
	twiml.record({
		maxLength: 60 * 5,
		action: '/recording',
	})
	twiml.hangup()
	res.type('text/xml')
	res.send(twiml.toString())
	if (NOTIFY_DISCORD) {
		const hookData = {
			embeds: [
				{
					title: `Call in Progress`,
					fields: [
						{
							name: 'Number',
							value: req.body.Caller,
							inline: true,
						},
						{
							name: 'City',
							value: body.CallerCity,
							inline: true,
						},
						{
							name: 'State',
							value: body.CallerState,
							inline: true,
						},
						{
							name: 'Zip',
							value: body.CallerZip,
							inline: true,
						},
						{
							name: 'Country',
							value: body.CallerCountry,
							inline: true,
						},
					],
					footer: {
						text: body.CallSid,
					},
				},
			],
		}
		void axios.post(CALL_WEBHOOK, hookData)
	}
})

// Receive recordings from Twilio
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
app.post('/transcription', (req: Request, res: Response) => {
	console.log('Transcription:', req.body)
	res.status(200).send('Transcription saved')
})

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
		let url
		if (SERVER_PORT !== '80') {
			url = `https://${SERVER_HOST}:${SERVER_PORT}/confessions/${recordingSid}.mp3`
		} else {
			url = `https://${SERVER_HOST}/confessions/${recordingSid}.mp3`
		}
		void axios.post(CONFESSION_WEBHOOK, {
			embeds: [
				{
					title: `New Hotline Confession`,
					url,
					fields: [
						{
							name: 'Number',
							value: body.Caller,
							inline: true,
						},
						{
							name: 'City',
							value: body.CallerCity,
							inline: true,
						},
						{
							name: 'State',
							value: body.CallerState,
							inline: true,
						},
						{
							name: 'Zip',
							value: body.CallerZip,
							inline: true,
						},
						{
							name: 'Country',
							value: body.CallerCountry,
							inline: true,
						},
						{
							name: 'Duration',
							value: `${body.RecordingDuration} seconds`,
							inline: true,
						},
						{
							name: 'Recording ID',
							value: `${body.RecordingSid}`,
							inline: true,
						},
						{
							name: 'Transcription',
							value: transcription.text,
						},
					],
					footer: {
						text: callId,
					},
				},
			],
		})
	}
}

// listen on 3001 with SSL
https.createServer(sslOptions, app).listen(SERVER_PORT, () => {
	console.log(`Server listening on https://${SERVER_HOST}:${SERVER_PORT}`)
})
