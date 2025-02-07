const IS_PROXIED = process.env.IS_PROXIED === 'true' ? true : false
const SERVER_HOST = process.env.SERVER_HOST ?? ''
const SERVER_PORT = process.env.SERVER_PORT ?? ''
const SSL_ENABLED = process.env.SSL_ENABLED === 'true' ? true : false

export function publicAssetUrl(path: string): string {
	if (IS_PROXIED) {
		return `https://${SERVER_HOST}/assets/${path}`
	}
	return `${
		SSL_ENABLED ? 'https' : 'http'
	}://${SERVER_HOST}:${SERVER_PORT}/assets/${path}`
}

export function publicRecordingUrl(path: string): string | null {
	if (IS_PROXIED) {
		return `https://${SERVER_HOST}/recordings/${path}`
	}
	if (SSL_ENABLED) {
		if (SERVER_PORT === '443') {
			return `https://${SERVER_HOST}/recordings/${path}`
		}
		return `https://${SERVER_HOST}:${SERVER_PORT}/recordings/${path}`
	}
	if (!SSL_ENABLED) {
		if (SERVER_PORT === '80') {
			return `http://${SERVER_HOST}/recordings/${path}`
		}
		return `http://${SERVER_HOST}:${SERVER_PORT}/recordings/${path}`
	}
	return null
}
