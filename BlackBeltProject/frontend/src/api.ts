const TOKEN_KEY = 'northstar-api-token'

export function setApiToken(token: string): void {
	localStorage.setItem(TOKEN_KEY, token)
}

export function clearApiToken(): void {
	localStorage.removeItem(TOKEN_KEY)
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers)
	headers.set('Content-Type', 'application/json')
	const token = localStorage.getItem(TOKEN_KEY)
	if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)

	const response = await fetch(`/api${path}`, { ...init, headers })
	const result: unknown = await response.json().catch(() => ({}))
	if (!response.ok) {
		const message = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
			? result.error
			: `Request failed (${response.status}).`
		throw new Error(message)
	}
	return result as T
}
