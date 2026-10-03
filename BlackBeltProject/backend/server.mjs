import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scrypt = promisify(scryptCallback)
const backendDirectory = fileURLToPath(new URL('.', import.meta.url))
const dataDirectory = resolve(process.env.DATA_DIR ?? join(backendDirectory, 'data'))
const usersFile = join(dataDirectory, 'users.csv')
const vaultFile = join(dataDirectory, 'vault.csv')
const demoUsersFile = join(dataDirectory, 'demo_users.csv')
const demoVaultFile = join(dataDirectory, 'demo_vault.csv')
const port = Number(process.env.PORT ?? 3001)
const adminPassword = process.env.Admin_Pass
const sessions = new Map()
const adminSessions = new Set()
const userHeaders = ['id', 'username', 'createdAt', 'salt', 'passwordHash']
const demoUserHeaders = ['id', 'username', 'createdAt']
const vaultHeaders = [
	'userId', 'id', 'name', 'username', 'password', 'website', 'category', 'color',
	'notes', 'createdAt', 'lastEditedAt',
]
const mimeTypes = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.ico': 'image/x-icon',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
}

let writeQueue = Promise.resolve()

function withStoreLock(operation) {
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

	if (field.length || record.length) {
		record.push(field)
		if (record.some((value) => value !== '')) records.push(record)
	}

	const [headers, ...rows] = records
	if (!headers) return []
	return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

async function readRows(file, headers) {
	try {
		const content = await readFile(file, 'utf8')
		return decodeCsv(content)
	} catch (error) {
		if (error.code === 'ENOENT') {
			await writeFileAtomically(file, encodeCsv([], headers))
			return []
		}
		throw error
	}
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

async function writeRows(file, rows, headers) {
	await writeFileAtomically(file, encodeCsv(rows, headers))
}

function normalizedUsername(value) {
	return value.trim().normalize('NFKC').toLowerCase()
}

function publicUser(row) {
	return { id: row.id, username: row.username, createdAt: Number(row.createdAt) }
}

async function hashPassphrase(passphrase, salt) {
	return (await scrypt(passphrase, salt, 64)).toString('hex')
}

function send(response, status, payload) {
	response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
	response.end(JSON.stringify(payload))
}

async function readJson(request) {
	let body = ''
	for await (const chunk of request) {
		body += chunk
		if (body.length > 5 * 1024 * 1024) {
			const error = new Error('Request body is too large.')
			error.status = 413
			throw error
		}
	}
	let parsed
	try {
		parsed = JSON.parse(body || '{}')
	} catch {
		const error = new Error('Request body must be valid JSON.')
		error.status = 400
		throw error
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		const error = new Error('Request body must be a JSON object.')
		error.status = 400
		throw error
	}
	return parsed
}

function authorizedUser(request, response) {
	const authorization = request.headers.authorization
	const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
	const userId = sessions.get(token)
	if (!userId) {
		send(response, 401, { error: 'Please sign in again.' })
		return null
	}
	return userId
}

function authorizedAdmin(request, response) {
	const authorization = request.headers.authorization
	const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
	if (!adminSessions.has(token)) {
		send(response, 401, { error: 'Admin sign-in required.' })
		return false
	}
	return true
}

function passwordsMatch(actual, expected) {
	const actualBuffer = Buffer.from(actual)
	const expectedBuffer = Buffer.from(expected)
	return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

function isValidUsername(username) {
	return /^[a-z0-9._-]{3,32}$/.test(username)
}

function cleanVaultItems(items) {
	if (!Array.isArray(items) || items.length > 5000) {
		const error = new Error('Vault data must be a list of up to 5,000 entries.')
		error.status = 400
		throw error
	}
	return items.map((item) => {
		if (typeof item !== 'object' || item === null || !Number.isFinite(Number(item.id))) {
			const error = new Error('Vault entry is invalid.')
			error.status = 400
			throw error
		}
		return {
			id: Number(item.id),
			name: String(item.name ?? ''),
			username: String(item.username ?? ''),
			password: String(item.password ?? ''),
			url: String(item.url ?? ''),
			category: String(item.category ?? 'Personal'),
			color: String(item.color ?? '#0f766e'),
			notes: String(item.notes ?? ''),
			createdAt: item.createdAt == null ? '' : String(item.createdAt),
			lastEditedAt: item.lastEditedAt == null ? '' : String(item.lastEditedAt),
		}
	})
}

async function serveStatic(request, response, requestPath) {
	const distDirectory = resolve(backendDirectory, '..', 'frontend', 'dist')
	const requestedPath = requestPath === '/' ? 'index.html' : decodeURIComponent(requestPath.slice(1))
	const file = resolve(distDirectory, requestedPath)
	if (file !== distDirectory && !file.startsWith(`${distDirectory}${sep}`)) {
		response.writeHead(403)
		response.end('Forbidden')
		return
	}

	try {
		if (!(await stat(file)).isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' })
	} catch (error) {
		if (error.code !== 'ENOENT') throw error
		if (extname(requestedPath)) {
			response.writeHead(404)
			response.end('Not found')
			return
		}
		return serveStatic(request, response, '/')
	}

	response.writeHead(200, { 'content-type': mimeTypes[extname(file)] ?? 'application/octet-stream' })
	createReadStream(file).pipe(response)
}

const server = createServer(async (request, response) => {
	try {
		const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
		const path = url.pathname

		if (request.method === 'GET' && path === '/api/health') {
			send(response, 200, { ok: true })
			return
		}

		if (request.method === 'POST' && path === '/api/admin/login') {
			if (!adminPassword) {
				send(response, 503, { error: 'Admin access is disabled. Set Admin_Pass on the server.' })
				return
			}
			const body = await readJson(request)
			if (!passwordsMatch(String(body.password ?? ''), adminPassword)) {
				send(response, 401, { error: 'Admin password is incorrect.' })
				return
			}
			const token = randomBytes(32).toString('hex')
			adminSessions.add(token)
			send(response, 200, { token })
			return
		}

		if (path === '/api/admin/session' || path === '/api/admin/accounts' || path.startsWith('/api/admin/accounts/')) {
			if (!authorizedAdmin(request, response)) return

			if (request.method === 'DELETE' && path === '/api/admin/session') {
				const token = request.headers.authorization?.slice(7) ?? ''
				adminSessions.delete(token)
				send(response, 200, { ok: true })
				return
			}

			if (request.method === 'GET' && path === '/api/admin/accounts') {
				const accounts = await withStoreLock(async () => {
					const users = await readRows(usersFile, userHeaders)
					const vaultRows = await readRows(vaultFile, vaultHeaders)
					return users.map((user) => ({
						...publicUser(user),
						entries: vaultRows.filter((row) => row.userId === user.id).map((row) => ({
							id: Number(row.id),
							name: row.name,
							username: row.username,
							website: row.website ?? row.url ?? '',
							category: row.category,
							color: row.color,
							notes: row.notes,
							createdAt: row.createdAt === '' ? null : Number(row.createdAt),
							lastEditedAt: row.lastEditedAt === '' ? null : Number(row.lastEditedAt),
						})),
					}))
				})
				send(response, 200, { accounts })
				return
			}

			if (request.method === 'POST' && path === '/api/admin/accounts') {
				const body = await readJson(request)
				const username = normalizedUsername(String(body.username ?? ''))
				const passphrase = String(body.passphrase ?? '')
				if (!isValidUsername(username)) {
					send(response, 400, { error: 'Username must be 3 to 32 characters and use letters, numbers, dots, underscores, or hyphens.' })
					return
				}
				if (passphrase.length < 8) {
					send(response, 400, { error: 'Passphrase must be at least 8 characters.' })
					return
				}
				const result = await withStoreLock(async () => {
					const users = await readRows(usersFile, userHeaders)
					if (users.some((user) => user.username === username)) {
						return { status: 409, error: 'That username is already in use.' }
					}
					const salt = randomBytes(16).toString('hex')
					const account = {
						id: randomUUID(),
						username,
						createdAt: String(Date.now()),
						salt,
						passwordHash: await hashPassphrase(passphrase, salt),
					}
					await writeRows(usersFile, [...users, account], userHeaders)
					return { account: { ...publicUser(account), entries: [] } }
				})
				if (result.error) {
					send(response, result.status, { error: result.error })
					return
				}
				send(response, 201, { account: result.account })
				return
			}

			const accountPath = path.match(/^\/api\/admin\/accounts\/([^/]+)$/)
			if (accountPath && (request.method === 'PATCH' || request.method === 'DELETE')) {
				const accountId = decodeURIComponent(accountPath[1])
				const body = request.method === 'PATCH' ? await readJson(request) : null
				const result = await withStoreLock(async () => {
					const users = await readRows(usersFile, userHeaders)
					const index = users.findIndex((user) => user.id === accountId)
					if (index < 0) return { status: 404, error: 'Account not found.' }

					if (request.method === 'PATCH') {
						const account = users[index]
						const username = typeof body.username === 'string' && body.username.trim()
							? normalizedUsername(body.username)
							: account.username
						const passphrase = typeof body.passphrase === 'string' ? body.passphrase : ''
						if (!isValidUsername(username)) {
							return { status: 400, error: 'Username must be 3 to 32 characters and use letters, numbers, dots, underscores, or hyphens.' }
						}
						if (users.some((user, userIndex) => userIndex !== index && user.username === username)) {
							return { status: 409, error: 'That username is already in use.' }
						}
						if (passphrase && passphrase.length < 8) {
							return { status: 400, error: 'Passphrase must be at least 8 characters.' }
						}
						if (username === account.username && !passphrase) {
							return { status: 400, error: 'Enter a new username or passphrase to make a change.' }
						}
						const updated = { ...account, username }
						if (passphrase) {
							updated.salt = randomBytes(16).toString('hex')
							updated.passwordHash = await hashPassphrase(passphrase, updated.salt)
						}
						users[index] = updated
						await writeRows(usersFile, users, userHeaders)
						return { account: { ...publicUser(updated), entries: [] } }
					}

					const vaultRows = await readRows(vaultFile, vaultHeaders)
					await writeRows(vaultFile, vaultRows.filter((row) => row.userId !== accountId), vaultHeaders)
					users.splice(index, 1)
					await writeRows(usersFile, users, userHeaders)
					for (const [token, userId] of sessions) {
						if (userId === accountId) sessions.delete(token)
					}
					return { deleted: true }
				})
				if (result.error) {
					send(response, result.status, { error: result.error })
					return
				}
				send(response, 200, result)
				return
			}

			send(response, 404, { error: 'API endpoint not found.' })
			return
		}

		if (request.method === 'POST' && (path === '/api/register' || path === '/api/login')) {
			const body = await readJson(request)
			const username = normalizedUsername(String(body.username ?? ''))
			const passphrase = String(body.passphrase ?? '')
			if (!isValidUsername(username)) {
				send(response, 400, { error: 'Username must be 3 to 32 characters and use letters, numbers, dots, underscores, or hyphens.' })
				return
			}
			if (passphrase.length < 8) {
				send(response, 400, { error: 'Passphrase must be at least 8 characters.' })
				return
			}

			const result = await withStoreLock(async () => {
				const users = await readRows(usersFile, userHeaders)
				const existing = users.find((user) => user.username === username)
				if (path === '/api/register') {
					if (existing) return { status: 409, error: 'That username is already in use.' }
					const salt = randomBytes(16).toString('hex')
					const account = {
						id: randomUUID(),
						username,
						createdAt: String(Date.now()),
						salt,
						passwordHash: await hashPassphrase(passphrase, salt),
					}
					await writeRows(usersFile, [...users, account], userHeaders)
					return { user: publicUser(account) }
				}

				if (!existing) return { status: 401, error: 'Username or passphrase is incorrect.' }
				const actualHash = Buffer.from(await hashPassphrase(passphrase, existing.salt), 'hex')
				const expectedHash = Buffer.from(existing.passwordHash, 'hex')
				if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
					return { status: 401, error: 'Username or passphrase is incorrect.' }
				}
				return { user: publicUser(existing) }
			})

			if (result.error) {
				send(response, result.status, { error: result.error })
				return
			}
			const token = randomBytes(32).toString('hex')
			sessions.set(token, result.user.id)
			send(response, path === '/api/register' ? 201 : 200, { user: result.user, token })
			return
		}

		if (request.method === 'POST' && path === '/api/demo') {
			const demoUsers = await readRows(demoUsersFile, demoUserHeaders)
			if (!demoUsers.some((user) => user.id === 'demo')) {
				send(response, 503, { error: 'The demo account is not available.' })
				return
			}
			const token = randomBytes(32).toString('hex')
			sessions.set(token, 'demo')
			send(response, 200, { user: { id: 'demo', username: 'demo', createdAt: 0 }, token })
			return
		}

		if (path.startsWith('/api/')) {
			const userId = authorizedUser(request, response)
			if (!userId) return

			if (request.method === 'GET' && path === '/api/vault') {
				const rows = await readRows(userId === 'demo' ? demoVaultFile : vaultFile, vaultHeaders)
				const items = rows.filter((row) => row.userId === userId).map((row) => ({
					id: Number(row.id),
					name: row.name,
					username: row.username,
					password: row.password,
					url: row.website ?? row.url ?? '',
					category: row.category,
					color: row.color,
					notes: row.notes,
					createdAt: row.createdAt === '' ? undefined : Number(row.createdAt),
					lastEditedAt: row.lastEditedAt === '' ? null : Number(row.lastEditedAt),
				}))
				send(response, 200, { items })
				return
			}

			if (request.method === 'PUT' && path === '/api/vault') {
				const items = cleanVaultItems((await readJson(request)).items)
				const targetVaultFile = userId === 'demo' ? demoVaultFile : vaultFile
				await withStoreLock(async () => {
					const rows = await readRows(targetVaultFile, vaultHeaders)
					const otherUsers = rows.filter((row) => row.userId !== userId).map((row) => ({
						...row,
						website: row.website ?? row.url ?? '',
					}))
					const ownRows = items.map(({ url, ...item }) => ({ userId, ...item, website: url }))
					await writeRows(targetVaultFile, [...otherUsers, ...ownRows], vaultHeaders)
				})
				send(response, 200, { ok: true })
				return
			}

			if (request.method === 'PATCH' && path === '/api/account' && userId !== 'demo') {
				const body = await readJson(request)
				const result = await withStoreLock(async () => {
					const users = await readRows(usersFile, userHeaders)
					const index = users.findIndex((user) => user.id === userId)
					if (index < 0) return { status: 404, error: 'Account not found.' }
					const account = users[index]
					const currentPassphrase = String(body.currentPassphrase ?? '')
					const actualHash = Buffer.from(await hashPassphrase(currentPassphrase, account.salt), 'hex')
					const expectedHash = Buffer.from(account.passwordHash, 'hex')
					if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
						return { status: 401, error: 'Current passphrase is incorrect.' }
					}

					const username = typeof body.username === 'string' && body.username.trim()
						? normalizedUsername(body.username)
						: account.username
					const passphrase = typeof body.passphrase === 'string' ? body.passphrase : ''
					if (!isValidUsername(username)) {
						return { status: 400, error: 'Username must be 3 to 32 characters and use letters, numbers, dots, underscores, or hyphens.' }
					}
					if (users.some((user, userIndex) => userIndex !== index && user.username === username)) {
						return { status: 409, error: 'That username is already in use.' }
					}
					if (passphrase && passphrase.length < 8) {
						return { status: 400, error: 'New passphrase must be at least 8 characters.' }
					}
					if (username === account.username && !passphrase) {
						return { status: 400, error: 'Enter a new username or passphrase to make a change.' }
					}

					const updated = { ...account, username }
					if (passphrase) {
						updated.salt = randomBytes(16).toString('hex')
						updated.passwordHash = await hashPassphrase(passphrase, updated.salt)
					}
					users[index] = updated
					await writeRows(usersFile, users, userHeaders)
					return { user: publicUser(updated) }
				})
				if (result.error) {
					send(response, result.status, { error: result.error })
					return
				}
				send(response, 200, { user: result.user })
				return
			}

			if (request.method === 'DELETE' && path === '/api/account' && userId !== 'demo') {
				const body = await readJson(request)
				const result = await withStoreLock(async () => {
					const users = await readRows(usersFile, userHeaders)
					const account = users.find((user) => user.id === userId)
					if (!account) return { status: 404, error: 'Account not found.' }
					const actualHash = Buffer.from(await hashPassphrase(String(body.passphrase ?? ''), account.salt), 'hex')
					const expectedHash = Buffer.from(account.passwordHash, 'hex')
					if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
						return { status: 401, error: 'Passphrase is incorrect.' }
					}
					const vaultRows = await readRows(vaultFile, vaultHeaders)
					await writeRows(vaultFile, vaultRows.filter((row) => row.userId !== userId), vaultHeaders)
					await writeRows(usersFile, users.filter((user) => user.id !== userId), userHeaders)
					for (const [token, sessionUserId] of sessions) {
						if (sessionUserId === userId) sessions.delete(token)
					}
					return { deleted: true }
				})
				if (result.error) {
					send(response, result.status, { error: result.error })
					return
				}
				send(response, 200, { deleted: true })
				return
			}

			send(response, 404, { error: 'API endpoint not found.' })
			return
		}

		if (request.method === 'GET') {
			await serveStatic(request, response, path)
			return
		}
		send(response, 405, { error: 'Method not allowed.' })
	} catch (error) {
		console.error('Request failed:', error)
		if (!response.headersSent) {
			send(response, error.status ?? 500, { error: error.status ? error.message : 'The server could not complete the request.' })
		} else {
			response.destroy(error)
		}
	}
})

await mkdir(dataDirectory, { recursive: true })
await withStoreLock(async () => {
	const users = await readRows(usersFile, userHeaders)
	const demoUsers = await readRows(demoUsersFile, demoUserHeaders)
	if (!demoUsers.some((user) => user.id === 'demo')) {
		await writeRows(demoUsersFile, [...demoUsers, { id: 'demo', username: 'demo', createdAt: '0' }], demoUserHeaders)
	}

	const vaultRows = await readRows(vaultFile, vaultHeaders)
	const demoVaultRows = await readRows(demoVaultFile, vaultHeaders)
	const migratedDemoRows = vaultRows.filter((row) => row.userId === 'demo')
	const migratedUserRows = vaultRows.filter((row) => row.userId !== 'demo')
	const normalizeWebsite = ({ url, ...row }) => ({ ...row, website: row.website ?? url ?? '' })
	const existingDemoIds = new Set(demoVaultRows.map((row) => row.id))
	const combinedDemoRows = [
		...demoVaultRows.map(normalizeWebsite),
		...migratedDemoRows.filter((row) => !existingDemoIds.has(row.id)).map(normalizeWebsite),
	]

	const existingVaultHeaders = await readFile(vaultFile, 'utf8').then((content) => content.split(/\r?\n/, 1)[0])
	if (migratedDemoRows.length || existingVaultHeaders !== vaultHeaders.join(',')) {
		await writeRows(vaultFile, migratedUserRows.map(normalizeWebsite), vaultHeaders)
	}
	await writeRows(demoVaultFile, combinedDemoRows, vaultHeaders)
	console.log(`Loaded ${users.length} users and ${combinedDemoRows.length} demo vault entries.`)
})
server.listen(port, () => {
	console.log(`Password Manager API listening on http://localhost:${port}`)
	console.log(`CSV data files: ${dataDirectory}`)
})
