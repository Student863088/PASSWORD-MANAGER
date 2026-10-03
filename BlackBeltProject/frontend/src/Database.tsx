export type VaultItem = {
	id: number
	name: string
	username: string
	password: string
	url: string
	category: string
	color: string
	notes?: string
	createdAt?: number
	lastEditedAt?: number | null
}

function vaultKey(username: string): string {
	return `northstar-database:${encodeURIComponent(username.trim().toLowerCase())}:passwords`
}

export function initializeUserDatabase(username: string): void {
	const key = vaultKey(username)
	if (localStorage.getItem(key) === null) {
		localStorage.setItem(key, JSON.stringify([] satisfies VaultItem[]))
	}
}

export function getUserPasswords(username: string): VaultItem[] {
	initializeUserDatabase(username)
	try {
		const storedItems: unknown = JSON.parse(localStorage.getItem(vaultKey(username)) ?? '[]')
		if (!Array.isArray(storedItems)) return []

		let didBackfillCreationDate = false
		const items = (storedItems as VaultItem[]).map((item) => {
			if (item.createdAt !== undefined || !Number.isFinite(item.id) || item.id < 1_000_000_000_000) {
				return item
			}

			didBackfillCreationDate = true
			return { ...item, createdAt: item.id }
		})
		if (didBackfillCreationDate) {
			localStorage.setItem(vaultKey(username), JSON.stringify(items))
		}
		return items
	} catch {
		return []
	}
}

export function saveUserPasswords(username: string, items: VaultItem[]): void {
	localStorage.setItem(vaultKey(username), JSON.stringify(items))
}

export function renameUserDatabase(oldUsername: string, newUsername: string): void {
	const oldKey = vaultKey(oldUsername)
	const newKey = vaultKey(newUsername)
	if (oldKey === newKey) return

	const storedPasswords = localStorage.getItem(oldKey)
	if (localStorage.getItem(newKey) !== null) {
		throw new Error('A password vault already exists for that username.')
	}
	if (storedPasswords !== null) {
		localStorage.setItem(newKey, storedPasswords)
		localStorage.removeItem(oldKey)
	}
}
