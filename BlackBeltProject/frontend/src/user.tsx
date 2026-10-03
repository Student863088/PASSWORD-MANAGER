import { initializeUserDatabase, renameUserDatabase } from './Database'

const ACCOUNTS_KEY = 'northstar-accounts'
const CURRENT_USER_KEY = 'northstar-current-user'
const PASSWORD_ITERATIONS = 310_000

export type User = {
	username: string
	createdAt: number
}

type StoredAccount = User & {
	salt: string
	passwordHash: string
}

function readAccounts(): StoredAccount[] {
	const stored = localStorage.getItem(ACCOUNTS_KEY)
	if (!stored) return []

	try {
		const accounts: unknown = JSON.parse(stored)
		return Array.isArray(accounts) ? accounts as StoredAccount[] : []
	} catch {
		return []
	}
}

function normalizeUsername(username: string): string {
	return username.trim().toLowerCase()
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

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashPassphrase(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(passphrase),
		'PBKDF2',
		false,
		['deriveBits'],
	)
	const hash = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS },
		key,
		256,
	)
	return toHex(new Uint8Array(hash))
}

function saveCurrentUser(user: User): void {
	localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
}

function saltFromHex(value: string): Uint8Array<ArrayBuffer> {
	const bytes = value.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []
	const salt = new Uint8Array(new ArrayBuffer(bytes.length))
	salt.set(bytes)
	return salt
}

async function matchesPassphrase(account: StoredAccount, passphrase: string): Promise<boolean> {
	return await hashPassphrase(passphrase, saltFromHex(account.salt)) === account.passwordHash
}

export async function createAccount(username: string, passphrase: string): Promise<User> {
	const normalizedUsername = normalizeUsername(username)
	if (!/^[a-z0-9._-]{3,32}$/.test(normalizedUsername)) {
		throw new Error('Username must be 3 to 32 characters and use letters, numbers, dots, underscores, or hyphens.')
	}
	if (passphrase.length < 8) {
		throw new Error('Passphrase must be at least 8 characters.')
	}

	const accounts = readAccounts()
	if (accounts.some((account) => account.username === normalizedUsername)) {
		throw new Error('That username is already in use.')
	}

	const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
	const user = { username: normalizedUsername, createdAt: Date.now() }
	initializeUserDatabase(user.username)
	accounts.push({ ...user, salt: toHex(salt), passwordHash: await hashPassphrase(passphrase, salt) })
	localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
	saveCurrentUser(user)
	return user
}

export async function verifyAccount(username: string, passphrase: string): Promise<User | null> {
	const normalizedUsername = normalizeUsername(username)
	const account = readAccounts().find((storedAccount) => storedAccount.username === normalizedUsername)
	if (!account) return null
	if (!await matchesPassphrase(account, passphrase)) return null

	const user = { username: account.username, createdAt: account.createdAt }
	saveCurrentUser(user)
	return user
}

export async function updateAccount(
	username: string,
	currentPassphrase: string,
	changes: { username?: string; passphrase?: string },
): Promise<User> {
	const normalizedUsername = normalizeUsername(username)
	const accounts = readAccounts()
	const accountIndex = accounts.findIndex((account) => account.username === normalizedUsername)
	if (accountIndex < 0) throw new Error('This demo account cannot be changed.')

	const account = accounts[accountIndex]
	if (!await matchesPassphrase(account, currentPassphrase)) {
		throw new Error('Current passphrase is incorrect.')
	}

	const nextUsername = changes.username?.trim()
		? normalizeUsername(changes.username)
		: normalizedUsername
	if (!/^[a-z0-9._-]{3,32}$/.test(nextUsername)) {
		throw new Error('Username must be 3 to 32 characters and use letters, numbers, dots, underscores, or hyphens.')
	}
	if (accounts.some((candidate, index) => index !== accountIndex && candidate.username === nextUsername)) {
		throw new Error('That username is already in use.')
	}
	if (changes.passphrase && changes.passphrase.length < 8) {
		throw new Error('New passphrase must be at least 8 characters.')
	}
	if (nextUsername === normalizedUsername && !changes.passphrase) {
		throw new Error('Enter a new username or passphrase to make a change.')
	}

	let updatedAccount: StoredAccount = { ...account, username: nextUsername }
	if (changes.passphrase) {
		const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
		updatedAccount = {
			...updatedAccount,
			salt: toHex(salt),
			passwordHash: await hashPassphrase(changes.passphrase, salt),
		}
	}

	if (nextUsername !== normalizedUsername) {
		renameUserDatabase(normalizedUsername, nextUsername)
		const profilePicture = getProfilePicture(normalizedUsername)
		if (profilePicture) {
			saveProfilePicture(nextUsername, profilePicture)
			saveProfilePicture(normalizedUsername, null)
		}
	}
	accounts[accountIndex] = updatedAccount
	localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
	const user = { username: nextUsername, createdAt: account.createdAt }
	saveCurrentUser(user)
	return user
}

export function getCurrentUser(): User | null {
	const stored = localStorage.getItem(CURRENT_USER_KEY)
	if (!stored) return null

	try {
		const user: unknown = JSON.parse(stored)
		if (typeof user === 'object' && user !== null && 'username' in user && 'createdAt' in user) {
			return user as User
		}
		return null
	} catch {
		return null
	}
}

export function clearCurrentUser(): void {
	localStorage.removeItem(CURRENT_USER_KEY)
}

export function startDemoSession(): User {
	const user = { username: 'demo', createdAt: 0 }
	initializeUserDatabase(user.username)
	saveCurrentUser(user)
	return user
}
