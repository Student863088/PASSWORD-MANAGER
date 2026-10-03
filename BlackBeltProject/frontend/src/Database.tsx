import { apiRequest } from './api'

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

export async function getUserPasswords(): Promise<VaultItem[]> {
	const response = await apiRequest<{ items: VaultItem[] }>('/vault')
	return response.items
}

export async function saveUserPasswords(items: VaultItem[]): Promise<void> {
	await apiRequest<{ ok: true }>('/vault', {
		method: 'PUT',
		body: JSON.stringify({ items }),
	})
}
