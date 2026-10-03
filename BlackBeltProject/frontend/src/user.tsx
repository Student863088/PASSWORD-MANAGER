import { apiRequest, clearApiToken, setApiToken } from './api'

const CURRENT_USER_KEY = 'northstar-current-user'

export type User = {
	id: string
	username: string
	createdAt: number
}

type AuthResponse = {
	user: User
	token: string
}

function normalizeUsername(username: string): string {
	return username.trim().normalize('NFKC').toLowerCase()
}

function profilePictureKey(username: string): string {
	return `northstar-profile-picture:${encodeURIComponent(normalizeUsername(username))}`
}

export function getProfilePicture(username: string): string | null {
	return localStorage.getItem(profilePictureKey(username))
}

export function saveProfilePicture(username: string, image: string | null): void {
	const key = profilePictureKey(username)
	if (image) {
		localStorage.setItem(key, image)
	} else {
		localStorage.removeItem(key)
	}
}

export function removeProfilePicture(username: string): void {
	localStorage.removeItem(profilePictureKey(username))
}

function saveCurrentUser(user: User): void {
	localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
}

async function finishAuthentication(path: '/register' | '/login', username: string, passphrase: string): Promise<User> {
	const response = await apiRequest<AuthResponse>(path, {
		method: 'POST',
		body: JSON.stringify({ username, passphrase }),
	})
	setApiToken(response.token)
	saveCurrentUser(response.user)
	return response.user
}

export function createAccount(username: string, passphrase: string): Promise<User> {
	return finishAuthentication('/register', username, passphrase)
}

export async function verifyAccount(username: string, passphrase: string): Promise<User | null> {
	try {
		return await finishAuthentication('/login', username, passphrase)
	} catch (error) {
		if (error instanceof Error && error.message === 'Username or passphrase is incorrect.') return null
		throw error
	}
}

export async function updateAccount(
	username: string,
	currentPassphrase: string,
	changes: { username?: string; passphrase?: string },
): Promise<User> {
	const response = await apiRequest<{ user: User }>('/account', {
		method: 'PATCH',
		body: JSON.stringify({
			username: changes.username,
			passphrase: changes.passphrase,
			currentPassphrase,
		}),
	})

	if (response.user.username !== username) {
		const profilePicture = getProfilePicture(username)
		if (profilePicture) {
			saveProfilePicture(response.user.username, profilePicture)
			saveProfilePicture(username, null)
		}
	}
	saveCurrentUser(response.user)
	return response.user
}

export async function deleteAccount(passphrase: string, username: string): Promise<void> {
	await apiRequest<{ deleted: boolean }>('/account', {
		method: 'DELETE',
		body: JSON.stringify({ passphrase }),
	})
	removeProfilePicture(username)
	clearCurrentUser()
}

export function getCurrentUser(): User | null {
	const stored = localStorage.getItem(CURRENT_USER_KEY)
	if (!stored) return null

	try {
		const user: unknown = JSON.parse(stored)
		if (
			typeof user === 'object' && user !== null
			&& 'id' in user && typeof user.id === 'string'
			&& 'username' in user && typeof user.username === 'string'
			&& 'createdAt' in user && typeof user.createdAt === 'number'
		) {
			return { id: user.id, username: user.username, createdAt: user.createdAt }
		}
		return null
	} catch {
		return null
	}
}

export function clearCurrentUser(): void {
	localStorage.removeItem(CURRENT_USER_KEY)
	clearApiToken()
}

export async function startDemoSession(): Promise<User> {
	const response = await apiRequest<AuthResponse>('/demo', { method: 'POST' })
	setApiToken(response.token)
	saveCurrentUser(response.user)
	return response.user
}
