import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium, type LaunchOptions } from 'playwright'

export type ComponentShotBrowserStatus = {
	available: boolean
	channel?: string
	executablePath?: string
	kind?: 'bundled' | 'system'
}

const pathExists = async (candidate: string) => {
	try {
		await fs.access(candidate)
		return true
	} catch (error) {
		const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
		if (code === 'ENOENT' || code === 'ENOTDIR') return false
		throw error
	}
}

const systemBrowserCandidates = (): Array<{ channel?: string; executablePath: string }> => {
	if (process.platform === 'darwin') {
		return [
			{
				channel: 'chrome',
				executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
			},
			{
				channel: 'msedge',
				executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
			},
		]
	}
	if (process.platform === 'win32') {
		return [
			{
				channel: 'chrome',
				executablePath: path.join(
					process.env.PROGRAMFILES ?? '',
					'Google/Chrome/Application/chrome.exe',
				),
			},
			{
				channel: 'msedge',
				executablePath: path.join(
					process.env['PROGRAMFILES(X86)'] ?? '',
					'Microsoft/Edge/Application/msedge.exe',
				),
			},
		]
	}
	return [
		{ channel: 'chrome', executablePath: '/usr/bin/google-chrome' },
		{ channel: 'msedge', executablePath: '/usr/bin/microsoft-edge' },
		{ executablePath: '/usr/bin/chromium' },
		{ executablePath: '/usr/bin/chromium-browser' },
	]
}

export const detectComponentShotBrowser = async (): Promise<ComponentShotBrowserStatus> => {
	const bundledPath = chromium.executablePath()
	if (await pathExists(bundledPath)) {
		return { available: true, executablePath: bundledPath, kind: 'bundled' }
	}
	for (const candidate of systemBrowserCandidates()) {
		if (candidate.executablePath && (await pathExists(candidate.executablePath))) {
			return {
				available: true,
				channel: candidate.channel,
				executablePath: candidate.executablePath,
				kind: 'system',
			}
		}
	}
	return { available: false }
}

export const resolveComponentShotBrowserLaunchOptions = async (
	requestedChannel?: string,
): Promise<LaunchOptions> => {
	if (requestedChannel) return { channel: requestedChannel }
	const browser = await detectComponentShotBrowser()
	if (!browser.available || browser.kind === 'bundled') return {}
	return browser.channel ? { channel: browser.channel } : { executablePath: browser.executablePath }
}
