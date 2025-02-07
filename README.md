# hotline

Let people send you voicemails from their phone to your Discord server!

## What is this,,, thing?

This is the application that powers the confession hotline for Midnight Chapel, hosted every Sunday by [Bizarre Miscreant](https://x.com/bizzrmiscreant) and [Karbon Dallas](https://x.com/KarbonDallas).

## Features

1. Receives incoming voice calls from any phone.
1. Plays any audio greeting that you specify.
1. Records the voicemail and save locally.
1. Generates transcription of voicemail.
1. Posts the details into your Discord.

## Integrations

Here's how we accomplish the above features:

### Twilio

We use Twilio to register the phone number that people can call. All we have to do is provide Twilio with the URL of the server hosting this application.

### OpenAI

We use OpenAI's whisper model to generate the transcription of the recording. It's surprisingly accurate and cheaper than Twilio's transcriptions.

### Discord

We make use of two separate webhooks: the first one posts incoming call data as soon as someone calls, and the second one posts a link to the audio recording along with the transcription. Both make use of Discord embeds for readability && convenience!

## Configuration

We have provided a `.env.example` file that contains all of the parameters you need to specify for operation. Here's a brief explanation:
| Variable | Type | Description |
|----------------------|-----------|------------------------------------------------------------------|
| `ACCOUNT_SID` | string | Required for Twilio |
| `AUTH_TOKEN` | string | Your Twilio auth token |
| `SERVER_HOST` | string | Where this app runs |
| `SERVER_PORT` | string | The port to listen on |
| `CALL_WEBHOOK` | string | Discord webhook for incoming call information |
| `RECORDING_WEBHOOK` | string | Discord webhook for recording and transcription info |
| `OPENAI_API_KEY` | string | Necessary for the transcriptions |
| `GREETING_FILE` | string | Local file in the `assets` directory to play when someone calls |
| `RECORDING_TITLE` | string | The label to use for the link to the audio recording |
| `IS_PROXIED` | boolean | Set this to true if you're developing locally via ngrok or similar|
| `SSL_ENABLED` | boolean | Highly recommended for production |
| `NOTIFY_DISCORD` | boolean | Whether to use the webhooks |

## SSL Certificates

If you don't already have your own SSL certificates, just use https://letsencrypt.org. They offer a tool called `certbot` which makes it super easy. More information here: https://certbot.eff.org/instructions
