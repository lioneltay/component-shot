#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createComponentShotMcpServer } from './mcp-server.js'

const service = await createComponentShotMcpServer({
	browserChannel: process.env.COMPONENT_SHOT_BROWSER_CHANNEL,
	projectRoot: process.env.COMPONENT_SHOT_PROJECT_ROOT,
	scenarioDir: process.env.COMPONENT_SHOT_SCENARIO_DIR,
	screenshotsDir: process.env.COMPONENT_SHOT_SCREENSHOTS_DIR,
	setup: process.env.COMPONENT_SHOT_SETUP,
})

let shutdownPromise: Promise<void> | undefined
const shutdown = () => {
	shutdownPromise ??= service.close().then(() => {
		process.exitCode = 0
	})
	return shutdownPromise
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
process.stdin.once('end', () => void shutdown())
process.stdin.once('close', () => void shutdown())
try {
	await service.server.connect(new StdioServerTransport())
} catch (error) {
	await shutdown()
	throw error
}
