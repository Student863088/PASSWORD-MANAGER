import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const backendDirectory = fileURLToPath(new URL('.', import.meta.url))
const dataDirectory = resolve(process.env.DATA_DIR ?? join(backendDirectory, 'data'))
const stores = {
	users: 'users.csv',
	vault: 'vault.csv',
	demoUsers: 'demo_users.csv',
	demoVault: 'demo_vault.csv',
}

let writeQueue = Promise.resolve()

export function withStoreLock(operation) {
	const result = writeQueue.then(operation, operation)
	writeQueue = result.then(() => undefined, () => undefined)
	return result
}

function encodeCsvValue(value) {
	const text = value == null ? '' : String(value)
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function encodeCsv(rows, headers) {
	return `${headers.join(',')}\r\n${rows.map((row) =>
		headers.map((header) => encodeCsvValue(row[header])).join(','),
	).join('\r\n')}${rows.length ? '\r\n' : ''}`
}

function decodeCsv(text) {
	const records = []
	let record = []
	let field = ''
	let quoted = false

	for (let index = 0; index < text.length; index += 1) {
		const character = text[index]
		if (quoted) {
			if (character === '"' && text[index + 1] === '"') {
				field += '"'
				index += 1
			} else if (character === '"') {
				quoted = false
			} else {
				field += character
			}
		} else if (character === '"' && field.length === 0) {
			quoted = true
		} else if (character === ',') {
			record.push(field)
			field = ''
		} else if (character === '\n' || character === '\r') {
			record.push(field)
			if (record.some((value) => value !== '')) records.push(record)
			record = []
			field = ''
			if (character === '\r' && text[index + 1] === '\n') index += 1
		} else {
			field += character
		}
	}

	if (quoted) throw new Error('CSV data contains an unterminated quoted field.')
	if (field.length || record.length) {
		record.push(field)
		if (record.some((value) => value !== '')) records.push(record)
	}

	const [headers, ...rows] = records
	if (!headers) return []
	return rows.map((values) => Object.fromEntries(
		headers.map((header, index) => [header, values[index] ?? '']),
	))
}

function storePath(store) {
	const filename = stores[store]
	if (!filename) throw new Error(`Unknown CSV store: ${store}`)
	return join(dataDirectory, filename)
}

async function writeFileAtomically(file, content) {
	const temporaryFile = `${file}.${randomUUID()}.tmp`
	try {
		await writeFile(temporaryFile, content, 'utf8')
		await rename(temporaryFile, file)
	} catch (error) {
		await unlink(temporaryFile).catch(() => {})
		throw error
	}
}

export async function readRows(store, headers) {
	const file = storePath(store)
	try {
		return decodeCsv(await readFile(file, 'utf8'))
	} catch (error) {
		if (error.code !== 'ENOENT') throw error
		await writeFileAtomically(file, encodeCsv([], headers))
		return []
	}
}

export async function writeRows(store, rows, headers) {
	await writeFileAtomically(storePath(store), encodeCsv(rows, headers))
}

export async function checkDatabase() {
	for (const filename of Object.values(stores)) {
		await stat(join(dataDirectory, filename))
	}
}

export async function initializeDatabase() {
	await mkdir(dataDirectory, { recursive: true })
	await withStoreLock(async () => {
		const userHeaders = ['id', 'username', 'createdAt', 'salt', 'passwordHash']
		const demoUserHeaders = ['id', 'username', 'createdAt']
		const vaultHeaders = [
			'userId', 'id', 'name', 'username', 'password', 'website', 'category', 'color',
			'notes', 'createdAt', 'lastEditedAt',
		]
		const users = await readRows('users', userHeaders)
		const demoUsers = await readRows('demoUsers', demoUserHeaders)
		if (!demoUsers.some((user) => user.id === 'demo')) {
			await writeRows('demoUsers', [...demoUsers, { id: 'demo', username: 'demo', createdAt: '0' }], demoUserHeaders)
		}

		const vaultRows = await readRows('vault', vaultHeaders)
		const demoVaultRows = await readRows('demoVault', vaultHeaders)
		const migratedDemoRows = vaultRows.filter((row) => row.userId === 'demo')
		const migratedUserRows = vaultRows.filter((row) => row.userId !== 'demo')
		const normalizeWebsite = ({ url, ...row }) => ({ ...row, website: row.website ?? url ?? '' })
		const existingDemoIds = new Set(demoVaultRows.map((row) => row.id))
		const combinedDemoRows = [
			...demoVaultRows.map(normalizeWebsite),
			...migratedDemoRows.filter((row) => !existingDemoIds.has(row.id)).map(normalizeWebsite),
		]

		const existingVaultHeaders = (await readFile(storePath('vault'), 'utf8')).split(/\r?\n/, 1)[0]
		if (migratedDemoRows.length || existingVaultHeaders !== vaultHeaders.join(',')) {
			await writeRows('vault', migratedUserRows.map(normalizeWebsite), vaultHeaders)
		}
		await writeRows('demoVault', combinedDemoRows, vaultHeaders)
		console.log(`Loaded ${users.length} users and ${combinedDemoRows.length} demo vault entries.`)
	})
}
